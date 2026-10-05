import { env } from '../env';
import { prisma } from '../lib/db';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';
import { executeCommand } from './engine';

/** questionId → pending auto-close. One server instance owns all timers. */
const timers = new Map<string, NodeJS.Timeout>();

/** Closes the question automatically at its deadline plus the grace period. */
export function scheduleClose(competitionId: string, questionId: string, endsAt: Date): void {
  cancelClose(questionId);
  const delay = Math.max(0, endsAt.getTime() + env.ANSWER_GRACE_MS - Date.now());
  const timer = setTimeout(() => {
    timers.delete(questionId);
    executeCommand(competitionId, { type: 'CLOSE_QUESTION', revision: 0 }, { kind: 'system' }).catch((error) => {
      // 409 here just means the GM already closed, voided or extended it.
      if (error instanceof HttpError && error.status === 409) return;
      logger.error({ err: error, competitionId, questionId }, 'Auto-close failed');
    });
  }, delay);
  timers.set(questionId, timer);
}

export function cancelClose(questionId: string): void {
  const timer = timers.get(questionId);
  if (timer) clearTimeout(timer);
  timers.delete(questionId);
}

export function cancelAllTimers(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

/**
 * After a restart, re-arm the auto-close of every open question. Questions whose
 * deadline already passed are closed immediately.
 */
export async function recoverTimers(): Promise<number> {
  const open = await prisma.question.findMany({
    where: { status: 'OPEN', round: { competition: { status: 'LIVE' } } },
    select: { id: true, endsAt: true, round: { select: { competitionId: true } } },
  });
  for (const q of open) {
    scheduleClose(q.round.competitionId, q.id, q.endsAt ?? new Date());
  }
  if (open.length > 0) logger.info({ count: open.length }, 'Recovered question timers');
  return open.length;
}
