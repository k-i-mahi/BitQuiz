import type { CompetitionStatus, OptionId, QuizOption } from '@bitquiz/shared';

export interface QuestionRow {
  id: string;
  roundId: string;
  order: number;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  options: QuizOption[];
  correctOptionId: OptionId;
  explanation: string | null;
  timeLimitSec: number | null;
  maxPoints: number | null;
  minPoints: number | null;
  status: string;
}

export interface RoundRow {
  id: string;
  order: number;
  title: string;
  defaultTimeLimitSec: number;
  defaultMaxPoints: number;
  defaultMinPoints: number;
  wrongPenalty: number;
  questions: QuestionRow[];
}

export interface CompetitionDetail {
  id: string;
  title: string;
  joinCode: string;
  status: CompetitionStatus;
  rollMinLength: number;
  rollMaxLength: number;
  rollDigitsOnly: boolean;
  allowLateJoin: boolean;
  projectorToken: string;
  revision: number;
  rounds: RoundRow[];
}
