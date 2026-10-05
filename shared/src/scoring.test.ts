import { describe, expect, it } from 'vitest';
import { adjustResponseMs, computePoints, pointsPreview, rankRows, type ScoreTotals } from './scoring';

const rule = { maxPoints: 100, minPoints: 50, wrongPenalty: 0 };

describe('computePoints', () => {
  it('gives max points for an instant correct answer', () => {
    expect(computePoints(true, 0, 20_000, rule)).toBe(100);
  });

  it('decreases linearly with answer time', () => {
    expect(computePoints(true, 5_000, 20_000, rule)).toBe(88);
    expect(computePoints(true, 10_000, 20_000, rule)).toBe(75);
  });

  it('never gives less than minPoints for a correct answer', () => {
    expect(computePoints(true, 20_000, 20_000, rule)).toBe(50);
    expect(computePoints(true, 25_000, 20_000, rule)).toBe(50);
    expect(computePoints(true, 20_000, 20_000, { maxPoints: 10, minPoints: 1, wrongPenalty: 0 })).toBe(1);
  });

  it('gives 0 for a wrong answer without penalty and -penalty with one', () => {
    expect(computePoints(false, 1_000, 20_000, rule)).toBe(0);
    expect(computePoints(false, 1_000, 20_000, { ...rule, wrongPenalty: 25 })).toBe(-25);
  });

  it('handles equal max and min', () => {
    expect(computePoints(true, 7_000, 20_000, { maxPoints: 10, minPoints: 10, wrongPenalty: 0 })).toBe(10);
  });
});

describe('adjustResponseMs', () => {
  it('subtracts measured latency', () => {
    expect(adjustResponseMs(3_000, 200, 500)).toBe(2_800);
  });

  it('caps the latency compensation', () => {
    expect(adjustResponseMs(3_000, 5_000, 500)).toBe(2_500);
  });

  it('never returns a negative time', () => {
    expect(adjustResponseMs(100, 400, 500)).toBe(0);
    expect(adjustResponseMs(1_000, -50, 500)).toBe(1_000);
  });
});

describe('pointsPreview', () => {
  it('lists points at quarters of the time limit', () => {
    expect(pointsPreview(rule, 20)).toEqual([
      { atSec: 0, points: 100 },
      { atSec: 5, points: 88 },
      { atSec: 10, points: 75 },
      { atSec: 15, points: 63 },
      { atSec: 20, points: 50 },
    ]);
  });
});

describe('rankRows', () => {
  const row = (roll: string, points: number, correct: number, correctTimeMs: number): ScoreTotals => ({
    participantId: roll,
    name: roll,
    roll,
    points,
    correct,
    wrong: 0,
    correctTimeMs,
  });

  it('orders by points, then correct count, then time', () => {
    const ranked = rankRows([
      row('a', 100, 1, 900),
      row('b', 300, 3, 9000),
      row('c', 100, 2, 5000),
      row('d', 100, 2, 4000),
    ]);
    expect(ranked.map((r) => [r.roll, r.rank])).toEqual([
      ['b', 1],
      ['d', 2],
      ['c', 3],
      ['a', 4],
    ]);
  });

  it('gives fully tied rows the same rank and skips the next', () => {
    const ranked = rankRows([row('a', 50, 1, 1000), row('b', 50, 1, 1000), row('c', 10, 1, 1000)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('returns an empty list for no rows', () => {
    expect(rankRows([])).toEqual([]);
  });
});
