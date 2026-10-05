import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import type { AdminRole } from '@bitquiz/shared';
import { env, isProduction } from '../env';
import { prisma } from '../lib/db';
import { forbidden, unauthorized } from '../lib/errors';
import { sha256, signSession, verifySession } from '../lib/security';

export const SESSION_COOKIE = 'bq_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Header every state-changing admin request must carry (CSRF defence on top of SameSite). */
export const CSRF_HEADER = 'x-bitquiz-request';

export interface AuthedAdmin {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  emailVerified: boolean;
  organizationId: string;
  organizationName: string;
}

export interface AuthedParticipant {
  id: string;
  competitionId: string;
  name: string;
  roll: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
      participant?: AuthedParticipant;
    }
  }
}

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
};

export function setSessionCookie(res: Response, adminId: string, sessionVersion: number): void {
  const token = signSession(
    { uid: adminId, ver: sessionVersion, exp: Date.now() + SESSION_TTL_MS },
    env.SESSION_SECRET,
  );
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

/** Resolves the admin behind a raw Cookie header; shared by HTTP and Socket.IO. */
export async function adminFromCookieHeader(cookieHeader: string | undefined): Promise<AuthedAdmin | null> {
  const cookies = parseCookie(cookieHeader ?? '');
  const session = verifySession(cookies[SESSION_COOKIE], env.SESSION_SECRET);
  if (!session) return null;
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.uid },
    include: { organization: { select: { name: true } } },
  });
  // Suspension and "sign out everywhere" bump sessionVersion, but check status too in case of a race.
  if (!admin || admin.sessionVersion !== session.ver || admin.status !== 'ACTIVE') return null;
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    emailVerified: admin.emailVerifiedAt !== null,
    organizationId: admin.organizationId,
    organizationName: admin.organization.name,
  };
}

/**
 * Device tokens are looked up on every answer, so verified ones are kept in memory briefly.
 * Kicks, device resets and renames clear the entry immediately via forgetParticipant().
 */
const PARTICIPANT_CACHE_TTL_MS = 60_000;
const participantCache = new Map<string, { participant: AuthedParticipant; at: number }>();

export function forgetParticipant(participantId: string): void {
  for (const [hash, entry] of participantCache) {
    if (entry.participant.id === participantId) participantCache.delete(hash);
  }
}

export async function participantFromToken(token: string | undefined): Promise<AuthedParticipant | null> {
  if (!token) return null;
  const hash = sha256(token);
  const cached = participantCache.get(hash);
  if (cached && Date.now() - cached.at < PARTICIPANT_CACHE_TTL_MS) return cached.participant;

  const participant = await prisma.participant.findUnique({ where: { tokenHash: hash } });
  if (!participant || participant.kicked) {
    participantCache.delete(hash);
    return null;
  }
  const authed: AuthedParticipant = {
    id: participant.id,
    competitionId: participant.competitionId,
    name: participant.name,
    roll: participant.roll,
  };
  participantCache.set(hash, { participant: authed, at: Date.now() });
  return authed;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const admin = await adminFromCookieHeader(req.headers.cookie);
  if (!admin) return next(unauthorized());
  if (!SAFE_METHODS.has(req.method) && req.get(CSRF_HEADER) !== '1') {
    return next(forbidden('Missing request header'));
  }
  req.admin = admin;
  next();
};

export const requireOwner: RequestHandler = (req, _res, next) => {
  if (req.admin?.role !== 'OWNER') return next(forbidden('Only an owner can do that'));
  next();
};

export function bearerToken(req: Request): string | undefined {
  const header = req.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
}

export const requireParticipant: RequestHandler = async (req, _res, next) => {
  const participant = await participantFromToken(bearerToken(req));
  if (!participant) return next(unauthorized('Your session has ended. Please join again.'));
  req.participant = participant;
  next();
};

/** Narrowing helpers for route handlers that run after the auth middleware. */
export function adminOf(req: Request): AuthedAdmin {
  if (!req.admin) throw unauthorized();
  return req.admin;
}

export function participantOf(req: Request): AuthedParticipant {
  if (!req.participant) throw unauthorized();
  return req.participant;
}
