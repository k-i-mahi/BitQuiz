import { Prisma } from '@prisma/client';
import { rankRows, type RankedRow, type ScoreTotals } from '@bitquiz/shared';
import { prisma } from '../lib/db';

interface Boards {
  /** Everything revealed so far; what the GM sees. */
  live: RankedRow[];
  /** What phones and the projector see; differs from `live` while the leaderboard is frozen. */
  public: RankedRow[];
}

const cache = new Map<string, Promise<Boards>>();

/**
 * Totals per participant over revealed, non-void questions. With `revealedBefore`, only
 * questions revealed before that moment count (used for the frozen public board).
 */
export async function computeTotals(competitionId: string, revealedBefore?: Date): Promise<ScoreTotals[]> {
  const revealedFilter = revealedBefore ? Prisma.sql`AND q."revealedAt" <= ${revealedBefore}` : Prisma.empty;
  return prisma.$queryRaw<ScoreTotals[]>`
    SELECT p.id AS "participantId",
           p.name,
           p.roll,
           COALESCE(SUM(a.points), 0)::int AS points,
           (COUNT(a.id) FILTER (WHERE a."isCorrect"))::int AS correct,
           (COUNT(a.id) FILTER (WHERE NOT a."isCorrect"))::int AS wrong,
           COALESCE(SUM(a."responseMs") FILTER (WHERE a."isCorrect"), 0)::int AS "correctTimeMs"
      FROM "Participant" p
      LEFT JOIN "Answer" a
        ON a."participantId" = p.id
       AND a."questionId" IN (
             SELECT q.id
               FROM "Question" q
               JOIN "Round" r ON r.id = q."roundId"
              WHERE r."competitionId" = ${competitionId}::uuid
                AND q.status = 'REVEALED'
                ${revealedFilter}
           )
     WHERE p."competitionId" = ${competitionId}::uuid
       AND p.kicked = false
     GROUP BY p.id`;
}

async function buildBoards(competitionId: string): Promise<Boards> {
  const competition = await prisma.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: { leaderboardFrozenAt: true },
  });
  const live = rankRows(await computeTotals(competitionId));
  const frozenAt = competition.leaderboardFrozenAt;
  const publicBoard = frozenAt ? rankRows(await computeTotals(competitionId, frozenAt)) : live;
  return { live, public: publicBoard };
}

/** Cached boards; recomputed only after something that changes scores or names. */
export function getBoards(competitionId: string): Promise<Boards> {
  let boards = cache.get(competitionId);
  if (!boards) {
    boards = buildBoards(competitionId);
    cache.set(competitionId, boards);
    boards.catch(() => cache.delete(competitionId));
  }
  return boards;
}

export function invalidateBoards(competitionId: string): void {
  cache.delete(competitionId);
}
