import type { CompetitionView, OptionId, QuestionStatus, QuestionView, QuizOption, ViewerRole } from '@bitquiz/shared';

export interface QuestionRecord {
  id: string;
  order: number;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  options: unknown;
  correctOptionId: string;
  explanation: string | null;
  timeLimitSec: number | null;
  maxPoints: number | null;
  minPoints: number | null;
  status: QuestionStatus;
  openedAt: Date | null;
  endsAt: Date | null;
}

export interface RoundRecord {
  id: string;
  order: number;
  title: string;
  defaultTimeLimitSec: number;
  defaultMaxPoints: number;
  defaultMinPoints: number;
  wrongPenalty: number;
}

export interface CompetitionRecord {
  id: string;
  title: string;
  joinCode: string;
  status: CompetitionView['status'];
  displayMode: CompetitionView['displayMode'];
  holdMessage: string | null;
  leaderboardFrozenAt: Date | null;
}

/** Effective time limit and scoring for a question, falling back to its round's defaults. */
export function questionRule(question: QuestionRecord, round: RoundRecord) {
  return {
    timeLimitSec: question.timeLimitSec ?? round.defaultTimeLimitSec,
    maxPoints: question.maxPoints ?? round.defaultMaxPoints,
    minPoints: question.minPoints ?? round.defaultMinPoints,
    wrongPenalty: round.wrongPenalty,
  };
}

export function toCompetitionView(c: CompetitionRecord): CompetitionView {
  return {
    id: c.id,
    title: c.title,
    joinCode: c.joinCode,
    status: c.status,
    displayMode: c.displayMode,
    holdMessage: c.holdMessage,
    leaderboardFrozen: c.leaderboardFrozenAt !== null,
  };
}

/** May this viewer see the correct answer of a question in this state? */
export function answerVisibleTo(role: ViewerRole, status: QuestionStatus): boolean {
  return role === 'gm' || status === 'REVEALED';
}

/**
 * Builds the question as a given role may see it. The correct option, explanation and
 * answer distribution are withheld from participants and the projector until reveal.
 */
export function toQuestionView(
  role: ViewerRole,
  question: QuestionRecord,
  round: RoundRecord,
  position: { number: number; total: number },
  distribution: Partial<Record<OptionId, number>>,
): QuestionView {
  const rule = questionRule(question, round);
  const view: QuestionView = {
    id: question.id,
    roundTitle: round.title,
    roundOrder: round.order,
    number: position.number,
    total: position.total,
    prompt: question.prompt,
    code: question.code,
    codeLanguage: question.codeLanguage,
    options: question.options as QuizOption[],
    status: question.status,
    timeLimitSec: rule.timeLimitSec,
    maxPoints: rule.maxPoints,
    minPoints: rule.minPoints,
    wrongPenalty: rule.wrongPenalty,
    openedAt: question.openedAt?.toISOString() ?? null,
    endsAt: question.endsAt?.toISOString() ?? null,
  };
  if (answerVisibleTo(role, question.status)) {
    view.correctOptionId = question.correctOptionId as OptionId;
    view.explanation = question.explanation;
  }
  if (role === 'gm' || (role === 'screen' && question.status === 'REVEALED')) {
    view.distribution = distribution;
  }
  return view;
}
