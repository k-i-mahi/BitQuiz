import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/db';

const hasDatabase = process.env.HAS_DATABASE === '1';
const CSRF = { 'X-BitQuiz-Request': '1' };

describe.skipIf(!hasDatabase)('question media (integration)', () => {
  let app: Express;
  let organizationId: string;
  let owner: ReturnType<typeof request.agent>;
  let competitionId: string;
  const suffix = Math.random().toString(36).slice(2, 8);

  const detail = async () => (await owner.get(`/api/competitions/${competitionId}`)).body;
  const questionStatus = async (order: number) =>
    (await detail()).rounds[0].questions.find((q: { order: number }) => q.order === order).status;
  const command = async (body: Record<string, unknown>) => {
    const { revision } = await detail();
    return owner
      .post(`/api/competitions/${competitionId}/commands`)
      .set(CSRF)
      .send({ revision, ...body });
  };

  beforeAll(async () => {
    app = createApp();
    const org = await prisma.organization.create({ data: { name: `Media ${suffix}`, slug: `media-${suffix}` } });
    organizationId = org.id;
    await prisma.adminUser.create({
      data: {
        organizationId,
        email: `media-${suffix}@test.local`,
        role: 'OWNER',
        passwordHash: await bcrypt.hash('owner-pass-1', 4),
      },
    });
    owner = request.agent(app);
    await owner.post('/api/auth/login').send({ email: `media-${suffix}@test.local`, password: 'owner-pass-1' });
  });

  afterAll(async () => {
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('stores media on questions and rejects unsafe or inconsistent media', async () => {
    competitionId = (await owner.post('/api/competitions').set(CSRF).send({ title: 'Media quiz' })).body.id;
    const roundId = (await detail()).rounds[0].id;
    const question = (order: number, media: Record<string, unknown>) => ({
      order,
      prompt: 'Which algorithm is shown?',
      code: null,
      codeLanguage: null,
      options: [
        { id: 'A', text: 'BFS' },
        { id: 'B', text: 'Dijkstra' },
      ],
      correctOptionId: 'B',
      explanation: null,
      timeLimitSec: null,
      maxPoints: null,
      minPoints: null,
      ...media,
    });

    const video = await owner
      .post(`/api/competitions/rounds/${roundId}/questions`)
      .set(CSRF)
      .send(question(1, { mediaKind: 'VIDEO', mediaSource: 'LINK', mediaRef: 'https://youtu.be/dQw4w9WgXcQ' }));
    expect(video.status).toBe(201);
    expect(video.body).toMatchObject({ mediaKind: 'VIDEO', mediaSource: 'LINK', mediaOnPhones: false });

    const plain = await owner.post(`/api/competitions/rounds/${roundId}/questions`).set(CSRF).send(question(2, {}));
    expect(plain.body.mediaKind).toBeNull();

    const unsafe = await owner
      .post(`/api/competitions/rounds/${roundId}/questions`)
      .set(CSRF)
      .send(question(3, { mediaKind: 'IMAGE', mediaSource: 'LINK', mediaRef: 'javascript:alert(1)' }));
    expect(unsafe.status).toBe(400);

    const localOnPhones = await owner
      .post(`/api/competitions/rounds/${roundId}/questions`)
      .set(CSRF)
      .send(question(3, { mediaKind: 'IMAGE', mediaSource: 'LOCAL', mediaRef: 'graph.png', mediaOnPhones: true }));
    expect(localOnPhones.status).toBe(400);
  });

  it('starts the video when a question is shown, and the console can pause and restart it', async () => {
    await command({ type: 'OPEN_LOBBY' });
    await command({ type: 'START' });
    expect((await command({ type: 'SHOW_QUESTION' })).status).toBe(200);
    expect(await detail()).toMatchObject({ mediaPlaying: true, mediaRestartCount: 1 });
    // A question with media is shown media-first: text and options wait for the organizer.
    expect(await questionStatus(1)).toBe('MEDIA');

    expect((await command({ type: 'MEDIA_PAUSE' })).status).toBe(200);
    expect((await detail()).mediaPlaying).toBe(false);

    // Video commands don't need the current revision: an old one is fine.
    const restart = await owner
      .post(`/api/competitions/${competitionId}/commands`)
      .set(CSRF)
      .send({ type: 'MEDIA_RESTART', revision: 0 });
    expect(restart.status).toBe(200);
    expect(await detail()).toMatchObject({ mediaPlaying: true, mediaRestartCount: 2 });
  });

  it('shows the question and options on the second step, and opening answering keeps the video going', async () => {
    expect((await command({ type: 'SHOW_QUESTION' })).status).toBe(200);
    expect(await questionStatus(1)).toBe('SHOWN');
    expect((await command({ type: 'OPEN_QUESTION' })).status).toBe(200);
    expect(await questionStatus(1)).toBe('OPEN');
    // Same restart count as before: opening didn't jump the video back to the start.
    expect(await detail()).toMatchObject({ mediaPlaying: true, mediaRestartCount: 2 });
    await command({ type: 'CLOSE_QUESTION' });
    await command({ type: 'REVEAL' });
  });

  it('shows questions without media directly', async () => {
    expect((await command({ type: 'SHOW_QUESTION' })).status).toBe(200);
    expect(await questionStatus(2)).toBe('SHOWN');
  });

  it('refuses video commands for a question without video', async () => {
    const res = await command({ type: 'MEDIA_PLAY' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no video/);
  });
});
