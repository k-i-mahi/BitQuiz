import { describe, expect, it } from 'vitest';
import { canMoveCompetition, canMoveQuestion, checkAcceptance, nextStep, type AcceptanceInput } from './rules';

describe('competition transitions', () => {
  it('allows the normal lifecycle', () => {
    expect(canMoveCompetition('DRAFT', 'LOBBY')).toBe(true);
    expect(canMoveCompetition('LOBBY', 'LIVE')).toBe(true);
    expect(canMoveCompetition('LIVE', 'FINISHED')).toBe(true);
    expect(canMoveCompetition('FINISHED', 'ARCHIVED')).toBe(true);
  });

  it('blocks skipping or reversing a live competition', () => {
    expect(canMoveCompetition('DRAFT', 'LIVE')).toBe(false);
    expect(canMoveCompetition('LIVE', 'LOBBY')).toBe(false);
    expect(canMoveCompetition('FINISHED', 'LIVE')).toBe(false);
    expect(canMoveCompetition('LIVE', 'ARCHIVED')).toBe(false);
  });
});

describe('question transitions', () => {
  it('allows show, open, extend, close, reveal', () => {
    expect(canMoveQuestion('PENDING', 'SHOWN')).toBe(true);
    expect(canMoveQuestion('PENDING', 'OPEN')).toBe(true);
    expect(canMoveQuestion('SHOWN', 'OPEN')).toBe(true);
    expect(canMoveQuestion('OPEN', 'OPEN')).toBe(true);
    expect(canMoveQuestion('OPEN', 'CLOSED')).toBe(true);
    expect(canMoveQuestion('CLOSED', 'REVEALED')).toBe(true);
  });

  it('allows voiding any question that has been shown', () => {
    for (const s of ['SHOWN', 'OPEN', 'CLOSED', 'REVEALED'] as const) {
      expect(canMoveQuestion(s, 'VOID')).toBe(true);
    }
    expect(canMoveQuestion('PENDING', 'VOID')).toBe(false);
  });

  it('blocks going backwards', () => {
    expect(canMoveQuestion('CLOSED', 'OPEN')).toBe(false);
    expect(canMoveQuestion('REVEALED', 'CLOSED')).toBe(false);
    expect(canMoveQuestion('VOID', 'OPEN')).toBe(false);
    expect(canMoveQuestion('PENDING', 'REVEALED')).toBe(false);
  });
});

describe('nextStep', () => {
  it('follows show → open → close → reveal → next', () => {
    expect(nextStep(null, true)).toBe('SHOW');
    expect(nextStep('SHOWN', true)).toBe('OPEN');
    expect(nextStep('OPEN', true)).toBe('CLOSE');
    expect(nextStep('CLOSED', true)).toBe('REVEAL');
    expect(nextStep('REVEALED', true)).toBe('NEXT');
    expect(nextStep('REVEALED', false)).toBe('FINISH');
    expect(nextStep(null, false)).toBe('FINISH');
  });
});

describe('checkAcceptance', () => {
  const base: AcceptanceInput = {
    receivedAt: 10_000,
    competitionStatus: 'LIVE',
    currentQuestionId: 'q1',
    questionId: 'q1',
    questionStatus: 'OPEN',
    endsAt: 10_000,
    closedAt: null,
    graceMs: 1_000,
  };

  it('accepts before and exactly at the deadline', () => {
    expect(checkAcceptance({ ...base, receivedAt: 5_000 })).toEqual({ ok: true });
    expect(checkAcceptance(base)).toEqual({ ok: true });
  });

  it('accepts inside the grace window, even after auto-close', () => {
    expect(checkAcceptance({ ...base, receivedAt: 11_000 })).toEqual({ ok: true });
    expect(
      checkAcceptance({ ...base, receivedAt: 10_900, questionStatus: 'CLOSED', closedAt: 11_000 }),
    ).toEqual({ ok: true });
  });

  it('rejects after the grace window', () => {
    expect(checkAcceptance({ ...base, receivedAt: 11_001 })).toEqual({ ok: false, reason: 'TOO_LATE' });
  });

  it('uses the early close time when the GM closes before the deadline', () => {
    const closedEarly = { ...base, questionStatus: 'CLOSED' as const, closedAt: 4_000 };
    expect(checkAcceptance({ ...closedEarly, receivedAt: 4_900 })).toEqual({ ok: true });
    expect(checkAcceptance({ ...closedEarly, receivedAt: 6_000 })).toEqual({ ok: false, reason: 'TOO_LATE' });
  });

  it('rejects answers for anything other than the current open question', () => {
    expect(checkAcceptance({ ...base, questionId: 'q2' })).toEqual({ ok: false, reason: 'NOT_ACCEPTING' });
    expect(checkAcceptance({ ...base, questionStatus: 'SHOWN' })).toEqual({ ok: false, reason: 'NOT_ACCEPTING' });
    expect(checkAcceptance({ ...base, questionStatus: 'REVEALED' })).toEqual({
      ok: false,
      reason: 'NOT_ACCEPTING',
    });
    expect(checkAcceptance({ ...base, competitionStatus: 'FINISHED' })).toEqual({
      ok: false,
      reason: 'NOT_ACCEPTING',
    });
  });
});
