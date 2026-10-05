import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  ACTIVE_QUESTION_STATUSES,
  SOCKET_EVENTS,
  type GmState,
  type OptionId,
  type ParticipantMe,
  type ParticipantState,
  type RankedRow,
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
const LATENCY_PING_INTERVAL_MS = 10_000;

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
    socket.on('disconnect', () => {
      const left = (presence.get(participantId) ?? 1) - 1;
      if (left <= 0) presence.delete(participantId);
      else presence.set(participantId, left);
      requestStats(competitionId);
    });
    requestStats(competitionId);
  } else if (role === 'screen') {
    socket.on('disconnect', () => requestStats(competitionId));
    requestStats(competitionId);
  }

  try {
    const [core, live] = await Promise.all([getCore(competitionId), getLiveStats(competitionId)]);
    if (!core || !socket.connected) return;
    socket.emit(SOCKET_EVENTS.state, compose(core, live)[role]);
    if (participantId) {
      const mine = (await buildMeMap(competitionId, core, [participantId])).get(participantId);
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
// Snapshot core: everything except live counters, cached until something changes
// ---------------------------------------------------------------------------

interface ParticipantRow {
  id: string;
  name: string;
  roll: string;
  kicked: boolean;
  tokenHash: string | null;
  joinedAt: Date;
}

interface Core {
  revision: number;
  joinCode: string;
  projectorToken: string;
  competition: ReturnType<typeof toCompetitionView>;
  current: { question: QuestionRecord; round: RoundRecord } | null;
  position: { number: number; total: number };
  runSheet: RunSheetRound[];
  hasPendingQuestions: boolean;
  participants: ParticipantRow[];
  activeCount: number;
  liveBoard: RankedRow[];
  publicBoard: RankedRow[];
}

interface LiveStats {
  questionId: string | null;
  distribution: Partial<Record<OptionId, number>>;
  answered: number;
}

/** Incremented whenever the core of a competition changes; cached cores with an older version are rebuilt. */
const coreVersion = new Map<string, number>();
const coreCache = new Map<string, { version: number; promise: Promise<Core | null> }>();

/** Marks the cached state of a competition as stale (commands, joins, edits). */
export function invalidateState(competitionId: string): void {
  coreVersion.set(competitionId, (coreVersion.get(competitionId) ?? 0) + 1);
  statsCache.delete(competitionId);
}

/** Drops every cached state; used after admin edits whose competition isn't known up front. */
export function invalidateAllState(): void {
  coreCache.clear();
  statsCache.clear();
}

/** One shared build per change: concurrent callers wait for the same database round trip. */
function getCore(competitionId: string): Promise<Core | null> {
  const version = coreVersion.get(competitionId) ?? 0;
  const cached = coreCache.get(competitionId);
  if (cached && cached.version === version) return cached.promise;
  const promise = buildCore(competitionId);
  coreCache.set(competitionId, { version, promise });
  promise.catch(() => coreCache.delete(competitionId));
  return promise;
}

async function buildCore(competitionId: string): Promise<Core | null> {
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

  const flat = competition.rounds.flatMap((round) => round.questions.map((question) => ({ question, round })));
  const counted = flat.filter((f) => f.question.status !== 'VOID');
  const current = flat.find((f) => f.question.id === competition.currentQuestionId) ?? null;
  const boards = await getBoards(competitionId);

  return {
    revision: competition.revision,
    joinCode: competition.joinCode,
    projectorToken: competition.projectorToken,
    competition: toCompetitionView(competition),
    current,
    position: current
      ? { number: counted.findIndex((f) => f.question.id === current.question.id) + 1, total: counted.length }
      : { number: 0, total: counted.length },
    runSheet: competition.rounds.map((round) => ({
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
    })),
    hasPendingQuestions: flat.some((f) => f.question.status === 'PENDING'),
    participants: competition.participants,
    activeCount: competition.participants.filter((p) => !p.kicked).length,
    liveBoard: boards.live,
    publicBoard: boards.public,
  };
}

// ---------------------------------------------------------------------------
// Live counters: one cheap query, shared for a short moment
// ---------------------------------------------------------------------------

const STATS_TTL_MS = 250;
const statsCache = new Map<string, { at: number; promise: Promise<LiveStats> }>();

function getLiveStats(competitionId: string): Promise<LiveStats> {
  const cached = statsCache.get(competitionId);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.promise;
  const promise = buildLiveStats(competitionId);
  statsCache.set(competitionId, { at: Date.now(), promise });
  promise.catch(() => statsCache.delete(competitionId));
  return promise;
}

async function buildLiveStats(competitionId: string): Promise<LiveStats> {
  const core = await getCore(competitionId);
  const questionId = core?.current?.question.id ?? null;
  const distribution: Partial<Record<OptionId, number>> = {};
  let answered = 0;
  if (questionId) {
    const groups = await prisma.answer.groupBy({
      by: ['optionId'],
      where: { questionId },
      _count: { _all: true },
    });
    for (const g of groups) {
      distribution[g.optionId as OptionId] = g._count._all;
      answered += g._count._all;
    }
  }
  return { questionId, distribution, answered };
}

// ---------------------------------------------------------------------------
// Composing role views (pure, in memory)
// ---------------------------------------------------------------------------

function joinUrl(joinCode: string): string {
  return `${env.PUBLIC_URL.replace(/\/$/, '')}/play/${joinCode}`;
}

function compose(core: Core, live: LiveStats) {
  const serverNow = Date.now();
  const distribution = live.questionId === core.current?.question.id ? live.distribution : {};
  const answered = live.questionId === core.current?.question.id ? live.answered : 0;
  const questionFor = (role: ViewerRole) =>
    core.current ? toQuestionView(role, core.current.question, core.current.round, core.position, distribution) : null;
  const base = {
    revision: core.revision,
    serverNow,
    competition: core.competition,
    participantCount: core.activeCount,
  };
  const correctOption = core.current?.question.correctOptionId as OptionId | undefined;
  const active = core.participants.filter((p) => !p.kicked);

  const gm: GmState = {
    ...base,
    role: 'gm',
    question: questionFor('gm'),
    joinUrl: joinUrl(core.joinCode),
    projectorToken: core.projectorToken,
    projectorConnected: io?.sockets.adapter.rooms.get(room.screen(core.competition.id))?.size ?? 0,
    runSheet: core.runSheet,
    hasPendingQuestions: core.hasPendingQuestions,
    leaderboard: core.liveBoard,
    participants: core.participants.map((p) => ({
      id: p.id,
      name: p.name,
      roll: p.roll,
      kicked: p.kicked,
      connected: presence.has(p.id),
      hasDevice: p.tokenHash !== null,
      joinedAt: p.joinedAt.toISOString(),
    })),
    stats: {
      joined: active.length,
      connected: active.filter((p) => presence.has(p.id)).length,
      answered,
      correct: correctOption ? (distribution[correctOption] ?? 0) : 0,
    },
  };

  const screen: ScreenState = {
    ...base,
    role: 'screen',
    question: questionFor('screen'),
    joinUrl: joinUrl(core.joinCode),
    leaderboard: core.publicBoard.slice(0, 10).map((r) => ({
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
  return { gm, screen, participant };
}

/** Per-participant view: own answer, own result after reveal, own total and public rank. */
async function buildMeMap(
  competitionId: string,
  core: Core,
  participantIds: string[],
): Promise<Map<string, ParticipantMe & { revision: number }>> {
  const result = new Map<string, ParticipantMe & { revision: number }>();
  if (participantIds.length === 0) return result;

  const questionId = core.current?.question.id ?? null;
  const revealed = core.current?.question.status === 'REVEALED';
  const answers = questionId
    ? await prisma.answer.findMany({
        where: { questionId, participantId: { in: participantIds } },
        select: { participantId: true, optionId: true, isCorrect: true, points: true, responseMs: true },
      })
    : [];

  const answerBy = new Map(answers.map((a) => [a.participantId, a]));
  const boardBy = new Map(core.publicBoard.map((r) => [r.participantId, r]));
  const wanted = new Set(participantIds);

  for (const p of core.participants) {
    if (!wanted.has(p.id)) continue;
    const answer = answerBy.get(p.id);
    const row = boardBy.get(p.id);
    result.set(p.id, {
      revision: core.revision,
      participantId: p.id,
      name: p.name,
      roll: p.roll,
      answer: answer && questionId ? { questionId, optionId: answer.optionId as OptionId } : null,
      result:
        revealed && questionId
          ? {
              questionId,
              isCorrect: answer?.isCorrect ?? false,
              points: answer?.points ?? 0,
              responseMs: answer?.responseMs ?? 0,
            }
          : null,
      totalPoints: row?.points ?? 0,
      rank: row?.rank ?? null,
      participantCount: core.publicBoard.length,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Broadcasting
// ---------------------------------------------------------------------------

/**
 * Runs `task` for a competition so that at most one copy runs at a time; calls made while
 * it runs are folded into a single re-run afterwards.
 */
function singleFlight(
  registry: Map<string, { running: boolean; again: boolean }>,
  task: (id: string) => Promise<void>,
) {
  return async (competitionId: string): Promise<void> => {
    const entry = registry.get(competitionId) ?? { running: false, again: false };
    registry.set(competitionId, entry);
    if (entry.running) {
      entry.again = true;
      return;
    }
    entry.running = true;
    try {
      do {
        entry.again = false;
        await task(competitionId);
      } while (entry.again);
    } finally {
      entry.running = false;
    }
  };
}

const fullRuns = new Map<string, { running: boolean; again: boolean }>();
const statsRuns = new Map<string, { running: boolean; again: boolean }>();

/** Pushes fresh state to every screen of a competition (after a command or other real change). */
export const broadcast = singleFlight(fullRuns, async (competitionId) => {
  if (!io) return;
  const [core, live] = await Promise.all([getCore(competitionId), getLiveStats(competitionId)]);
  if (!core) return;
  const views = compose(core, live);

  io.to(room.gm(competitionId)).emit(SOCKET_EVENTS.state, views.gm);
  io.to(room.screen(competitionId)).emit(SOCKET_EVENTS.state, views.screen);
  io.to(room.participants(competitionId)).emit(SOCKET_EVENTS.state, views.participant);

  const connectedIds = core.participants.filter((p) => presence.has(p.id)).map((p) => p.id);
  const me = await buildMeMap(competitionId, core, connectedIds);
  for (const [participantId, view] of me) {
    io.to(room.participant(participantId)).emit(SOCKET_EVENTS.me, view);
  }
});

/**
 * Refreshes only the Game Master and projector (answer counts, connections). Phones are not
 * sent anything, which keeps answering cheap even with hundreds of participants.
 */
const sendStats = singleFlight(statsRuns, async (competitionId) => {
  if (!io) return;
  statsCache.delete(competitionId);
  const [core, live] = await Promise.all([getCore(competitionId), getLiveStats(competitionId)]);
  if (!core) return;
  const views = compose(core, live);
  io.to(room.gm(competitionId)).emit(SOCKET_EVENTS.state, views.gm);
  io.to(room.screen(competitionId)).emit(SOCKET_EVENTS.state, views.screen);
});

function coalesce(delayMs: number, run: (competitionId: string) => Promise<void>) {
  const pending = new Map<string, NodeJS.Timeout>();
  return (competitionId: string) => {
    if (pending.has(competitionId)) return;
    pending.set(
      competitionId,
      setTimeout(() => {
        pending.delete(competitionId);
        run(competitionId).catch((err) => logger.error({ err, competitionId }, 'Realtime update failed'));
      }, delayMs),
    );
  };
}

/** A participant joined or left the competition: everyone's counts change, at most once a second. */
export const requestBroadcast = (() => {
  const schedule = coalesce(1_000, broadcast);
  return (competitionId: string) => {
    invalidateState(competitionId);
    schedule(competitionId);
  };
})();

/** An answer arrived or a device connected: update the console and projector counters, twice a second. */
export const requestStats = coalesce(500, sendStats);

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
