export const COMPETITION_STATUSES = ['DRAFT', 'LOBBY', 'LIVE', 'FINISHED', 'ARCHIVED'] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];

export const QUESTION_STATUSES = ['PENDING', 'SHOWN', 'OPEN', 'CLOSED', 'REVEALED', 'VOID'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/** Question states in which a question occupies the stage; at most one per competition. */
export const ACTIVE_QUESTION_STATUSES: readonly QuestionStatus[] = ['SHOWN', 'OPEN', 'CLOSED'];

export const DISPLAY_MODES = ['LOBBY', 'QUESTION', 'LEADERBOARD', 'HOLD', 'FINAL'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const ADMIN_ROLES = ['OWNER', 'OPERATOR'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type OptionId = (typeof OPTION_IDS)[number];

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export const CODE_LANGUAGES = [
  'c',
  'cpp',
  'java',
  'python',
  'javascript',
  'typescript',
  'go',
  'rust',
  'kotlin',
  'sql',
  'text',
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const COMMAND_TYPES = [
  'OPEN_LOBBY',
  'CLOSE_LOBBY',
  'START',
  'SHOW_QUESTION',
  'OPEN_QUESTION',
  'EXTEND',
  'CLOSE_QUESTION',
  'REVEAL',
  'VOID_QUESTION',
  'REGRADE',
  'DUPLICATE_QUESTION',
  'SET_DISPLAY',
  'FREEZE_LEADERBOARD',
  'UNFREEZE_LEADERBOARD',
  'KICK',
  'UNKICK',
  'RESET_DEVICE',
  'EDIT_NAME',
  'FINISH',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

/** Commands that manage participants rather than the quiz flow; they don't need a matching revision. */
export const PARTICIPANT_COMMANDS: readonly CommandType[] = ['KICK', 'UNKICK', 'RESET_DEVICE', 'EDIT_NAME'];

/** Machine-readable error codes returned by the API. */
export const ERROR_CODES = {
  VALIDATION: 'VALIDATION',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  STALE_REVISION: 'STALE_REVISION',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ROLL_TAKEN: 'ROLL_TAKEN',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  LINK_INVALID: 'LINK_INVALID',
  EMAIL_FAILED: 'EMAIL_FAILED',
  KICKED: 'KICKED',
  JOIN_CLOSED: 'JOIN_CLOSED',
  NOT_ACCEPTING: 'NOT_ACCEPTING',
  TOO_LATE: 'TOO_LATE',
  CONTENT_INVALID: 'CONTENT_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
