import { Router } from 'express';
import {
  ERROR_CODES,
  adjustResponseMs,
  answerRequestSchema,
  checkAcceptance,
  computePoints,
  type QuizOption,
} from '@bitquiz/shared';
import { participantOf, requireParticipant } from '../auth/session';
import { env } from '../env';
import { isUniqueViolation, prisma } from '../lib/db';
import { HttpError, badRequest, parse } from '../lib/errors';
import { answerLimiter } from '../lib/rateLimit';
import { getLatency, requestStats } from '../realtime/hub';
import { questionRule } from '../realtime/views';

export const answersRouter = Router();

answersRouter.post('/', requireParticipant, answerLimiter, async (req, res) => {
  // Timestamp first, before any database work, so server load never costs a participant time.
  const receivedAt = Date.now();
  const me = participantOf(req);
  const input = parse(answerRequestSchema, req.body);

  // One read for question, round and competition state keeps answering cheap on a small server.
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, round: { competitionId: me.competitionId } },
    include: { round: { include: { competition: { select: { id: true, status: true, currentQuestionId: true } } } } },
  });
  const competition = question?.round.competition;
  if (!competition || !question) {
    throw new HttpError(409, ERROR_CODES.NOT_ACCEPTING, 'This question is not accepting answers.');
  }

  const respond = (optionId: string, alreadyAnswered: boolean) =>
    res.json({ questionId: question.id, optionId, alreadyAnswered });
  const savedAnswer = () =>
    prisma.answer.findUnique({
      where: { participantId_questionId: { participantId: me.id, questionId: question.id } },
      select: { optionId: true },
    });

  const acceptance = checkAcceptance({
    receivedAt,
    competitionStatus: competition.status,
    currentQuestionId: competition.currentQuestionId,
    questionId: question.id,
    questionStatus: question.status,
    endsAt: question.endsAt?.getTime() ?? null,
    closedAt: question.closedAt?.getTime() ?? null,
    graceMs: env.ANSWER_GRACE_MS,
  });
  if (!acceptance.ok) {
    // A retry of an answer that already landed (e.g. after a dropped connection) gets the saved answer back.
    const previous = await savedAnswer();
    if (previous) return respond(previous.optionId, true);
    throw new HttpError(
      409,
      acceptance.reason === 'TOO_LATE' ? ERROR_CODES.TOO_LATE : ERROR_CODES.NOT_ACCEPTING,
      acceptance.reason === 'TOO_LATE'
        ? "Time's up — your answer arrived too late."
        : 'This question is not accepting answers.',
    );
  }

  const options = question.options as QuizOption[];
  if (!options.some((o) => o.id === input.optionId)) throw badRequest('That option does not exist');

  const rule = questionRule(question, question.round);
  const latencyMs = getLatency(me.id);
  const rawMs = receivedAt - (question.openedAt?.getTime() ?? receivedAt);
  const responseMs = Math.min(adjustResponseMs(rawMs, latencyMs, env.LATENCY_CAP_MS), rule.timeLimitSec * 1000);
  const isCorrect = input.optionId === question.correctOptionId;
  const points = computePoints(isCorrect, responseMs, rule.timeLimitSec * 1000, rule);

  try {
    await prisma.answer.create({
      data: {
        participantId: me.id,
        questionId: question.id,
        optionId: input.optionId,
        clientRequestId: input.clientRequestId,
        receivedAt: new Date(receivedAt),
        responseMs,
        isCorrect,
        points,
      },
    });
  } catch (error) {
    // Double tap or two tabs: the database's unique rule keeps only the first answer.
    if (isUniqueViolation(error)) {
      const saved = await savedAnswer();
      if (saved) return respond(saved.optionId, true);
    }
    throw error;
  }

  // The phone shows "locked" from this response; only the console and projector counters need refreshing.
  requestStats(competition.id);
  respond(input.optionId, false);
});
