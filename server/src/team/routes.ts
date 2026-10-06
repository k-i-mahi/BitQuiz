import { Router } from 'express';
import {
  ERROR_CODES,
  inviteSchema,
  updateMemberSchema,
  type InvitationSent,
  type PendingInvitation,
  type TeamMember,
  type TeamView,
} from '@bitquiz/shared';
import { sendInvitationEmail, sendTestEmail } from '../accounts/emails';
import { INVITATION_TTL_MS } from '../accounts/links';
import { adminOf, requireAdmin, requireOwner, type AuthedAdmin } from '../auth/session';
import { prisma, type Tx } from '../lib/db';
import { HttpError, badRequest, idParam, notFound, parse } from '../lib/errors';
import { logger } from '../lib/logger';
import { appUrl, emailMode, sender } from '../lib/mailer';
import { randomToken, sha256 } from '../lib/security';

/** Access control: owners invite people, change roles, suspend, sign out and remove accounts. */
export const teamRouter = Router();
teamRouter.use(requireAdmin, requireOwner);

const conflictError = (message: string) => new HttpError(409, ERROR_CODES.VALIDATION, message);

teamRouter.get('/', async (req, res) => {
  const { organizationId } = adminOf(req);
  const [members, invitations] = await Promise.all([
    prisma.adminUser.findMany({ where: { organizationId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] }),
    prisma.invitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const view: TeamView = {
    members: members.map((m): TeamMember => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      status: m.status,
      emailVerified: m.emailVerifiedAt !== null,
      lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    invitations: invitations.map((i): PendingInvitation => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy ? (i.invitedBy.name ?? i.invitedBy.email) : null,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    email: { mode: emailMode(), sender: emailMode() === 'log' ? null : sender().email || null },
  };
  res.json(view);
});

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/**
 * Emails the invitation and reports the outcome. The invitation stays valid either way and the
 * owner gets the link, so they can share it directly if email is down or lands in spam.
 */
async function deliverInvitation(
  admin: AuthedAdmin,
  invitation: { id: string; email: string; role: TeamMember['role'] },
  token: string,
): Promise<InvitationSent> {
  const inviteUrl = appUrl('/admin/accept-invite', { token });
  try {
    await sendInvitationEmail({
      to: invitation.email,
      token,
      role: invitation.role,
      organizationName: admin.organizationName,
      invitedBy: admin.name ?? admin.email,
    });
    return { id: invitation.id, inviteUrl, emailSent: emailMode() !== 'log', emailError: null };
  } catch (error) {
    logger.error({ err: error }, 'Invitation email failed');
    return {
      id: invitation.id,
      inviteUrl,
      emailSent: false,
      emailError: "The email couldn't be sent. Share the invitation link directly instead.",
    };
  }
}

teamRouter.post('/invitations', async (req, res) => {
  const admin = adminOf(req);
  const { email, role } = parse(inviteSchema, req.body);
  if (await prisma.adminUser.findUnique({ where: { email } })) {
    throw conflictError('This person already has an account.');
  }

  const token = randomToken(32);
  const invitation = await prisma.$transaction(async (tx: Tx) => {
    // A new invitation replaces any earlier pending one for the same address.
    await tx.invitation.updateMany({
      where: { organizationId: admin.organizationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.invitation.create({
      data: {
        organizationId: admin.organizationId,
        email,
        role,
        tokenHash: sha256(token),
        invitedById: admin.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
  });

  res.status(201).json(await deliverInvitation(admin, invitation, token));
});

/** Issues a fresh link (the old one stops working), extends the expiry and emails it again. */
teamRouter.post('/invitations/:id/resend', async (req, res) => {
  const admin = adminOf(req);
  const existing = await prisma.invitation.findFirst({
    where: {
      id: idParam(req.params.id, 'Invitation'),
      organizationId: admin.organizationId,
      acceptedAt: null,
      revokedAt: null,
    },
  });
  if (!existing) throw notFound('Invitation');
  const token = randomToken(32);
  const invitation = await prisma.invitation.update({
    where: { id: existing.id },
    data: { tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITATION_TTL_MS) },
  });
  res.json(await deliverInvitation(admin, invitation, token));
});

/** Sends a test message to the signed-in owner so email settings can be checked from the app. */
teamRouter.post('/test-email', async (req, res) => {
  const admin = adminOf(req);
  if (emailMode() === 'log') {
    throw new HttpError(409, ERROR_CODES.EMAIL_FAILED, 'Email sending is not configured on this server.');
  }
  try {
    await sendTestEmail({ to: admin.email });
  } catch (error) {
    logger.error({ err: error }, 'Test email failed');
    const reason = error instanceof Error ? error.message : 'unknown error';
    const blocked = emailMode() === 'smtp' && /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET/i.test(reason);
    if (blocked) {
      throw new HttpError(
        502,
        ERROR_CODES.EMAIL_FAILED,
        'Could not reach the SMTP server. Some hosts (e.g. Render free) block SMTP ports; use Brevo (BREVO_API_KEY) instead.',
      );
    }
    throw new HttpError(502, ERROR_CODES.EMAIL_FAILED, `Sending failed: ${reason}`);
  }
  res.json({ sentTo: admin.email, via: emailMode() });
});

teamRouter.delete('/invitations/:id', async (req, res) => {
  const admin = adminOf(req);
  const { count } = await prisma.invitation.updateMany({
    where: {
      id: idParam(req.params.id, 'Invitation'),
      organizationId: admin.organizationId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw notFound('Invitation');
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

async function findMember(admin: AuthedAdmin, id: unknown) {
  const member = await prisma.adminUser.findFirst({
    where: { id: idParam(id, 'Member'), organizationId: admin.organizationId },
  });
  if (!member) throw notFound('Member');
  return member;
}

/** The organization must always keep at least one active owner, or nobody could manage access. */
async function assertAnotherActiveOwner(tx: Tx, organizationId: string, excludingId: string) {
  const others = await tx.adminUser.count({
    where: { organizationId, role: 'OWNER', status: 'ACTIVE', id: { not: excludingId } },
  });
  if (others === 0) throw badRequest('There must always be at least one active owner.');
}

teamRouter.patch('/members/:id', async (req, res) => {
  const admin = adminOf(req);
  const member = await findMember(admin, req.params.id);
  const { role, status } = parse(updateMemberSchema, req.body);
  if (member.id === admin.id) throw badRequest("You can't change your own role or status. Ask another owner.");

  await prisma.$transaction(async (tx: Tx) => {
    const losesOwnerAccess =
      member.role === 'OWNER' && member.status === 'ACTIVE' && (role === 'OPERATOR' || status === 'SUSPENDED');
    if (losesOwnerAccess) await assertAnotherActiveOwner(tx, admin.organizationId, member.id);
    await tx.adminUser.update({
      where: { id: member.id },
      data: {
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
        // Suspending signs the person out of every device immediately.
        ...(status === 'SUSPENDED' && member.status !== 'SUSPENDED' ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
  });
  res.status(204).end();
});

teamRouter.post('/members/:id/sign-out', async (req, res) => {
  const admin = adminOf(req);
  const member = await findMember(admin, req.params.id);
  await prisma.adminUser.update({ where: { id: member.id }, data: { sessionVersion: { increment: 1 } } });
  res.status(204).end();
});

teamRouter.delete('/members/:id', async (req, res) => {
  const admin = adminOf(req);
  const member = await findMember(admin, req.params.id);
  if (member.id === admin.id) throw badRequest("You can't remove your own account.");
  await prisma.$transaction(async (tx: Tx) => {
    if (member.role === 'OWNER' && member.status === 'ACTIVE') {
      await assertAnotherActiveOwner(tx, admin.organizationId, member.id);
    }
    await tx.adminUser.delete({ where: { id: member.id } });
  });
  res.status(204).end();
});
