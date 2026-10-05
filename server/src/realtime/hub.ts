import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  ACTIVE_QUESTION_STATUSES,
  SOCKET_EVENTS,
  type GmState,
  type GmStats,
  type OptionId,
  type ParticipantMe,
  type ParticipantState,
  type RunSheetRound,
  type ScreenState,
  type ViewerRole,
} from '@bitquiz/shared';
import { adminFromCookieHeader, participantFromToken } from '../auth/session';
import { env } from '../env';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';
import { getBoards } from '../scoring/leaderboard';
import { toCompetitionView, toQuestionView, type QuestionRecord, type RoundRecord } from './views';

interface SocketData {
  role: ViewerRole;
  competitionId: string;
  participantId?: string;
}

type BqSocket = Socket & { data: SocketData };

let io: Server | null = null;

const room = {
  gm: (competitionId: string) => `c:${competitionId}:gm`,
  screen: (competitionId: string) => `c:${competitionId}:screen`,
  participants: (competitionId: string) => `c:${competitionId}:p`,
  participant: (participantId: string) => `p:${participantId}`,
};

// ---------------------------------------------------------------------------
// Presence and latency (in memory; rebuilt as clients reconnect after a restart)
// ---------------------------------------------------------------------------

/** participantId → number of open sockets. */
const presence = new Map<string, number>();
/** participantId → recent one-way latency samples (ms). */
const latencySamples = new Map<string, number[]>();
const LATENCY_SAMPLE_COUNT = 5;
const LATENCY_PING_INTERVAL_MS = 5_000;

/** Best recent estimate of a participant's one-way network delay. */
export function getLatency(participantId: string): number {
  const samples = latencySamples.get(participantId);
  return samples && samples.length > 0 ? Math.min(...samples) : 0;
}

function recordLatency(participantId: string, oneWayMs: number) {
  const samples = latencySamples.get(participantId) ?? [];
  samples.push(oneWayMs);
  if (samples.length > LATENCY_SAMPLE_COUNT) samples.shift();
  latencySamples.set(participantId, samples);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Same-origin only: the web app is served by this server.
    cors: { origin: false },
  });

  io.use(async (socket, next) => {
    try {
      const data = await authenticate(socket);
      if (!data) return next(new Error('unauthorized'));
      socket.data = data;
      next();
    } catch (error) {
      logger.error({ err: error }, 'Socket authentication failed');
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: BqSocket) => {
    void onConnection(socket);
  });

  setInterval(pingParticipants, LATENCY_PING_INTERVAL_MS).unref();
  return io;
}

export async function closeRealtime(): Promise<void> {
  await io?.close();
  io = null;
}

async function authenticate(socket: Socket): Promise<SocketData | null> {
  const auth = (socket.handshake.auth ?? {}) as { role?: string; competitionId?: string; token?: string };

  if (auth.role === 'gm' && typeof auth.competitionId === 'string') {
    const admin = await adminFromCookieHeader(socket.handshake.headers.cookie);
    if (!admin) return null;
    const competition = await prisma.competition
      .findFirst({
        where: { id: auth.competitionId, organizationId: admin.organizationId },
        select: { id: true },
      })
      .catch(() => null);
    return competition ? { role: 'gm', competitionId: competition.id } : null;
  }

  if (auth.role === 'screen' && typeof auth.token === 'string') {
    const competition = await prisma.competition.findUnique({
      where: { projectorToken: auth.token },
      select: { id: true },
    });
    return competition ? { role: 'screen', competitionId: competition.id } : null;
  }

  if (auth.role === 'participant' && typeof auth.token === 'string') {
    const participant = await participantFromToken(auth.token);
    return participant
      ? { role: 'participant', competitionId: participant.competitionId, participantId: participant.id }
      : null;
  }

  return null;
}

async function onConnection(socket: BqSocket) {
  const { role, competitionId, participantId } = socket.data as SocketData;
  const roleRoom =
    role === 'gm'
      ? room.gm(competitionId)
      : role === 'screen'
        ? room.screen(competitionId)
        : room.participants(competitionId);
  await socket.join(roleRoom);

  // Clock sync: the client sends its time, we answer with ours.
  socket.on(SOCKET_EVENTS.time, (callback: unknown) => {
    if (typeof callback === 'function') callback(Date.now());
  });

  if (participantId) {
    await socket.join(room.participant(participantId));
    presence.set(participantId, (presence.get(participantId) ?? 0) + 1);
    void prisma.participant
      .update({ where: { id: participantId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
    socket.on('disconnect', () => {
      const left = (presence.get(participantId) ?? 1) - 1;
      if (left <= 0) presence.delete(participantId);
      else presence.set(participantId, left);
      requestBroadcast(competitionId);
    });
    requestBroadcast(competitionId);
  } else if (role === 'screen') {
    socket.on('disconnect', () => requestBroadcast(competitionId));
    requestBroadcast(competitionId);
  }

  try {
    const snapshot = await buildSnapshots(competitionId);
    if (!snapshot || !socket.connected) return;
    socket.emit(SOCKET_EVENTS.state, snapshot[role]);
    if (participantId) {
      const me = await buildMeMap(competitionId, snapshot, [participantId]);
      const mine = me.get(participantId);
      if (mine) socket.emit(SOCKET_EVENTS.me, mine);
    }
  } catch (error) {
    logger.error({ err: error, competitionId }, 'Failed to send initial state');
  }
}

function pingParticipants() {
  if (!io) return;
  for (const [, socket] of io.of('/').sockets) {
    const participantId = (socket.data as SocketData | undefined)?.participantId;
    if (!participantId) continue;
    const sentAt = Date.now();
    socket.timeout(3_000).emit(SOCKET_EVENTS.latencyPing, sentAt, (err: Error | null) => {
      if (!err) recordLatency(participantId, (Date.now() - sentAt) / 2);
    });
  }
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

interface Snapshots {
  revision: number;
  gm: GmState;
  screen: ScreenState;
  participant: ParticipantState;
  currentQuestionId: string | null;
  currentQuestionRevealed: boolean;
}

function joinUrl(joinCode: string): string {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/play/${joinCode}`;
}

async function buildSnapshots(competitionId: string): Promise<Snapshots | null> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      rounds: {
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] } },
      },
      participants: {
        orderBy: { joinedAt: 'asc' },
        select: { id: true, name: true, roll: true, kicked: true, tokenHash: true, joinedAt: true },
      },
    },
  });
  if (!competition) return null;

  const serverNow = Date.now();
  const flat: Array<{ question: QuestionRecord; round: RoundRecord }> = competition.rounds.flatMap((round) =>
    round.questions.map((question) => ({ question, round })),
  );
  const counted = flat.filter((f) => f.question.status !== 'VOID');
  const current = flat.find((f) => f.question.id === competition.currentQuestionId) ?? null;

  const distribution: Partial<Record<OptionId, number>> = {};
  let answered = 0;
  if (current) {
    const groups = await prisma.answer.groupBy({
      by: ['optionId'],
      where: { questionId: current.question.id },
      _count: { _all: true },
    });
    for (const g of groups) {
      distribution[g.optionId as OptionId] = g._count._all;
      answered += g._count._all;
    }
  }

  const position = current
    ? { number: counted.findIndex((f) => f.question.id === current.question.id) + 1, total: counted.length }
    : { number: 0, total: counted.length };
  const questionFor = (role: ViewerRole) =>
    current ? toQuestionView(role, current.question, current.round, position, distribution) : null;

  const activeParticipants = competition.participants.filter((p) => !p.kicked);
  const boards = await getBoards(competitionId);
  const competitionView = toCompetitionView(competition);
  const base = {
    revision: competition.revision,
    serverNow,
    competition: competitionView,
    participantCount: activeParticipants.length,
  };

  const runSheet: RunSheetRound[] = competition.rounds.map((round) => ({
    id: round.id,
    order: round.order,
    title: round.title,
    questions: round.questions.map((q) => ({
      id: q.id,
      order: q.order,
      prompt: q.prompt,
      status: q.status,
      correctOptionId: q.correctOptionId as OptionId,
      optionCount: Array.isArray(q.options) ? q.options.length : 0,
    })),
  }));

  const correctOption = current?.question.correctOptionId as OptionId | undefined;
  const stats: GmStats = {
    joined: activeParticipants.length,
    connected: activeParticipants.filter((p) => presence.has(p.id)).length,
    answered,
    correct: correctOption ? (distribution[correctOption] ?? 0) : 0,
  };

  const screenRoom = io?.sockets.adapter.rooms.get(room.screen(competitionId));

  const gm: GmState = {
    ...base,
    role: 'gm',
    question: questionFor('gm'),
    joinUrl: joinUrl(competition.joinCode),
    projectorToken: competition.projectorToken,
    projectorConnected: screenRoom?.size ?? 0,
    runSheet,
    hasPendingQuestions: flat.some((f) => f.question.status === 'PENDING'),
    leaderboard: boards.live,
    participants: competition.participants.map((p) => ({
      id: p.id,
      name: p.name,
      roll: p.roll,
      kicked: p.kicked,
      connected: presence.has(p.id),
      hasDevice: p.tokenHash !== null,
      joinedAt: p.joinedAt.toISOString(),
    })),
    stats,
  };

  const screen: ScreenState = {
    ...base,
    role: 'screen',
    question: questionFor('screen'),
    joinUrl: joinUrl(competition.joinCode),
    leaderboard: boards.public.slice(0, 10).map((r) => ({
      rank: r.rank,
      participantId: r.participantId,
      name: r.name,
      roll: r.roll,
      points: r.points,
      correct: r.correct,
    })),
    answeredCount: answered,
  };

  const participant: ParticipantState = { ...base, role: 'participant', question: questionFor('participant') };

  return {
    revision: competition.revision,
    gm,
    screen,
    participant,
    currentQuestionId: current?.question.id ?? null,
    currentQuestionRevealed: current?.question.status === 'REVEALED',
  };
}

/** Per-participant view: own answer, own result after reveal, own total and public rank. */
async function buildMeMap(
  competitionId: string,
  snapshot: Snapshots,
  participantIds: string[],
): Promise<Map<string, ParticipantMe & { revision: number }>> {
  const result = new Map<string, ParticipantMe & { revision: number }>();
  if (participantIds.length === 0) return result;

  const [participants, answers, boards] = await Promise.all([
    prisma.participant.findMany({
      where: { id: { in: participantIds }, competitionId },
      select: { id: true, name: true, roll: true },
    }),
    snapshot.currentQuestionId
      ? prisma.answer.findMany({
          where: { questionId: snapshot.currentQuestionId, participantId: { in: participantIds } },
          select: { participantId: true, optionId: true, isCorrect: true, points: true, responseMs: true },
        })
      : Promise.resolve([]),
    getBoards(competitionId),
  ]);

  const answerBy = new Map(answers.map((a) => [a.participantId, a]));
  const boardBy = new Map(boards.public.map((r) => [r.participantId, r]));
  const questionId = snapshot.currentQuestionId;

  for (const p of participants) {
    const answer = answerBy.get(p.id);
    const row = boardBy.get(p.id);
    result.set(p.id, {
      revision: snapshot.revision,
      participantId: p.id,
      name: p.name,
      roll: p.roll,
      answer: answer && questionId ? { questionId, optionId: answer.optionId as OptionId } : null,
      result:
        snapshot.currentQuestionRevealed && questionId
          ? {
              questionId,
              isCorrect: answer?.isCorrect ?? false,
              points: answer?.points ?? 0,
              responseMs: answer?.responseMs ?? 0,
            }
          : null,
      totalPoints: row?.points ?? 0,
      rank: row?.rank ?? null,
      participantCount: boards.public.length,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/** Pushes fresh state to every screen of a competition. */
export async function broadcast(competitionId: string): Promise<void> {
  if (!io) return;
  const snapshot = await buildSnapshots(competitionId);
  if (!snapshot) return;

  io.to(room.gm(competitionId)).emit(SOCKET_EVENTS.state, snapshot.gm);
  io.to(room.screen(competitionId)).emit(SOCKET_EVENTS.state, snapshot.screen);
  io.to(room.participants(competitionId)).emit(SOCKET_EVENTS.state, snapshot.participant);

  const sockets = await io.in(room.participants(competitionId)).fetchSockets();
  const ids = [...new Set(sockets.map((s) => (s.data as SocketData).participantId).filter(Boolean))] as string[];
  const me = await buildMeMap(competitionId, snapshot, ids);
  for (const [participantId, view] of me) {
    io.to(room.participant(participantId)).emit(SOCKET_EVENTS.me, view);
  }
}

/** Sends only this participant's own view (after they answer). */
export async function sendMe(competitionId: string, participantId: string): Promise<void> {
  if (!io) return;
  const snapshot = await buildSnapshots(competitionId);
  if (!snapshot) return;
  const me = await buildMeMap(competitionId, snapshot, [participantId]);
  const view = me.get(participantId);
  if (view) io.to(room.participant(participantId)).emit(SOCKET_EVENTS.me, view);
}

const pending = new Map<string, NodeJS.Timeout>();
const BROADCAST_COALESCE_MS = 300;

/**
 * Coalesced broadcast for high-frequency changes (joins, answers, connects): at most one
 * full update per competition every 300 ms.
 */
export function requestBroadcast(competitionId: string): void {
  if (pending.has(competitionId)) return;
  pending.set(
    competitionId,
    setTimeout(() => {
      pending.delete(competitionId);
      broadcast(competitionId).catch((err) => logger.error({ err, competitionId }, 'Broadcast failed'));
    }, BROADCAST_COALESCE_MS),
  );
}

/** Disconnects every socket of a participant (kick or device reset). */
export function disconnectParticipant(participantId: string, reason: 'kicked' | 'reset'): void {
  if (!io) return;
  io.to(room.participant(participantId)).emit(SOCKET_EVENTS.kicked, { reason });
  io.in(room.participant(participantId)).disconnectSockets(true);
  presence.delete(participantId);
}

export function isActiveStatus(status: string): boolean {
  return (ACTIVE_QUESTION_STATUSES as readonly string[]).includes(status);
}
