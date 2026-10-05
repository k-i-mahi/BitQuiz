import type { CompetitionStatus, QuestionStatus } from './enums';

/** Allowed competition status changes. */
export const COMPETITION_TRANSITIONS: Record<CompetitionStatus, readonly CompetitionStatus[]> = {
  DRAFT: ['LOBBY', 'ARCHIVED'],
  LOBBY: ['DRAFT', 'LIVE'],
  LIVE: ['FINISHED'],
  FINISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

/** Allowed question status changes (OPEN → OPEN is "extend time"). */
export const QUESTION_TRANSITIONS: Record<QuestionStatus, readonly QuestionStatus[]> = {
  PENDING: ['SHOWN', 'OPEN'],
  SHOWN: ['OPEN', 'VOID'],
  OPEN: ['OPEN', 'CLOSED', 'VOID'],
  CLOSED: ['REVEALED', 'VOID'],
  REVEALED: ['VOID'],
  VOID: [],
};

export function canMoveCompetition(from: CompetitionStatus, to: CompetitionStatus): boolean {
  return COMPETITION_TRANSITIONS[from].includes(to);
}

export function canMoveQuestion(from: QuestionStatus, to: QuestionStatus): boolean {
  return QUESTION_TRANSITIONS[from].includes(to);
}

/** Questions whose answer key may be corrected. */
export function canRegrade(status: QuestionStatus): boolean {
  return status === 'CLOSED' || status === 'REVEALED';
}

/** Content may only be edited while the competition is a draft. */
export function isEditable(status: CompetitionStatus): boolean {
  return status === 'DRAFT';
}

export function isJoinable(status: CompetitionStatus, allowLateJoin: boolean): boolean {
  return status === 'LOBBY' || (status === 'LIVE' && allowLateJoin);
}

export type NextStep = 'SHOW' | 'OPEN' | 'CLOSE' | 'REVEAL' | 'NEXT' | 'FINISH' | null;

/** What the Game Master's main button should do next, given the current question. */
export function nextStep(currentStatus: QuestionStatus | null, hasPendingQuestions: boolean): NextStep {
  switch (currentStatus) {
    case 'SHOWN':
      return 'OPEN';
    case 'OPEN':
      return 'CLOSE';
    case 'CLOSED':
      return 'REVEAL';
    default:
      return hasPendingQuestions ? (currentStatus === null ? 'SHOW' : 'NEXT') : 'FINISH';
  }
}

export interface AcceptanceInput {
  /** Server time the answer was received (ms since epoch). */
  receivedAt: number;
  competitionStatus: CompetitionStatus;
  currentQuestionId: string | null;
  questionId: string;
  questionStatus: QuestionStatus;
  /** Deadline of the question (ms since epoch). */
  endsAt: number | null;
  /** When the question was closed, if it was (ms since epoch). */
  closedAt: number | null;
  graceMs: number;
}

export type AcceptanceResult = { ok: true } | { ok: false; reason: 'NOT_ACCEPTING' | 'TOO_LATE' };

/**
 * The authoritative rule for whether an answer counts. Duplicate answers are rejected
 * separately by the database's unique constraint.
 */
export function checkAcceptance(input: AcceptanceInput): AcceptanceResult {
  if (input.competitionStatus !== 'LIVE') return { ok: false, reason: 'NOT_ACCEPTING' };
  if (input.currentQuestionId !== input.questionId) return { ok: false, reason: 'NOT_ACCEPTING' };
  if (input.questionStatus !== 'OPEN' && input.questionStatus !== 'CLOSED') {
    return { ok: false, reason: 'NOT_ACCEPTING' };
  }
  if (input.endsAt === null) return { ok: false, reason: 'NOT_ACCEPTING' };
  // A question closed early by the Game Master stops accepting at close time (plus grace).
  const deadline = input.closedAt === null ? input.endsAt : Math.min(input.endsAt, input.closedAt);
  if (input.receivedAt > deadline + input.graceMs) return { ok: false, reason: 'TOO_LATE' };
  return { ok: true };
}
