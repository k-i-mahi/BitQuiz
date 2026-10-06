import type { AdminRole, AdminStatus, CompetitionStatus, DisplayMode, OptionId, QuestionStatus } from './enums';
import type { QuizOption } from './schemas';
import type { RankedRow } from './scoring';

/** Who a snapshot is built for. Each role sees a different subset of the state. */
export type ViewerRole = 'gm' | 'screen' | 'participant';

export interface CompetitionView {
  id: string;
  title: string;
  joinCode: string;
  status: CompetitionStatus;
  displayMode: DisplayMode;
  holdMessage: string | null;
  leaderboardFrozen: boolean;
}

export interface QuestionView {
  id: string;
  roundTitle: string;
  roundOrder: number;
  /** 1-based position among the non-void questions of the competition. */
  number: number;
  total: number;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  options: QuizOption[];
  status: QuestionStatus;
  timeLimitSec: number;
  maxPoints: number;
  minPoints: number;
  wrongPenalty: number;
  /** ISO timestamps; null until the question is opened. */
  openedAt: string | null;
  endsAt: string | null;
  /** Only present once the answer may be known by this viewer. */
  correctOptionId?: OptionId;
  explanation?: string | null;
  /** Answer counts per option; GM always, screen after reveal. */
  distribution?: Partial<Record<OptionId, number>>;
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  name: string;
  roll: string;
  points: number;
  correct: number;
}

export interface ParticipantMe {
  participantId: string;
  name: string;
  roll: string;
  /** The participant's answer to the current question, if any. */
  answer: { questionId: string; optionId: OptionId } | null;
  /** Result for the current question once it is revealed. */
  result: { questionId: string; isCorrect: boolean; points: number; responseMs: number } | null;
  totalPoints: number;
  rank: number | null;
  participantCount: number;
}

export interface BaseState {
  revision: number;
  /** Server clock at the moment the snapshot was built (ms since epoch). */
  serverNow: number;
  competition: CompetitionView;
  question: QuestionView | null;
  participantCount: number;
}

export interface ParticipantState extends BaseState {
  role: 'participant';
}

export interface ScreenState extends BaseState {
  role: 'screen';
  joinUrl: string;
  leaderboard: LeaderboardEntry[];
  answeredCount: number;
}

export interface RunSheetQuestion {
  id: string;
  order: number;
  prompt: string;
  status: QuestionStatus;
  correctOptionId: OptionId;
  optionCount: number;
}

export interface RunSheetRound {
  id: string;
  order: number;
  title: string;
  questions: RunSheetQuestion[];
}

export interface ParticipantSummary {
  id: string;
  name: string;
  roll: string;
  kicked: boolean;
  connected: boolean;
  hasDevice: boolean;
  joinedAt: string;
}

export interface GmStats {
  joined: number;
  connected: number;
  answered: number;
  correct: number;
}

export interface GmState extends BaseState {
  role: 'gm';
  joinUrl: string;
  projectorToken: string;
  projectorConnected: number;
  runSheet: RunSheetRound[];
  hasPendingQuestions: boolean;
  leaderboard: RankedRow[];
  participants: ParticipantSummary[];
  stats: GmStats;
}

export type AnyState = ParticipantState | ScreenState | GmState;

export interface AdminUserView {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  emailVerified: boolean;
  /** False when this server has no email delivery configured. */
  emailEnabled: boolean;
  organizationName: string;
}

/** Public server capabilities shown on the login pages. */
export interface AuthConfig {
  emailEnabled: boolean;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  status: AdminStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: AdminRole;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface EmailDelivery {
  /** brevo / smtp: real email is sent. log: emails only appear in the server log. */
  mode: 'brevo' | 'smtp' | 'log';
  sender: string | null;
}

export interface TeamView {
  members: TeamMember[];
  invitations: PendingInvitation[];
  email: EmailDelivery;
}

/** Returned when an invitation is created or re-sent. The owner can always share the link directly. */
export interface InvitationSent {
  id: string;
  inviteUrl: string;
  emailSent: boolean;
  emailError: string | null;
}

export interface InvitationInfo {
  email: string;
  role: AdminRole;
  organizationName: string;
}

/** Shape of every API error response body. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Socket.IO event names, server → client. */
export const SOCKET_EVENTS = {
  state: 'state',
  me: 'me',
  stats: 'stats',
  kicked: 'kicked',
  latencyPing: 'lping',
  time: 'time',
} as const;
