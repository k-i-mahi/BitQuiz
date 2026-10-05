import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { changePasswordSchema, loginSchema, type AdminUserView } from '@bitquiz/shared';
import { prisma } from '../lib/db';
import { badRequest, parse, unauthorized } from '../lib/errors';
import { loginLimiter } from '../lib/rateLimit';
import { adminOf, clearSessionCookie, requireAdmin, setSessionCookie } from './session';

export const BCRYPT_ROUNDS = 12;

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const admin = await prisma.adminUser.findUnique({
    where: { email },
    include: { organization: { select: { name: true } } },
  });
  const valid = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !valid) throw unauthorized('Incorrect email or password');

  setSessionCookie(res, admin.id, admin.sessionVersion);
  const view: AdminUserView = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    organizationName: admin.organization.name,
  };
  res.json(view);
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAdmin, (req, res) => {
  const admin = adminOf(req);
  const view: AdminUserView = {
    id: admin.id,
    email: admin.email,
    role: admin.role,
    organizationName: admin.organizationName,
  };
  res.json(view);
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
