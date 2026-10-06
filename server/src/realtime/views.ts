import type {
  CompetitionView,
  OptionId,
  QuestionMedia,
  QuestionStatus,
  QuestionView,
  QuizOption,
  ViewerRole,
} from '@bitquiz/shared';
import { detailsVisible } from '@bitquiz/shared';

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
  mediaKind: 'IMAGE' | 'VIDEO' | null;
  mediaSource: 'LINK' | 'LOCAL' | null;
  mediaRef: string | null;
  mediaOnPhones: boolean;
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
  mediaPlaying: boolean;
  mediaRestartCount: number;
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
    media: { playing: c.mediaPlaying, restartCount: c.mediaRestartCount },
  };
}

/**
 * Media a role receives. The projector shows media only in the media stage: once the question is
 * shown, it gets the text-only layout. Phones only get linked images marked "show on phones", so
 * 300 phones never download a video.
 */
export function mediaFor(role: ViewerRole, question: QuestionRecord): QuestionMedia | null {
  if (!question.mediaKind || !question.mediaSource || !question.mediaRef) return null;
  if (role === 'screen' && question.status !== 'MEDIA') return null;
  const media: QuestionMedia = {
    kind: question.mediaKind,
    source: question.mediaSource,
    ref: question.mediaRef,
    onPhones: question.mediaOnPhones,
  };
  if (role !== 'participant') return media;
  return media.onPhones && media.kind === 'IMAGE' && media.source === 'LINK' ? media : null;
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
  const withheld = role !== 'gm' && !detailsVisible(question.status);
  const view: QuestionView = {
    id: question.id,
    roundTitle: round.title,
    roundOrder: round.order,
    number: position.number,
    total: position.total,
    // During the media stage, only the organizer gets the question; screens and phones get the media alone.
    prompt: withheld ? '' : question.prompt,
    code: withheld ? null : question.code,
    codeLanguage: withheld ? null : question.codeLanguage,
    options: withheld ? [] : (question.options as QuizOption[]),
    status: question.status,
    timeLimitSec: rule.timeLimitSec,
    maxPoints: rule.maxPoints,
    minPoints: rule.minPoints,
    wrongPenalty: rule.wrongPenalty,
    openedAt: question.openedAt?.toISOString() ?? null,
    endsAt: question.endsAt?.toISOString() ?? null,
    media: mediaFor(role, question),
    watchScreen: role === 'participant' && question.mediaRef !== null && mediaFor(role, question) === null,
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
