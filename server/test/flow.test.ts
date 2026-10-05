import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { io as connect, type Socket } from 'socket.io-client';
import { QUESTION_CSV_TEMPLATE, type GmState, type ParticipantMe, type ParticipantState } from '@bitquiz/shared';
import { createApp } from '../src/app';
import { cancelAllTimers } from '../src/engine/timers';
import { prisma } from '../src/lib/db';
import { closeRealtime, initRealtime } from '../src/realtime/hub';

const hasDatabase = process.env.HAS_DATABASE === '1';
const CSRF = { 'X-BitQuiz-Request': '1' };

describe.skipIf(!hasDatabase)('full quiz flow (integration)', () => {
  let server: Server;
  let baseUrl: string;
  let agent: ReturnType<typeof request.agent>;
  let organizationId: string;
  let competitionId: string;
  let joinCode: string;
  const sockets: Socket[] = [];

  const command = async (body: Record<string, unknown>, expectStatus = 200) => {
    const revision = body.revision ?? (await agent.get(`/api/competitions/${competitionId}`)).body.revision;
    const res = await agent
      .post(`/api/competitions/${competitionId}/commands`)
      .set(CSRF)
      .send({ ...body, revision });
    expect(res.status, JSON.stringify(res.body)).toBe(expectStatus);
    return res;
  };

  const join = (name: string, roll: string, token?: string) => {
    const req = request(server).post('/api/join').send({ joinCode, name, roll });
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  const answer = (token: string, questionId: string, optionId: string) =>
    request(server)
      .post('/api/answers')
      .set('Authorization', `Bearer ${token}`)
      .send({ questionId, optionId, clientRequestId: `req-${Math.random().toString(36).slice(2)}` });

  const currentQuestionId = async () =>
    (await prisma.competition.findUniqueOrThrow({ where: { id: competitionId } })).currentQuestionId!;

  /** Resolves with the first event matching the predicate. */
  const waitFor = <T>(socket: Socket, event: string, predicate: (payload: T) => boolean) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 5_000);
      const handler = (payload: T) => {
        if (predicate(payload)) {
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(payload);
        }
      };
      socket.on(event, handler);
    });

  beforeAll(async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const org = await prisma.organization.create({ data: { name: `Test Org ${suffix}`, slug: `test-${suffix}` } });
    organizationId = org.id;
    await prisma.adminUser.create({
      data: {
        organizationId,
        email: `gm-${suffix}@test.local`,
        role: 'OWNER',
        passwordHash: await bcrypt.hash('password123', 4),
      },
    });

    server = createServer(createApp());
    initRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

    agent = request.agent(server);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: `gm-${suffix}@test.local`, password: 'password123' });
    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    cancelAllTimers();
    await closeRealtime();
    await new Promise((resolve) => server?.close(resolve));
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('rejects admin writes without the CSRF header and wrong passwords', async () => {
    expect((await agent.post('/api/competitions').send({ title: 'Nope' })).status).toBe(403);
    const bad = await request(server).post('/api/auth/login').send({ email: 'nobody@test.local', password: 'x' });
    expect(bad.status).toBe(401);
  });

  it('creates a competition and imports questions from CSV', async () => {
    const created = await agent.post('/api/competitions').set(CSRF).send({ title: 'Integration Quiz' });
    expect(created.status).toBe(201);
    competitionId = created.body.id;

    const bad = await agent
      .post(`/api/competitions/${competitionId}/import`)
      .set(CSRF)
      .send({ csv: 'round,question,option_a,option_b,correct\n1,Q,a,b,Z', mode: 'replace' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.errors[0].row).toBe(2);

    const imported = await agent
      .post(`/api/competitions/${competitionId}/import`)
      .set(CSRF)
      .send({ csv: QUESTION_CSV_TEMPLATE, mode: 'replace' });
    expect(imported.body).toEqual({ imported: 3 });

    const detail = await agent.get(`/api/competitions/${competitionId}`);
    joinCode = detail.body.joinCode;
    expect(detail.body.rounds).toHaveLength(2);
  });

  it('only lets people join once the lobby is open, one device per roll', async () => {
    expect((await join('Early Bird', '2107000')).status).toBe(403);
    await command({ type: 'OPEN_LOBBY' });

    expect((await join('R', '2107001')).status).toBe(400);
    expect((await join('Rahim Ahmed', '21070')).status).toBe(400);

    const rahim = await join('Rahim Ahmed', '2107001');
    expect(rahim.status).toBe(201);
    const nila = await join('Nila Das', '2107044');
    expect(nila.status).toBe(201);

    const impostor = await join('Someone Else', '2107001');
    expect(impostor.status).toBe(409);
    expect(impostor.body.error.code).toBe('ROLL_TAKEN');

    const rejoin = await join('Rahim Ahmed', '2107001', rahim.body.token);
    expect(rejoin.status).toBe(200);
    expect(rejoin.body.token).toBe(rahim.body.token);
  });

  it('runs a question live: timer, answers, reveal, speed scoring and regrade', async () => {
    const rahimToken = (await join('Rahim Ahmed', '2107001', undefined)).body.token as string | undefined;
    expect(rahimToken).toBeUndefined(); // roll already taken without the token

    const tokens = await prisma.participant.findMany({ where: { competitionId } });
    expect(tokens).toHaveLength(2);

    // Fresh tokens via device reset, exercising the GM flow for a changed phone.
    const rahim = tokens.find((p) => p.roll === '2107001')!;
    const nila = tokens.find((p) => p.roll === '2107044')!;
    await command({ type: 'RESET_DEVICE', participantId: rahim.id });
    await command({ type: 'RESET_DEVICE', participantId: nila.id });
    const rahimJoin = await join('Rahim Ahmed', '2107001');
    const nilaJoin = await join('Nila Das', '2107044');
    expect(rahimJoin.status).toBe(200);
    const rToken = rahimJoin.body.token as string;
    const nToken = nilaJoin.body.token as string;

    const phone = connect(baseUrl, { auth: { role: 'participant', token: rToken }, transports: ['websocket'] });
    sockets.push(phone);
    const lobbyState = await waitFor<ParticipantState>(phone, 'state', () => true);
    expect(lobbyState.competition.status).toBe('LOBBY');

    await command({ type: 'START' });
    await command({ type: 'START', revision: 0 }, 409);

    const opened = waitFor<ParticipantState>(phone, 'state', (s) => s.question?.status === 'OPEN');
    await command({ type: 'OPEN_QUESTION' });
    const live = await opened;
    expect(live.question?.correctOptionId).toBeUndefined();
    expect(live.question?.options.map((o) => o.id)).toEqual(['A', 'B', 'C', 'D']);

    const q1 = await currentQuestionId();
    const first = await answer(rToken, q1, 'B');
    expect(first.body).toMatchObject({ optionId: 'B', alreadyAnswered: false });
    const again = await answer(rToken, q1, 'C');
    expect(again.body).toMatchObject({ optionId: 'B', alreadyAnswered: true });
    expect((await answer(nToken, q1, 'A')).status).toBe(200);

    // Answers only refresh the console counters; phones learn "locked" from the HTTP response.
    const gmStats = await agent.get(`/api/competitions/${competitionId}/leaderboard`);
    expect(gmStats.status).toBe(200);
    const answers = await prisma.answer.count({ where: { questionId: q1 } });
    expect(answers).toBe(2);

    // The next full update carries the participant's own answer, still without a result before reveal.
    const closedUpdate = waitFor<ParticipantMe>(phone, 'me', (m) => m.answer?.optionId === 'B');
    await command({ type: 'CLOSE_QUESTION' });
    expect((await closedUpdate).result).toBeNull();
    const revealed = waitFor<ParticipantMe>(phone, 'me', (m) => m.result !== null);
    await command({ type: 'REVEAL' });
    const result = await revealed;
    expect(result.result?.isCorrect).toBe(true);
    expect(result.result!.points).toBeGreaterThanOrEqual(50);
    expect(result.result!.points).toBeLessThanOrEqual(100);
    expect(result.rank).toBe(1);

    await command({ type: 'REGRADE', questionId: q1, correctOptionId: 'A' });
    const board = await agent.get(`/api/competitions/${competitionId}/leaderboard`);
    expect(board.body.rows[0]).toMatchObject({ roll: '2107044', rank: 1, correct: 1 });
    expect(board.body.rows[1]).toMatchObject({ roll: '2107001', points: 0, wrong: 1 });
  });

  it('rejects answers after an early close plus grace, and handles void and finish', async () => {
    const tokens = await prisma.participant.findMany({ where: { competitionId } });
    await command({ type: 'RESET_DEVICE', participantId: tokens[0]!.id });
    const token = (await join(tokens[0]!.name, tokens[0]!.roll)).body.token as string;

    await command({ type: 'SHOW_QUESTION' });
    const q2 = await currentQuestionId();
    expect((await answer(token, q2, 'A')).body.error.code).toBe('NOT_ACCEPTING');

    await command({ type: 'OPEN_QUESTION' });
    await command({ type: 'CLOSE_QUESTION' });
    await new Promise((r) => setTimeout(r, 1_100));
    expect((await answer(token, q2, 'A')).body.error.code).toBe('TOO_LATE');

    await command({ type: 'FINISH' }, 409);
    await command({ type: 'VOID_QUESTION', questionId: q2 });
    await command({ type: 'FINISH' });

    const gm = connect(baseUrl, {
      auth: { role: 'gm', competitionId },
      transports: ['websocket'],
      extraHeaders: { cookie: (await loginCookie()) ?? '' },
    });
    sockets.push(gm);
    const gmState = await waitFor<GmState>(gm, 'state', () => true);
    expect(gmState.competition.status).toBe('FINISHED');
    expect(gmState.runSheet.flatMap((r) => r.questions).map((q) => q.status)).toEqual(['REVEALED', 'VOID', 'PENDING']);

    const csv = await agent.get(`/api/competitions/${competitionId}/results.csv`);
    expect(csv.text).toContain('2107044');
  });

  it('kicked participants lose access immediately', async () => {
    const participant = await prisma.participant.findFirstOrThrow({ where: { competitionId, roll: '2107044' } });
    await command({ type: 'KICK', participantId: participant.id });
    const again = await join('Nila Das', '2107044');
    expect(again.body.error.code).toBe('KICKED');
  });

  async function loginCookie(): Promise<string | undefined> {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { organizationId } });
    const res = await request(server).post('/api/auth/login').send({ email: admin.email, password: 'password123' });
    return res.headers['set-cookie']?.[0]?.split(';')[0];
  }
});
