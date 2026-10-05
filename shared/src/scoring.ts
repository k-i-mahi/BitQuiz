export interface ScoringRule {
  /** Points for a correct answer submitted instantly. */
  maxPoints: number;
  /** Points for a correct answer submitted at the last moment. Always >= 1. */
  minPoints: number;
  /** Points deducted for a wrong answer (0 = no negative marking). */
  wrongPenalty: number;
}

/**
 * Linear speed-based score. A correct answer earns between `minPoints` (at the deadline)
 * and `maxPoints` (instant); a wrong answer costs `wrongPenalty`.
 */
export function computePoints(
  isCorrect: boolean,
  responseMs: number,
  timeLimitMs: number,
  rule: ScoringRule,
): number {
  if (!isCorrect) return rule.wrongPenalty > 0 ? -rule.wrongPenalty : 0;
  const fraction = timeLimitMs > 0 ? clamp(responseMs / timeLimitMs, 0, 1) : 0;
  const points = rule.maxPoints - (rule.maxPoints - rule.minPoints) * fraction;
  return Math.max(rule.minPoints, Math.round(points));
}

/**
 * Answer time measured on the server, minus the participant's estimated one-way network delay.
 * The compensation is capped so that faking a slow connection gains little.
 */
export function adjustResponseMs(rawMs: number, latencyMs: number, latencyCapMs: number): number {
  const compensation = clamp(latencyMs, 0, latencyCapMs);
  return Math.max(0, Math.round(rawMs - compensation));
}

/** Points table shown in the editor so organizers can see what a rule means in practice. */
export function pointsPreview(rule: ScoringRule, timeLimitSec: number): Array<{ atSec: number; points: number }> {
  const marks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * timeLimitSec * 10) / 10);
  const unique = [...new Set(marks)];
  return unique.map((atSec) => ({
    atSec,
    points: computePoints(true, atSec * 1000, timeLimitSec * 1000, rule),
  }));
}

export interface ScoreTotals {
  participantId: string;
  name: string;
  roll: string;
  points: number;
  correct: number;
  wrong: number;
  /** Sum of adjusted response time over correct answers. */
  correctTimeMs: number;
}

export interface RankedRow extends ScoreTotals {
  rank: number;
}

/**
 * Orders by points, then number of correct answers, then total correct-answer time.
 * Rows that are equal on all three share a rank (1, 2, 2, 4 …).
 */
export function rankRows(rows: readonly ScoreTotals[]): RankedRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.correct - a.correct ||
      a.correctTimeMs - b.correctTimeMs ||
      a.roll.localeCompare(b.roll),
  );
  const ranked: RankedRow[] = [];
  sorted.forEach((row, index) => {
    const prev = ranked[index - 1];
    const tied =
      prev !== undefined &&
      prev.points === row.points &&
      prev.correct === row.correct &&
      prev.correctTimeMs === row.correctTimeMs;
    ranked.push({ ...row, rank: tied ? prev.rank : index + 1 });
  });
  return ranked;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
