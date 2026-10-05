import { Router, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  QUESTION_CSV_TEMPLATE,
  commandSchema,
  competitionSettingsSchema,
  createCompetitionSchema,
  importSchema,
  parseQuestionCsv,
  questionSchema,
  roundSchema,
  toCsv,
  UTF8_BOM,
  type QuestionInput,
} from '@bitquiz/shared';
import { adminOf, requireAdmin } from '../auth/session';
import { executeCommand } from '../engine/engine';
import { isUniqueViolation, prisma, type Tx } from '../lib/db';
import { HttpError, parse } from '../lib/errors';
import { generateJoinCode, randomToken } from '../lib/security';
import { requestBroadcast } from '../realtime/hub';
import { getBoards } from '../scoring/leaderboard';
import { ownedCompetition, ownedQuestion, ownedRound, requireEditable } from './access';

export const competitionsRouter = Router();
competitionsRouter.use(requireAdmin);

const ROUND_DEFAULTS = {
  defaultTimeLimitSec: 20,
  defaultMaxPoints: 100,
  defaultMinPoints: 50,
  wrongPenalty: 0,
};

const questionOrder: Prisma.QuestionOrderByWithRelationInput[] = [{ order: 'asc' }, { createdAt: 'asc' }];
const roundOrder: Prisma.RoundOrderByWithRelationInput[] = [{ order: 'asc' }, { createdAt: 'asc' }];

function questionData(input: QuestionInput) {
  return {
    order: input.order,
    prompt: input.prompt,
    code: input.code?.trim() ? input.code : null,
    codeLanguage: input.code?.trim() ? (input.codeLanguage ?? 'text') : null,
    options: input.options,
    correctOptionId: input.correctOptionId,
    explanation: input.explanation || null,
    timeLimitSec: input.timeLimitSec,
    maxPoints: input.maxPoints,
    minPoints: input.minPoints,
  };
}

/** Creates a competition with a unique join code, retrying on the rare collision. */
async function createWithJoinCode(data: (joinCode: string) => Prisma.CompetitionUncheckedCreateInput) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.competition.create({ data: data(generateJoinCode()) });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw new HttpError(500, ERROR_CODES.INTERNAL, 'Could not generate a join code. Try again.');
}

// ---------------------------------------------------------------------------
// Competitions
// ---------------------------------------------------------------------------

competitionsRouter.get('/', async (req, res) => {
  const includeArchived = req.query.archived === '1';
  const competitions = await prisma.competition.findMany({
    where: {
      organizationId: adminOf(req).organizationId,
      ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      joinCode: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { rounds: true, participants: true } },
      rounds: { select: { _count: { select: { questions: true } } } },
    },
  });
  res.json(
    competitions.map(({ rounds, _count, ...c }) => ({
      ...c,
      roundCount: _count.rounds,
      participantCount: _count.participants,
      questionCount: rounds.reduce((sum, r) => sum + r._count.questions, 0),
    })),
  );
});

competitionsRouter.post('/', async (req, res) => {
  const { title } = parse(createCompetitionSchema, req.body);
  const organizationId = adminOf(req).organizationId;
  const competition = await createWithJoinCode((joinCode) => ({
    organizationId,
    title,
    joinCode,
    projectorToken: randomToken(24),
    rounds: { create: { order: 1, title: 'Round 1', ...ROUND_DEFAULTS } },
  }));
  res.status(201).json({ id: competition.id });
});

competitionsRouter.get('/:id', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  const rounds = await prisma.round.findMany({
    where: { competitionId: competition.id },
    orderBy: roundOrder,
    include: { questions: { orderBy: questionOrder } },
  });
  res.json({ ...competition, leaderboardFrozen: competition.leaderboardFrozenAt !== null, rounds });
});

competitionsRouter.patch('/:id', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  if (competition.status !== 'DRAFT' && competition.status !== 'LOBBY') {
    throw new HttpError(409, ERROR_CODES.INVALID_TRANSITION, 'Settings are locked once the quiz has started');
  }
  const input = parse(competitionSettingsSchema, req.body);
  await prisma.competition.update({ where: { id: competition.id }, data: input });
  requestBroadcast(competition.id);
  res.status(204).end();
});

competitionsRouter.delete('/:id', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  if (competition.status !== 'DRAFT') {
    throw new HttpError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'Only draft competitions can be deleted. Archive it instead.',
    );
  }
  await prisma.competition.delete({ where: { id: competition.id } });
  res.status(204).end();
});

competitionsRouter.post('/:id/archive', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  if (competition.status !== 'DRAFT' && competition.status !== 'FINISHED') {
    throw new HttpError(409, ERROR_CODES.INVALID_TRANSITION, 'Only draft or finished competitions can be archived');
  }
  await prisma.competition.update({ where: { id: competition.id }, data: { status: 'ARCHIVED' } });
  res.status(204).end();
});

/** Copies rounds and questions into a new draft (e.g. after a rehearsal). */
competitionsRouter.post('/:id/duplicate', async (req, res) => {
  const source = await ownedCompetition(adminOf(req), req.params.id);
  const rounds = await prisma.round.findMany({
    where: { competitionId: source.id },
    orderBy: roundOrder,
    include: { questions: { orderBy: questionOrder } },
  });
  const copy = await createWithJoinCode((joinCode) => ({
    organizationId: source.organizationId,
    title: `${source.title} (copy)`.slice(0, 120),
    joinCode,
    projectorToken: randomToken(24),
    rollMinLength: source.rollMinLength,
    rollMaxLength: source.rollMaxLength,
    rollDigitsOnly: source.rollDigitsOnly,
    allowLateJoin: source.allowLateJoin,
    rounds: {
      create: rounds.map((r) => ({
        order: r.order,
        title: r.title,
        defaultTimeLimitSec: r.defaultTimeLimitSec,
        defaultMaxPoints: r.defaultMaxPoints,
        defaultMinPoints: r.defaultMinPoints,
        wrongPenalty: r.wrongPenalty,
        questions: {
          create: r.questions.map((q) => ({
            order: q.order,
            prompt: q.prompt,
            code: q.code,
            codeLanguage: q.codeLanguage,
            options: q.options as Prisma.InputJsonValue,
            correctOptionId: q.correctOptionId,
            explanation: q.explanation,
            timeLimitSec: q.timeLimitSec,
            maxPoints: q.maxPoints,
            minPoints: q.minPoints,
          })),
        },
      })),
    },
  }));
  res.status(201).json({ id: copy.id });
});

competitionsRouter.post('/:id/projector-token', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  const updated = await prisma.competition.update({
    where: { id: competition.id },
    data: { projectorToken: randomToken(24) },
  });
  requestBroadcast(competition.id);
  res.json({ projectorToken: updated.projectorToken });
});

// ---------------------------------------------------------------------------
// Live control
// ---------------------------------------------------------------------------

competitionsRouter.post('/:id/commands', async (req, res) => {
  const admin = adminOf(req);
  const competition = await ownedCompetition(admin, req.params.id);
  const command = parse(commandSchema, req.body);
  const result = await executeCommand(competition.id, command, {
    kind: 'admin',
    id: admin.id,
    organizationId: admin.organizationId,
  });
  res.json(result);
});

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

competitionsRouter.post('/:id/rounds', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  requireEditable(competition);
  const input = parse(roundSchema, req.body);
  const round = await prisma.round.create({ data: { ...input, competitionId: competition.id } });
  res.status(201).json(round);
});

competitionsRouter.patch('/rounds/:roundId', async (req, res) => {
  const round = await ownedRound(adminOf(req), req.params.roundId);
  requireEditable(round.competition);
  const input = parse(roundSchema, req.body);
  const updated = await prisma.round.update({ where: { id: round.id }, data: input });
  res.json(updated);
});

competitionsRouter.delete('/rounds/:roundId', async (req, res) => {
  const round = await ownedRound(adminOf(req), req.params.roundId);
  requireEditable(round.competition);
  await prisma.round.delete({ where: { id: round.id } });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

competitionsRouter.post('/rounds/:roundId/questions', async (req, res) => {
  const round = await ownedRound(adminOf(req), req.params.roundId);
  requireEditable(round.competition);
  const input = parse(questionSchema, req.body);
  const question = await prisma.question.create({ data: { ...questionData(input), roundId: round.id } });
  res.status(201).json(question);
});

competitionsRouter.patch('/questions/:questionId', async (req, res) => {
  const question = await ownedQuestion(adminOf(req), req.params.questionId);
  requireEditable(question.round.competition);
  const input = parse(questionSchema, req.body);
  const updated = await prisma.question.update({ where: { id: question.id }, data: questionData(input) });
  res.json(updated);
});

competitionsRouter.delete('/questions/:questionId', async (req, res) => {
  const question = await ownedQuestion(adminOf(req), req.params.questionId);
  requireEditable(question.round.competition);
  await prisma.question.delete({ where: { id: question.id } });
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// CSV import / export
// ---------------------------------------------------------------------------

competitionsRouter.get('/:id/template.csv', async (req, res) => {
  await ownedCompetition(adminOf(req), req.params.id);
  sendCsv(res, 'bitquiz-questions-template.csv', QUESTION_CSV_TEMPLATE);
});

competitionsRouter.post('/:id/import', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  requireEditable(competition);
  const { csv, mode } = parse(importSchema, req.body);
  const { questions, errors } = parseQuestionCsv(csv);
  if (errors.length > 0) {
    throw new HttpError(422, ERROR_CODES.VALIDATION, `The file has ${errors.length} problem(s)`, { errors });
  }

  await prisma.$transaction(async (tx: Tx) => {
    if (mode === 'replace') await tx.round.deleteMany({ where: { competitionId: competition.id } });
    const existing = await tx.round.findMany({ where: { competitionId: competition.id } });
    const roundIdByOrder = new Map(existing.map((r) => [r.order, r.id]));
    for (const roundNumber of [...new Set(questions.map((q) => q.round))].sort((a, b) => a - b)) {
      if (!roundIdByOrder.has(roundNumber)) {
        const created = await tx.round.create({
          data: { competitionId: competition.id, order: roundNumber, title: `Round ${roundNumber}`, ...ROUND_DEFAULTS },
        });
        roundIdByOrder.set(roundNumber, created.id);
      }
    }
    await tx.question.createMany({
      data: questions.map(({ round, ...q }) => ({
        ...questionData(q),
        roundId: roundIdByOrder.get(round)!,
      })),
    });
  });

  res.json({ imported: questions.length });
});

competitionsRouter.get('/:id/results.csv', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  const [{ live }, unansweredBase] = await Promise.all([
    getBoards(competition.id),
    prisma.question.count({ where: { status: 'REVEALED', round: { competitionId: competition.id } } }),
  ]);
  const rows = live.map((r) => [
    r.rank,
    r.name,
    r.roll,
    r.points,
    r.correct,
    r.wrong,
    Math.max(0, unansweredBase - r.correct - r.wrong),
    r.correctTimeMs,
  ]);
  sendCsv(
    res,
    `${slug(competition.title)}-results.csv`,
    toCsv(['rank', 'name', 'roll', 'points', 'correct', 'wrong', 'unanswered', 'total_correct_time_ms'], rows),
  );
});

competitionsRouter.get('/:id/answers.csv', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  const answers = await prisma.answer.findMany({
    where: { participant: { competitionId: competition.id } },
    include: {
      participant: { select: { name: true, roll: true } },
      question: { select: { order: true, prompt: true, status: true, correctOptionId: true, round: true } },
    },
    orderBy: [{ question: { round: { order: 'asc' } } }, { question: { order: 'asc' } }, { receivedAt: 'asc' }],
  });
  const rows = answers.map((a) => [
    a.question.round.order,
    a.question.order,
    a.question.prompt,
    a.question.status,
    a.participant.name,
    a.participant.roll,
    a.optionId,
    a.question.correctOptionId,
    a.isCorrect ? 'yes' : 'no',
    a.responseMs,
    a.points,
    a.receivedAt.toISOString(),
  ]);
  sendCsv(
    res,
    `${slug(competition.title)}-answers.csv`,
    toCsv(
      [
        'round',
        'question',
        'question_text',
        'question_status',
        'name',
        'roll',
        'chosen',
        'correct_option',
        'is_correct',
        'response_ms',
        'points',
        'received_at',
      ],
      rows,
    ),
  );
});

// ---------------------------------------------------------------------------
// Participants, leaderboard, log
// ---------------------------------------------------------------------------

competitionsRouter.get('/:id/leaderboard', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  const { live } = await getBoards(competition.id);
  const revealed = await prisma.question.count({
    where: { status: 'REVEALED', round: { competitionId: competition.id } },
  });
  res.json({
    competition: { id: competition.id, title: competition.title, status: competition.status },
    revealed,
    rows: live,
  });
});

competitionsRouter.get('/:id/log', async (req, res) => {
  const competition = await ownedCompetition(adminOf(req), req.params.id);
  const entries = await prisma.actionLog.findMany({
    where: { competitionId: competition.id },
    orderBy: { at: 'desc' },
    take: 500,
  });
  res.json(entries.map((e) => ({ ...e, id: e.id.toString() })));
});

function sendCsv(res: Response, filename: string, body: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel opens UTF-8 names (e.g. Bangla) correctly.
  res.send(UTF8_BOM + body);
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'competition'
  );
}
