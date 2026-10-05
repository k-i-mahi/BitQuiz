import { Router } from 'express';
import { ERROR_CODES, isJoinable, joinRequestSchema, nameSchema, rollSchema } from '@bitquiz/shared';
import { bearerToken, participantOf, requireParticipant } from '../auth/session';
import { isUniqueViolation, prisma } from '../lib/db';
import { HttpError, conflict, forbidden, notFound, parse } from '../lib/errors';
import { joinLimiter } from '../lib/rateLimit';
import { randomToken, sha256 } from '../lib/security';
import { requestBroadcast } from '../realtime/hub';

export const participantsRouter = Router();

const joinInfoSelect = {
  id: true,
  title: true,
  joinCode: true,
  status: true,
  allowLateJoin: true,
  rollMinLength: true,
  rollMaxLength: true,
  rollDigitsOnly: true,
} as const;

/** Public info the join form needs: title and roll rules. */
participantsRouter.get('/join/:joinCode', joinLimiter, async (req, res) => {
  const joinCode = String(req.params.joinCode).trim().toUpperCase();
  const competition = await prisma.competition.findUnique({ where: { joinCode }, select: joinInfoSelect });
  if (!competition || competition.status === 'ARCHIVED') throw notFound('Quiz');
  res.json({
    title: competition.title,
    joinCode: competition.joinCode,
    status: competition.status,
    joinable: isJoinable(competition.status, competition.allowLateJoin),
    rollMinLength: competition.rollMinLength,
    rollMaxLength: competition.rollMaxLength,
    rollDigitsOnly: competition.rollDigitsOnly,
  });
});

participantsRouter.post('/join', joinLimiter, async (req, res) => {
  const request = parse(joinRequestSchema, req.body);
  const competition = await prisma.competition.findUnique({
    where: { joinCode: request.joinCode },
    select: joinInfoSelect,
  });
  if (!competition || competition.status === 'ARCHIVED') throw notFound('Quiz');

  const name = parse(nameSchema, request.name);
  const roll = parse(rollSchema(competition), request.roll);
  const existing = await prisma.participant.findUnique({
    where: { competitionId_roll: { competitionId: competition.id, roll } },
  });

  if (existing) {
    if (existing.kicked) throw new HttpError(403, ERROR_CODES.KICKED, 'You have been removed from this quiz.');
    const presented = bearerToken(req);
    // Same device coming back: hand back the same token.
    if (existing.tokenHash && presented && sha256(presented) === existing.tokenHash) {
      return res.json({ token: presented, participantId: existing.id, name: existing.name, roll: existing.roll });
    }
    if (existing.tokenHash) {
      throw conflict(ERROR_CODES.ROLL_TAKEN, 'This roll has already joined. Ask the organizer if you changed phones.');
    }
    // The organizer reset this participant's device: let the new phone take over, keeping their points.
    const token = randomToken();
    const updated = await prisma.participant.updateMany({
      where: { id: existing.id, tokenHash: null },
      data: { tokenHash: sha256(token), lastSeenAt: new Date() },
    });
    if (updated.count === 0) {
      throw conflict(ERROR_CODES.ROLL_TAKEN, 'This roll has already joined. Ask the organizer if you changed phones.');
    }
    requestBroadcast(competition.id);
    return res.json({ token, participantId: existing.id, name: existing.name, roll: existing.roll });
  }

  if (!isJoinable(competition.status, competition.allowLateJoin)) {
    throw new HttpError(
      403,
      ERROR_CODES.JOIN_CLOSED,
      competition.status === 'DRAFT' ? 'This quiz is not open for joining yet.' : 'Joining is closed for this quiz.',
    );
  }

  const token = randomToken();
  try {
    const participant = await prisma.participant.create({
      data: { competitionId: competition.id, name, roll, tokenHash: sha256(token) },
    });
    requestBroadcast(competition.id);
    res.status(201).json({ token, participantId: participant.id, name, roll });
  } catch (error) {
    // Two phones submitted the same roll at the same moment.
    if (isUniqueViolation(error)) {
      throw conflict(ERROR_CODES.ROLL_TAKEN, 'This roll has already joined. Ask the organizer if you changed phones.');
    }
    throw error;
  }
});

/** Lets a returning phone check its saved token before opening the live connection. */
participantsRouter.get('/participant/me', requireParticipant, async (req, res) => {
  const me = participantOf(req);
  const competition = await prisma.competition.findUnique({
    where: { id: me.competitionId },
    select: { joinCode: true, title: true, status: true },
  });
  if (!competition) throw forbidden();
  res.json({ participantId: me.id, name: me.name, roll: me.roll, competition });
});
