import { z } from 'zod';
import {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  CODE_LANGUAGES,
  DISPLAY_MODES,
  MAX_OPTIONS,
  MIN_OPTIONS,
  OPTION_IDS,
} from './enums';
import { MEDIA_KINDS, MEDIA_REF_MAX, MEDIA_SOURCES, mediaProblem } from './media';

// ---------------------------------------------------------------------------
// Primitive limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  titleMax: 120,
  promptMax: 1000,
  codeMax: 4000,
  optionMax: 200,
  explanationMax: 1000,
  nameMin: 2,
  nameMax: 40,
  rollMax: 20,
  timeLimitMinSec: 5,
  timeLimitMaxSec: 300,
  pointsMax: 10000,
  penaltyMax: 10000,
  holdMessageMax: 200,
} as const;

const trimmed = (max: number) => z.string().trim().max(max);

// ---------------------------------------------------------------------------
// Auth & admins
// ---------------------------------------------------------------------------

/** Trims and lower-cases before validating, so " Mahi@Gmail.com " is accepted and stored once. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const personNameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(60);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const profileSchema = z.object({ name: personNameSchema });

export const forgotPasswordSchema = z.object({ email: emailSchema });

/** Emailed links carry a random token; this only checks its shape. */
const linkTokenSchema = z.string().trim().min(20).max(200);

export const resetPasswordSchema = z.object({ token: linkTokenSchema, password: passwordSchema });

export const verifyEmailSchema = z.object({ token: linkTokenSchema });

export const inviteSchema = z.object({ email: emailSchema, role: z.enum(ADMIN_ROLES) });
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: linkTokenSchema,
  name: personNameSchema,
  password: passwordSchema,
});

export const updateMemberSchema = z
  .object({ role: z.enum(ADMIN_ROLES).optional(), status: z.enum(ADMIN_STATUSES).optional() })
  .refine((v) => v.role !== undefined || v.status !== undefined, { message: 'Nothing to change' });

// ---------------------------------------------------------------------------
// Competitions, rounds, questions
// ---------------------------------------------------------------------------

const scoringFields = {
  maxPoints: z.number().int().min(1).max(LIMITS.pointsMax),
  minPoints: z.number().int().min(1, 'Minimum points must be at least 1').max(LIMITS.pointsMax),
};

export const competitionSettingsSchema = z
  .object({
    title: trimmed(LIMITS.titleMax).min(3, 'Title must be at least 3 characters'),
    rollMinLength: z.number().int().min(1).max(LIMITS.rollMax),
    rollMaxLength: z.number().int().min(1).max(LIMITS.rollMax),
    rollDigitsOnly: z.boolean(),
    allowLateJoin: z.boolean(),
  })
  .refine((v) => v.rollMinLength <= v.rollMaxLength, {
    message: 'Minimum roll length cannot exceed maximum',
    path: ['rollMinLength'],
  });
export type CompetitionSettingsInput = z.infer<typeof competitionSettingsSchema>;

export const createCompetitionSchema = z.object({
  title: trimmed(LIMITS.titleMax).min(3, 'Title must be at least 3 characters'),
});

export const roundSchema = z
  .object({
    title: trimmed(LIMITS.titleMax).min(1, 'Round title is required'),
    order: z.number().int().min(1).max(1000),
    defaultTimeLimitSec: z.number().int().min(LIMITS.timeLimitMinSec).max(LIMITS.timeLimitMaxSec),
    defaultMaxPoints: scoringFields.maxPoints,
    defaultMinPoints: scoringFields.minPoints,
    wrongPenalty: z.number().int().min(0).max(LIMITS.penaltyMax),
  })
  .refine((v) => v.defaultMinPoints <= v.defaultMaxPoints, {
    message: 'Minimum points cannot exceed maximum points',
    path: ['defaultMinPoints'],
  });
export type RoundInput = z.infer<typeof roundSchema>;

export const optionSchema = z.object({
  id: z.enum(OPTION_IDS),
  text: trimmed(LIMITS.optionMax).min(1, 'Option text is required'),
});
export type QuizOption = z.infer<typeof optionSchema>;

export const questionSchema = z
  .object({
    order: z.number().int().min(1).max(1000),
    prompt: trimmed(LIMITS.promptMax).min(1, 'Question text is required'),
    code: z.string().max(LIMITS.codeMax).nullable(),
    codeLanguage: z.enum(CODE_LANGUAGES).nullable(),
    options: z.array(optionSchema).min(MIN_OPTIONS).max(MAX_OPTIONS),
    correctOptionId: z.enum(OPTION_IDS),
    explanation: trimmed(LIMITS.explanationMax).nullable(),
    timeLimitSec: z.number().int().min(LIMITS.timeLimitMinSec).max(LIMITS.timeLimitMaxSec).nullable(),
    maxPoints: scoringFields.maxPoints.nullable(),
    minPoints: scoringFields.minPoints.nullable(),
    mediaKind: z.enum(MEDIA_KINDS).nullable().default(null),
    mediaSource: z.enum(MEDIA_SOURCES).nullable().default(null),
    mediaRef: z.string().trim().max(MEDIA_REF_MAX).nullable().default(null),
    /** Also show an image on participants' phones (images from links only). */
    mediaOnPhones: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    const mediaSet = [q.mediaKind, q.mediaSource, q.mediaRef].filter((v) => v !== null && v !== '').length;
    if (mediaSet !== 0 && mediaSet !== 3) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose the media type, where it comes from, and the link or file',
        path: ['mediaRef'],
      });
    } else if (q.mediaKind && q.mediaSource && q.mediaRef) {
      const problem = mediaProblem({ kind: q.mediaKind, source: q.mediaSource, ref: q.mediaRef });
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['mediaRef'] });
      if (q.mediaOnPhones && (q.mediaKind !== 'IMAGE' || q.mediaSource !== 'LINK')) {
        ctx.addIssue({
          code: 'custom',
          message: 'Only linked images can also be shown on phones',
          path: ['mediaOnPhones'],
        });
      }
    } else if (q.mediaOnPhones) {
      ctx.addIssue({ code: 'custom', message: 'Add an image before showing it on phones', path: ['mediaOnPhones'] });
    }
    const ids = q.options.map((o) => o.id);
    const expected = OPTION_IDS.slice(0, q.options.length);
    if (ids.some((id, i) => id !== expected[i])) {
      ctx.addIssue({ code: 'custom', message: 'Options must be labelled A, B, C… in order', path: ['options'] });
    }
    if (!ids.includes(q.correctOptionId)) {
      ctx.addIssue({ code: 'custom', message: 'Correct option must be one of the options', path: ['correctOptionId'] });
    }
    if (q.maxPoints !== null && q.minPoints !== null && q.minPoints > q.maxPoints) {
      ctx.addIssue({ code: 'custom', message: 'Minimum points cannot exceed maximum points', path: ['minPoints'] });
    }
  });
export type QuestionInput = z.infer<typeof questionSchema>;

export const importSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
  mode: z.enum(['append', 'replace']),
});

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export interface RollRules {
  rollMinLength: number;
  rollMaxLength: number;
  rollDigitsOnly: boolean;
}

export const joinRequestSchema = z.object({
  joinCode: z.string().trim().toUpperCase().length(6),
  name: z.string(),
  roll: z.string(),
});

export const nameSchema = trimmed(LIMITS.nameMax)
  .min(LIMITS.nameMin, `Name must be at least ${LIMITS.nameMin} characters`)
  .transform((v) => v.replace(/\s+/g, ' '));

/** Validates and normalizes a roll according to the competition's rules. */
export function rollSchema(rules: RollRules) {
  const base = z.string().trim().toUpperCase();
  return base.superRefine((roll, ctx) => {
    if (roll.length < rules.rollMinLength || roll.length > rules.rollMaxLength) {
      const len =
        rules.rollMinLength === rules.rollMaxLength
          ? `exactly ${rules.rollMinLength}`
          : `${rules.rollMinLength}–${rules.rollMaxLength}`;
      ctx.addIssue({ code: 'custom', message: `Roll must be ${len} characters` });
    }
    const pattern = rules.rollDigitsOnly ? /^[0-9]+$/ : /^[A-Z0-9-]+$/;
    if (!pattern.test(roll)) {
      ctx.addIssue({
        code: 'custom',
        message: rules.rollDigitsOnly ? 'Roll must contain digits only' : 'Roll may contain letters, digits and -',
      });
    }
  });
}

export const answerRequestSchema = z.object({
  questionId: z.uuid(),
  optionId: z.enum(OPTION_IDS),
  clientRequestId: z.string().min(8).max(64),
});
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

// ---------------------------------------------------------------------------
// Game Master commands
// ---------------------------------------------------------------------------

const rev = { revision: z.number().int().min(0) };
const optRev = { revision: z.number().int().min(0).optional() };

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('OPEN_LOBBY'), ...rev }),
  z.object({ type: z.literal('CLOSE_LOBBY'), ...rev }),
  z.object({ type: z.literal('START'), ...rev }),
  z.object({ type: z.literal('SHOW_QUESTION'), questionId: z.uuid().optional(), ...rev }),
  z.object({ type: z.literal('OPEN_QUESTION'), questionId: z.uuid().optional(), ...rev }),
  z.object({ type: z.literal('EXTEND'), seconds: z.number().int().min(1).max(120).default(10), ...rev }),
  z.object({ type: z.literal('CLOSE_QUESTION'), ...rev }),
  z.object({ type: z.literal('REVEAL'), ...rev }),
  z.object({ type: z.literal('VOID_QUESTION'), questionId: z.uuid(), ...rev }),
  z.object({ type: z.literal('REGRADE'), questionId: z.uuid(), correctOptionId: z.enum(OPTION_IDS), ...rev }),
  z.object({ type: z.literal('DUPLICATE_QUESTION'), questionId: z.uuid(), ...rev }),
  z.object({
    type: z.literal('SET_DISPLAY'),
    mode: z.enum(DISPLAY_MODES),
    message: trimmed(LIMITS.holdMessageMax).optional(),
    ...rev,
  }),
  z.object({ type: z.literal('FREEZE_LEADERBOARD'), ...rev }),
  z.object({ type: z.literal('UNFREEZE_LEADERBOARD'), ...rev }),
  z.object({ type: z.literal('KICK'), participantId: z.uuid(), ...optRev }),
  z.object({ type: z.literal('UNKICK'), participantId: z.uuid(), ...optRev }),
  z.object({ type: z.literal('RESET_DEVICE'), participantId: z.uuid(), ...optRev }),
  z.object({ type: z.literal('EDIT_NAME'), participantId: z.uuid(), name: nameSchema, ...optRev }),
  // Video on the projector. No revision needed: repeating them is harmless.
  z.object({ type: z.literal('MEDIA_PLAY'), ...optRev }),
  z.object({ type: z.literal('MEDIA_PAUSE'), ...optRev }),
  z.object({ type: z.literal('MEDIA_RESTART'), ...optRev }),
  z.object({ type: z.literal('FINISH'), ...rev }),
]);
export type Command = z.infer<typeof commandSchema>;
