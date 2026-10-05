import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  ERROR_CODES,
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AdminUserView,
  type InvitationInfo,
} from '@bitquiz/shared';
import { sendPasswordResetEmail, sendVerificationEmail } from '../accounts/emails';
import {
  clearLoginFailures,
  consumeLinkToken,
  findOpenInvitation,
  invalidLink,
  issueLinkToken,
  loginLocked,
  recordLoginFailure,
} from '../accounts/links';
import { isUniqueViolation, prisma } from '../lib/db';
import { HttpError, badRequest, parse, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { emailLinkLimiter, loginLimiter } from '../lib/rateLimit';
import { adminOf, clearSessionCookie, requireAdmin, setSessionCookie } from './session';

export const BCRYPT_ROUNDS = 12;

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export const authRouter = Router();

async function sendMe(res: Response, adminId: string) {
  const admin = await prisma.adminUser.findUniqueOrThrow({
    where: { id: adminId },
    include: { organization: { select: { name: true } } },
  });
  const view: AdminUserView = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    emailVerified: admin.emailVerifiedAt !== null,
    organizationName: admin.organization.name,
  };
  res.json(view);
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  if (loginLocked(email)) {
    throw new HttpError(
      429,
      ERROR_CODES.RATE_LIMITED,
      'Too many wrong passwords for this account. Wait 15 minutes or reset your password.',
    );
  }
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !valid) {
    recordLoginFailure(email);
    throw unauthorized('Incorrect email or password');
  }
  if (admin.status !== 'ACTIVE') {
    throw new HttpError(403, ERROR_CODES.ACCOUNT_SUSPENDED, 'This account is suspended. Contact an owner.');
  }
  clearLoginFailures(email);
  await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  setSessionCookie(res, admin.id, admin.sessionVersion);
  await sendMe(res, admin.id);
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------

authRouter.get('/me', requireAdmin, async (req, res) => {
  await sendMe(res, adminOf(req).id);
});

authRouter.patch('/me', requireAdmin, async (req, res) => {
  const { name } = parse(profileSchema, req.body);
  await prisma.adminUser.update({ where: { id: adminOf(req).id }, data: { name } });
  await sendMe(res, adminOf(req).id);
});

authRouter.post('/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminOf(req).id } });
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    throw badRequest('Current password is incorrect');
  }
  // Bumping sessionVersion signs out every other session of this account.
  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), sessionVersion: { increment: 1 } },
  });
  setSessionCookie(res, updated.id, updated.sessionVersion);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

authRouter.post('/verify-email/send', requireAdmin, emailLinkLimiter, async (req, res) => {
  const admin = adminOf(req);
  if (admin.emailVerified) return res.status(204).end();
  const token = await issueLinkToken(admin.id, 'VERIFY_EMAIL');
  try {
    await sendVerificationEmail({ to: admin.email, token });
  } catch (error) {
    logger.error({ err: error }, 'Verification email failed');
    throw new HttpError(502, ERROR_CODES.EMAIL_FAILED, "Couldn't send the email. Try again later.");
  }
  res.status(204).end();
});

authRouter.post('/verify-email', emailLinkLimiter, async (req, res) => {
  const { token } = parse(verifyEmailSchema, req.body);
  const admin = await consumeLinkToken(token, 'VERIFY_EMAIL');
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { emailVerifiedAt: admin.emailVerifiedAt ?? new Date() },
  });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Forgotten password
// ---------------------------------------------------------------------------

authRouter.post('/forgot-password', emailLinkLimiter, async (req, res) => {
  const { email } = parse(forgotPasswordSchema, req.body);
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  // Same response whether or not the account exists, so this can't be used to discover emails.
  if (admin && admin.status === 'ACTIVE') {
    const token = await issueLinkToken(admin.id, 'RESET_PASSWORD');
    sendPasswordResetEmail({ to: admin.email, token }).catch((err) =>
      logger.error({ err }, 'Password reset email failed'),
    );
  }
  res.status(204).end();
});

authRouter.post('/reset-password', emailLinkLimiter, async (req, res) => {
  const { token, password } = parse(resetPasswordSchema, req.body);
  const admin = await consumeLinkToken(token, 'RESET_PASSWORD');
  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      sessionVersion: { increment: 1 },
      // Opening the emailed link proves they own the address.
      emailVerifiedAt: admin.emailVerifiedAt ?? new Date(),
      lastLoginAt: new Date(),
    },
  });
  clearLoginFailures(admin.email);
  setSessionCookie(res, updated.id, updated.sessionVersion);
  await sendMe(res, updated.id);
});

// ---------------------------------------------------------------------------
// Invitations (accepting; sending lives in the team routes)
// ---------------------------------------------------------------------------

authRouter.get('/invitations/:token', emailLinkLimiter, async (req, res) => {
  const invitation = await findOpenInvitation(String(req.params.token));
  const info: InvitationInfo = {
    email: invitation.email,
    role: invitation.role,
    organizationName: invitation.organization.name,
  };
  res.json(info);
});

authRouter.post('/invitations/accept', emailLinkLimiter, async (req, res) => {
  const { token, name, password } = parse(acceptInviteSchema, req.body);
  const invitation = await findOpenInvitation(token);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const admin = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw invalidLink();
      return tx.adminUser.create({
        data: {
          organizationId: invitation.organizationId,
          email: invitation.email,
          name,
          role: invitation.role,
          passwordHash,
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
        },
      });
    });
    setSessionCookie(res, admin.id, admin.sessionVersion);
    res.status(201);
    await sendMe(res, admin.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, ERROR_CODES.VALIDATION, 'An account with this email already exists. Log in instead.');
    }
    throw error;
  }
});
