import { ERROR_CODES, isEditable } from '@bitquiz/shared';
import type { Competition } from '@prisma/client';
import type { AuthedAdmin } from '../auth/session';
import { prisma } from '../lib/db';
import { HttpError, idParam, notFound } from '../lib/errors';

/** Loads a competition only if it belongs to the admin's organization. */
export async function ownedCompetition(admin: AuthedAdmin, id: unknown): Promise<Competition> {
  const competition = await prisma.competition.findFirst({
    where: { id: idParam(id, 'Competition'), organizationId: admin.organizationId },
  });
  if (!competition) throw notFound('Competition');
  return competition;
}

export async function ownedRound(admin: AuthedAdmin, id: unknown) {
  const round = await prisma.round.findFirst({
    where: { id: idParam(id, 'Round'), competition: { organizationId: admin.organizationId } },
    include: { competition: true },
  });
  if (!round) throw notFound('Round');
  return round;
}

export async function ownedQuestion(admin: AuthedAdmin, id: unknown) {
  const question = await prisma.question.findFirst({
    where: { id: idParam(id, 'Question'), round: { competition: { organizationId: admin.organizationId } } },
    include: { round: { include: { competition: true } } },
  });
  if (!question) throw notFound('Question');
  return question;
}

/** Rounds and questions can only change while the competition is a draft. */
export function requireEditable(competition: Competition): void {
  if (!isEditable(competition.status)) {
    throw new HttpError(
      409,
      ERROR_CODES.INVALID_TRANSITION,
      'Content is locked once the lobby opens. Close the lobby to edit questions.',
    );
  }
}
