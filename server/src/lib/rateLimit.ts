import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { ERROR_CODES, type ApiErrorBody } from '@bitquiz/shared';
import { env } from '../env';

function limiter(windowMs: number, limit: number, message: string, extra: Partial<Options> = {}) {
  const body: ApiErrorBody = { error: { code: ERROR_CODES.RATE_LIMITED, message } };
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: body,
    skip: () => env.NODE_ENV === 'test',
    ...extra,
  });
}

/** Strict: slows down password guessing. Successful logins don't count. */
export const loginLimiter = limiter(60_000, 5, 'Too many login attempts. Wait a minute and try again.', {
  skipSuccessfulRequests: true,
});

/** Generous: a whole hall of phones may share one public IP behind the venue NAT. */
export const joinLimiter = limiter(60_000, 600, 'Too many join attempts from this network. Try again shortly.');

/** Per device token, so one phone can't flood the answer endpoint. */
export const answerLimiter = limiter(10_000, 20, 'Too many requests. Slow down.', {
  keyGenerator: (req) => req.get('authorization') ?? ipKeyGenerator(req.ip ?? 'unknown'),
});

/** Per IP; high because a whole hall of phones can share one public IP. */
export const apiLimiter = limiter(60_000, 10_000, 'Too many requests. Try again shortly.');

/** Emailed-link flows (forgot password, verification, invitations): slows down abuse and token guessing. */
export const emailLinkLimiter = limiter(15 * 60_000, 30, 'Too many attempts. Wait a few minutes and try again.');
