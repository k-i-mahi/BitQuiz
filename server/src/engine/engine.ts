import {
  ACTIVE_QUESTION_STATUSES,
  ERROR_CODES,
  REVISION_FREE_COMMANDS,
  canMoveCompetition,
  canMoveQuestion,
  canRegrade,
  firstShownStatus,
  computePoints,
  questionSchema,
  type Command,
  type CompetitionStatus,
  type QuestionStatus,
} from '@bitquiz/shared';
import type { Competition, Prisma, Question, Round } from '@prisma/client';
import { prisma, type Tx } from '../lib/db';
import { HttpError, conflict, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { forgetParticipant } from '../auth/session';
import { broadcast, disconnectParticipant, invalidateState } from '../realtime/hub';
import { questionRule } from '../realtime/views';
import { invalidateBoards } from '../scoring/leaderboard';
import { cancelClose, scheduleClose } from './timers';

export type Actor = { kind: 'admin'; id: string; organizationId: string } | { kind: 'system' };

interface Effects {
  /** Recompute leaderboards before broadcasting. */
  scoresChanged?: boolean;
  schedule?: { questionId: string; endsAt: Date };
  cancel?: string;
  disconnect?: { participantId: string; reason: 'kicked' | 'reset' };
  log?: Prisma.InputJsonValue;
}

export interface CommandResult {
  revision: number;
}

const invalid = (message: string) => conflict(ERROR_CODES.INVALID_TRANSITION, message);

/**
 * Applies one Game Master (or system) command atomically. Flow commands must quote the
 * revision the caller was looking at; if anything changed since, nothing is applied and
 * a 409 is returned so a double click can never advance the quiz twice.
 */
export async function executeCommand(competitionId: string, command: Command, actor: Actor): Promise<CommandResult> {
  const needsRevision = actor.kind === 'admin' && !REVISION_FREE_COMMANDS.includes(command.type);

  for (let attempt = 0; ; attempt++) {
    try {
      const { revision, effects } = await prisma.$transaction(
        async (tx) => {
          const competition = await tx.competition.findFirst({
            where: {
              id: competitionId,
              ...(actor.kind === 'admin' ? { organizationId: actor.organizationId } : {}),
            },
          });
          if (!competition) throw notFound('Competition');

          if (needsRevision && command.revision !== competition.revision) {
            throw conflict(ERROR_CODES.STALE_REVISION, 'The quiz changed since your last update. Try again.');
          }

          // Claim the revision; a concurrent command holding the same revision makes this update 0 rows.
          const claimed = await tx.competition.updateMany({
            where: { id: competition.id, revision: competition.revision },
            data: { revision: { increment: 1 } },
          });
          if (claimed.count === 0) throw new RevisionRace();

          const effects = await apply(tx, competition, command, new Date(), actor);
          await tx.actionLog.create({
            data: {
              competitionId: competition.id,
              actor: actor.kind === 'admin' ? actor.id : 'system',
              action: command.type,
              payload: effects.log ?? (stripRevision(command) as Prisma.InputJsonValue),
            },
          });
          return { revision: competition.revision + 1, effects };
        },
        { timeout: 20_000 },
      );

      if (effects.cancel) cancelClose(effects.cancel);
      if (effects.schedule) scheduleClose(competitionId, effects.schedule.questionId, effects.schedule.endsAt);
      if (effects.disconnect) disconnectParticipant(effects.disconnect.participantId, effects.disconnect.reason);
      if (effects.scoresChanged) invalidateBoards(competitionId);
      if ('participantId' in command) forgetParticipant(command.participantId);
      invalidateState(competitionId);
      broadcast(competitionId).catch((err) => logger.error({ err, competitionId }, 'Broadcast failed'));
      return { revision };
    } catch (error) {
      // Commands that don't quote a revision simply retry on a race.
      if (error instanceof RevisionRace) {
        if (!needsRevision && attempt < 3) continue;
        throw conflict(ERROR_CODES.STALE_REVISION, 'The quiz changed since your last update. Try again.');
      }
      throw error;
    }
  }
}

class RevisionRace extends Error {}

function stripRevision(command: Command): Record<string, unknown> {
  const { revision: _revision, ...rest } = command as Command & { revision?: number };
  return rest;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/** Starts the current question's video from the beginning on every projector screen. */
const startMedia = { mediaPlaying: true, mediaRestartCount: { increment: 1 } } satisfies Prisma.CompetitionUpdateInput;

type QuestionWithRound = Question & { round: Round };

async function apply(tx: Tx, c: Competition, command: Command, now: Date, actor: Actor): Promise<Effects> {
  switch (command.type) {
    case 'OPEN_LOBBY': {
      requireStatus(c, 'DRAFT');
      await validateContent(tx, c.id);
      await moveCompetition(tx, c, 'LOBBY', { displayMode: 'LOBBY' });
      return {};
    }

    case 'CLOSE_LOBBY': {
      requireStatus(c, 'LOBBY');
      await moveCompetition(tx, c, 'DRAFT', {});
      return {};
    }

    case 'START': {
      requireStatus(c, 'LOBBY');
      await moveCompetition(tx, c, 'LIVE', { displayMode: 'QUESTION', holdMessage: null });
      return {};
    }

    case 'SHOW_QUESTION': {
      requireStatus(c, 'LIVE');
      const current = await currentQuestion(tx, c);
      // Second step of a media question: the media has been shown, now show the question and options.
      if (current?.status === 'MEDIA' && (!command.questionId || command.questionId === current.id)) {
        await moveQuestion(tx, current, 'SHOWN', {});
        return { log: { questionId: current.id, stage: 'details' } };
      }
      await requireNoActiveQuestion(tx, c);
      const target = await pickQuestion(tx, c, command.questionId);
      // Questions with an image or video start with the media alone; others show everything at once.
      const stage = firstShownStatus(Boolean(target.mediaRef));
      await moveQuestion(tx, target, stage, { shownAt: now });
      await tx.competition.update({
        where: { id: c.id },
        data: { currentQuestionId: target.id, displayMode: 'QUESTION', ...startMedia },
      });
      return { log: { questionId: target.id, stage: stage === 'MEDIA' ? 'media' : 'details' } };
    }

    case 'OPEN_QUESTION': {
      requireStatus(c, 'LIVE');
      const current = await currentQuestion(tx, c);
      let target: QuestionWithRound;
      let newlyShown = false;
      if (
        current &&
        (current.status === 'SHOWN' || current.status === 'MEDIA') &&
        (!command.questionId || command.questionId === current.id)
      ) {
        target = current;
      } else {
        // "Show + Open" in one step.
        await requireNoActiveQuestion(tx, c);
        target = await pickQuestion(tx, c, command.questionId);
        newlyShown = true;
      }
      const { timeLimitSec } = questionRule(target, target.round);
      const endsAt = new Date(now.getTime() + timeLimitSec * 1000);
      await moveQuestion(tx, target, 'OPEN', { shownAt: target.shownAt ?? now, openedAt: now, endsAt });
      await tx.competition.update({
        where: { id: c.id },
        // Opening answering leaves a playing video alone; only a newly shown question starts its media.
        data: { currentQuestionId: target.id, displayMode: 'QUESTION', ...(newlyShown ? startMedia : {}) },
      });
      return { schedule: { questionId: target.id, endsAt }, log: { questionId: target.id, timeLimitSec } };
    }

    case 'EXTEND': {
      requireStatus(c, 'LIVE');
      const current = await requireCurrent(tx, c, 'OPEN');
      const base = Math.max(current.endsAt?.getTime() ?? now.getTime(), now.getTime());
      const endsAt = new Date(base + command.seconds * 1000);
      await tx.question.update({ where: { id: current.id }, data: { endsAt } });
      return {
        schedule: { questionId: current.id, endsAt },
        log: { questionId: current.id, seconds: command.seconds },
      };
    }

    case 'CLOSE_QUESTION': {
      requireStatus(c, 'LIVE');
      const current = await requireCurrent(tx, c, 'OPEN');
      // The auto-close timer may fire just after the GM extended the time; never close early then.
      if (actor.kind === 'system' && current.endsAt && current.endsAt > now) {
        throw invalid('Question was extended');
      }
      await moveQuestion(tx, current, 'CLOSED', { closedAt: now });
      return { cancel: current.id, log: { questionId: current.id } };
    }

    case 'REVEAL': {
      requireStatus(c, 'LIVE');
      const current = await requireCurrent(tx, c, 'CLOSED');
      await moveQuestion(tx, current, 'REVEALED', { revealedAt: now });
      return { scoresChanged: true, log: { questionId: current.id } };
    }

    case 'VOID_QUESTION': {
      requireStatus(c, 'LIVE');
      const question = await findQuestion(tx, c, command.questionId);
      await moveQuestion(tx, question, 'VOID', {});
      if (c.currentQuestionId === question.id) {
        await tx.competition.update({ where: { id: c.id }, data: { currentQuestionId: null } });
      }
      return { scoresChanged: true, cancel: question.id };
    }

    case 'REGRADE': {
      if (c.status !== 'LIVE' && c.status !== 'FINISHED')
        throw invalid('Questions can only be regraded during or after the quiz');
      const question = await findQuestion(tx, c, command.questionId);
      if (!canRegrade(question.status)) throw invalid('Only closed or revealed questions can be regraded');
      const options = question.options as Array<{ id: string }>;
      if (!options.some((o) => o.id === command.correctOptionId)) throw invalid('That option does not exist');

      await tx.question.update({ where: { id: question.id }, data: { correctOptionId: command.correctOptionId } });
      const rule = questionRule(question, question.round);
      const answers = await tx.answer.findMany({ where: { questionId: question.id } });
      for (const answer of answers) {
        const isCorrect = answer.optionId === command.correctOptionId;
        const points = computePoints(isCorrect, answer.responseMs, rule.timeLimitSec * 1000, rule);
        if (isCorrect !== answer.isCorrect || points !== answer.points) {
          await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, points } });
        }
      }
      return {
        scoresChanged: true,
        log: { questionId: question.id, from: question.correctOptionId, to: command.correctOptionId },
      };
    }

    case 'DUPLICATE_QUESTION': {
      if (c.status !== 'LIVE' && c.status !== 'LOBBY') throw invalid('Questions can only be duplicated while running');
      const question = await findQuestion(tx, c, command.questionId);
      const copy = await tx.question.create({
        data: {
          roundId: question.roundId,
          order: question.order,
          prompt: question.prompt,
          code: question.code,
          codeLanguage: question.codeLanguage,
          options: question.options as Prisma.InputJsonValue,
          correctOptionId: question.correctOptionId,
          explanation: question.explanation,
          timeLimitSec: question.timeLimitSec,
          maxPoints: question.maxPoints,
          minPoints: question.minPoints,
          mediaKind: question.mediaKind,
          mediaSource: question.mediaSource,
          mediaRef: question.mediaRef,
          mediaOnPhones: question.mediaOnPhones,
        },
      });
      return { log: { questionId: question.id, copyId: copy.id } };
    }

    case 'SET_DISPLAY': {
      if (!['LOBBY', 'LIVE', 'FINISHED'].includes(c.status)) throw invalid('The projector is not active yet');
      await tx.competition.update({
        where: { id: c.id },
        data: {
          displayMode: command.mode,
          ...(command.mode === 'HOLD' ? { holdMessage: command.message?.trim() || null } : {}),
        },
      });
      return {};
    }

    case 'FREEZE_LEADERBOARD': {
      requireStatus(c, 'LIVE');
      if (c.leaderboardFrozenAt) throw invalid('The leaderboard is already frozen');
      await tx.competition.update({ where: { id: c.id }, data: { leaderboardFrozenAt: now } });
      return { scoresChanged: true };
    }

    case 'UNFREEZE_LEADERBOARD': {
      if (!c.leaderboardFrozenAt) throw invalid('The leaderboard is not frozen');
      await tx.competition.update({ where: { id: c.id }, data: { leaderboardFrozenAt: null } });
      return { scoresChanged: true };
    }

    case 'KICK':
    case 'UNKICK': {
      const participant = await findParticipant(tx, c, command.participantId);
      const kicked = command.type === 'KICK';
      await tx.participant.update({
        where: { id: participant.id },
        data: kicked ? { kicked: true, tokenHash: null } : { kicked: false },
      });
      return {
        scoresChanged: true,
        ...(kicked ? { disconnect: { participantId: participant.id, reason: 'kicked' as const } } : {}),
        log: { participantId: participant.id, roll: participant.roll },
      };
    }

    case 'RESET_DEVICE': {
      const participant = await findParticipant(tx, c, command.participantId);
      await tx.participant.update({ where: { id: participant.id }, data: { tokenHash: null } });
      return {
        disconnect: { participantId: participant.id, reason: 'reset' },
        log: { participantId: participant.id, roll: participant.roll },
      };
    }

    case 'EDIT_NAME': {
      const participant = await findParticipant(tx, c, command.participantId);
      await tx.participant.update({ where: { id: participant.id }, data: { name: command.name } });
      return {
        scoresChanged: true,
        log: { participantId: participant.id, from: participant.name, to: command.name },
      };
    }

    case 'MEDIA_PLAY':
    case 'MEDIA_PAUSE':
    case 'MEDIA_RESTART': {
      requireStatus(c, 'LIVE');
      const current = await currentQuestion(tx, c);
      if (!current?.mediaRef || current.mediaKind !== 'VIDEO') throw invalid('The current question has no video');
      await tx.competition.update({
        where: { id: c.id },
        data: command.type === 'MEDIA_RESTART' ? startMedia : { mediaPlaying: command.type === 'MEDIA_PLAY' },
      });
      return { log: { questionId: current.id } };
    }

    case 'FINISH': {
      requireStatus(c, 'LIVE');
      await requireNoActiveQuestion(tx, c, 'Reveal or void the current question before finishing');
      await moveCompetition(tx, c, 'FINISHED', { displayMode: 'FINAL', leaderboardFrozenAt: null });
      return { scoresChanged: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireStatus(c: Competition, status: CompetitionStatus) {
  if (c.status !== status) {
    throw invalid(`This action needs the competition to be ${status.toLowerCase()} (it is ${c.status.toLowerCase()})`);
  }
}

async function moveCompetition(tx: Tx, c: Competition, to: CompetitionStatus, data: Prisma.CompetitionUpdateInput) {
  if (!canMoveCompetition(c.status, to)) throw invalid(`Cannot move from ${c.status} to ${to}`);
  await tx.competition.update({ where: { id: c.id }, data: { ...data, status: to } });
}

async function moveQuestion(tx: Tx, q: Question, to: QuestionStatus, data: Prisma.QuestionUpdateInput) {
  if (!canMoveQuestion(q.status, to)) throw invalid(`Question cannot go from ${q.status} to ${to}`);
  await tx.question.update({ where: { id: q.id }, data: { ...data, status: to } });
}

async function currentQuestion(tx: Tx, c: Competition): Promise<QuestionWithRound | null> {
  if (!c.currentQuestionId) return null;
  return tx.question.findUnique({ where: { id: c.currentQuestionId }, include: { round: true } });
}

async function requireCurrent(tx: Tx, c: Competition, status: QuestionStatus): Promise<QuestionWithRound> {
  const current = await currentQuestion(tx, c);
  if (!current || current.status !== status) {
    throw invalid(`There is no ${status.toLowerCase()} question right now`);
  }
  return current;
}

async function requireNoActiveQuestion(tx: Tx, c: Competition, message = 'Finish the current question first') {
  const current = await currentQuestion(tx, c);
  if (current && ACTIVE_QUESTION_STATUSES.includes(current.status)) throw invalid(message);
}

async function findQuestion(tx: Tx, c: Competition, questionId: string): Promise<QuestionWithRound> {
  const question = await tx.question.findFirst({
    where: { id: questionId, round: { competitionId: c.id } },
    include: { round: true },
  });
  if (!question) throw notFound('Question');
  return question;
}

/** The requested question, or the next pending one in run order. */
async function pickQuestion(tx: Tx, c: Competition, questionId?: string): Promise<QuestionWithRound> {
  if (questionId) {
    const question = await findQuestion(tx, c, questionId);
    if (question.status !== 'PENDING') throw invalid('That question has already been used');
    return question;
  }
  const next = await tx.question.findFirst({
    where: { status: 'PENDING', round: { competitionId: c.id } },
    orderBy: [{ round: { order: 'asc' } }, { round: { createdAt: 'asc' } }, { order: 'asc' }, { createdAt: 'asc' }],
    include: { round: true },
  });
  if (!next) throw invalid('There are no more questions');
  return next;
}

async function findParticipant(tx: Tx, c: Competition, participantId: string) {
  const participant = await tx.participant.findFirst({ where: { id: participantId, competitionId: c.id } });
  if (!participant) throw notFound('Participant');
  return participant;
}

/** Everything a competition needs before people can join. */
async function validateContent(tx: Tx, competitionId: string) {
  const rounds = await tx.round.findMany({ where: { competitionId }, include: { questions: true } });
  const problems: string[] = [];
  if (rounds.length === 0) problems.push('Add at least one round');
  const questions = rounds.flatMap((r) => r.questions.map((q) => ({ q, r })));
  if (questions.length === 0) problems.push('Add at least one question');
  for (const { q, r } of questions) {
    const result = questionSchema.safeParse({
      order: q.order,
      prompt: q.prompt,
      code: q.code,
      codeLanguage: q.codeLanguage,
      options: q.options,
      correctOptionId: q.correctOptionId,
      explanation: q.explanation,
      timeLimitSec: q.timeLimitSec,
      maxPoints: q.maxPoints,
      minPoints: q.minPoints,
      mediaKind: q.mediaKind,
      mediaSource: q.mediaSource,
      mediaRef: q.mediaRef,
      mediaOnPhones: q.mediaOnPhones,
    });
    if (!result.success) {
      problems.push(`${r.title}, question ${q.order}: ${result.error.issues[0]?.message ?? 'invalid'}`);
    }
    const rule = questionRule(q, r);
    if (rule.minPoints > rule.maxPoints) {
      problems.push(`${r.title}, question ${q.order}: minimum points exceed maximum points`);
    }
  }
  if (problems.length > 0) {
    throw new HttpError(422, ERROR_CODES.CONTENT_INVALID, problems[0] ?? 'Content is incomplete', { problems });
  }
}
