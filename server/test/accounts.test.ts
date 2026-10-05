import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/db';
import { devOutbox } from '../src/lib/mailer';

const hasDatabase = process.env.HAS_DATABASE === '1';
const CSRF = { 'X-BitQuiz-Request': '1' };

/** Token from the most recent email "sent" to an address. */
function lastLinkToken(to: string): string {
  const email = [...devOutbox].reverse().find((m) => m.to === to);
  if (!email) throw new Error(`no email to ${to}`);
  const token = new URL(email.action.url).searchParams.get('token');
  if (!token) throw new Error('no token in link');
  return token;
}

describe.skipIf(!hasDatabase)('organizer accounts (integration)', () => {
  let app: Express;
  let organizationId: string;
  const suffix = Math.random().toString(36).slice(2, 8);
  const ownerEmail = `owner-${suffix}@test.local`;
  const inviteeEmail = `operator-${suffix}@test.local`;
  let owner: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = createApp();
    const org = await prisma.organization.create({ data: { name: `Accounts ${suffix}`, slug: `accounts-${suffix}` } });
    organizationId = org.id;
    await prisma.adminUser.create({
      data: { organizationId, email: ownerEmail, role: 'OWNER', passwordHash: await bcrypt.hash('owner-pass-1', 4) },
    });
    owner = request.agent(app);
    const login = await owner
      .post('/api/auth/login')
      .send({ email: ` ${ownerEmail.toUpperCase()} `, password: 'owner-pass-1' });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ email: ownerEmail, role: 'OWNER', emailVerified: false });
  });

  afterAll(async () => {
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it('verifies the owner email through an emailed link', async () => {
    expect((await owner.post('/api/auth/verify-email/send').set(CSRF)).status).toBe(204);
    const token = lastLinkToken(ownerEmail);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(204);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400); // single use
    expect((await owner.get('/api/auth/me')).body.emailVerified).toBe(true);
  });

  it('invites an organizer who sets their own password', async () => {
    const invite = await owner.post('/api/team/invitations').set(CSRF).send({ email: inviteeEmail, role: 'OPERATOR' });
    expect(invite.status).toBe(201);
    const token = lastLinkToken(inviteeEmail);

    const info = await request(app).get(`/api/auth/invitations/${token}`);
    expect(info.body).toMatchObject({ email: inviteeEmail, role: 'OPERATOR' });

    const invitee = request.agent(app);
    const accepted = await invitee
      .post('/api/auth/invitations/accept')
      .send({ token, name: 'Nila Das', password: 'operator-pass-1' });
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({
      email: inviteeEmail,
      name: 'Nila Das',
      role: 'OPERATOR',
      emailVerified: true,
    });
    expect((await invitee.get('/api/auth/me')).status).toBe(200);

    // The link only works once, and operators can't manage the team.
    expect(
      (await request(app).post('/api/auth/invitations/accept').send({ token, name: 'X Y', password: 'whatever-123' }))
        .status,
    ).toBe(400);
    expect((await invitee.get('/api/team')).status).toBe(403);
  });

  it('rejects inviting someone who already has an account and lets owners revoke invitations', async () => {
    expect(
      (await owner.post('/api/team/invitations').set(CSRF).send({ email: inviteeEmail, role: 'OWNER' })).status,
    ).toBe(409);

    const other = `pending-${suffix}@test.local`;
    const created = await owner.post('/api/team/invitations').set(CSRF).send({ email: other, role: 'OPERATOR' });
    const token = lastLinkToken(other);
    expect((await owner.get('/api/team')).body.invitations.map((i: { email: string }) => i.email)).toContain(other);
    expect((await owner.delete(`/api/team/invitations/${created.body.id}`).set(CSRF)).status).toBe(204);
    expect((await request(app).get(`/api/auth/invitations/${token}`)).status).toBe(400);
  });

  it('resets a forgotten password and signs out old sessions', async () => {
    const oldSession = request.agent(app);
    await oldSession.post('/api/auth/login').send({ email: inviteeEmail, password: 'operator-pass-1' });

    // Unknown emails get the same answer, so the endpoint can't reveal who has an account.
    expect(
      (
        await request(app)
          .post('/api/auth/forgot-password')
          .send({ email: `nobody-${suffix}@test.local` })
      ).status,
    ).toBe(204);
    expect((await request(app).post('/api/auth/forgot-password').send({ email: inviteeEmail })).status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const token = lastLinkToken(inviteeEmail);

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass-2' });
    expect(reset.status).toBe(200);
    expect((await oldSession.get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).post('/api/auth/login').send({ email: inviteeEmail, password: 'operator-pass-1' })).status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/auth/login').send({ email: inviteeEmail, password: 'brand-new-pass-2' })).status,
    ).toBe(200);
  });

  it('suspends and reactivates members, and always keeps an active owner', async () => {
    const member = await prisma.adminUser.findUniqueOrThrow({ where: { email: inviteeEmail } });
    const session = request.agent(app);
    await session.post('/api/auth/login').send({ email: inviteeEmail, password: 'brand-new-pass-2' });

    expect((await owner.patch(`/api/team/members/${member.id}`).set(CSRF).send({ status: 'SUSPENDED' })).status).toBe(
      204,
    );
    expect((await session.get('/api/auth/me')).status).toBe(401);
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: inviteeEmail, password: 'brand-new-pass-2' });
    expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');

    expect(
      (await owner.patch(`/api/team/members/${member.id}`).set(CSRF).send({ status: 'ACTIVE', role: 'OWNER' })).status,
    ).toBe(204);
    const self = await prisma.adminUser.findUniqueOrThrow({ where: { email: ownerEmail } });
    expect((await owner.patch(`/api/team/members/${self.id}`).set(CSRF).send({ role: 'OPERATOR' })).status).toBe(400);

    // With two owners, one may be demoted; the remaining one can't be.
    expect((await owner.patch(`/api/team/members/${member.id}`).set(CSRF).send({ role: 'OPERATOR' })).status).toBe(204);
    expect((await owner.delete(`/api/team/members/${member.id}`).set(CSRF)).status).toBe(204);
    expect((await owner.get('/api/team')).body.members).toHaveLength(1);
  });
});
