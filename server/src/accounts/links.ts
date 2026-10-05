import type { TokenPurpose } from '@prisma/client';
import { ERROR_CODES } from '@bitquiz/shared';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/errors';
import { randomToken, sha256 } from '../lib/security';

export const LINK_TTL_MS: Record<TokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const invalidLink = (message = 'This link is invalid or has expired. Request a new one.') =>
  new HttpError(400, ERROR_CODES.LINK_INVALID, message);

/** Creates a single-use emailed link token; any earlier unused token for the same purpose stops working. */
export async function issueLinkToken(adminId: string, purpose: TokenPurpose): Promise<string> {
  const token = randomToken(32);
  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { adminId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: {
        adminId,
        purpose,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + LINK_TTL_MS[purpose]),
      },
    }),
  ]);
  return token;
}

/**
 * Marks a link token as used and returns its account. The conditional update makes the
 * token single-use even if the link is opened twice at the same moment.
 */
export async function consumeLinkToken(token: string, purpose: TokenPurpose) {
  const record = await prisma.authToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { admin: true },
  });
  if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt < new Date()) {
    throw invalidLink();
  }
  const claimed = await prisma.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw invalidLink();
  if (record.admin.status !== 'ACTIVE') {
    throw new HttpError(403, ERROR_CODES.ACCOUNT_SUSPENDED, 'This account is suspended. Contact an owner.');
  }
  return record.admin;
}

/** Finds a pending, unexpired invitation by the token in its link. */
export async function findOpenInvitation(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { organization: { select: { name: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
    throw invalidLink('This invitation is invalid, already used or expired. Ask an owner to send a new one.');
  }
  return invitation;
}

// ---------------------------------------------------------------------------
// Per-email login throttle (complements the per-IP limit)
// ---------------------------------------------------------------------------

const FAILURE_LIMIT = 8;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

/** True when this email has had too many wrong passwords recently. */
export function loginLocked(email: string): boolean {
  const entry = failures.get(email);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILURE_WINDOW_MS) {
    failures.delete(email);
    return false;
  }
  return entry.count >= FAILURE_LIMIT;
}

export function recordLoginFailure(email: string): void {
  const entry = failures.get(email);
  if (!entry || Date.now() - entry.first > FAILURE_WINDOW_MS) failures.set(email, { count: 1, first: Date.now() });
  else entry.count++;
}

export function clearLoginFailures(email: string): void {
  failures.delete(email);
}
