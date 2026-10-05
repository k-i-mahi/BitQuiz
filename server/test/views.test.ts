import { describe, expect, it } from 'vitest';
import { QUESTION_STATUSES } from '@bitquiz/shared';
import { toQuestionView, type QuestionRecord, type RoundRecord } from '../src/realtime/views';

const round: RoundRecord = {
  id: 'r1',
  order: 1,
  title: 'Round 1',
  defaultTimeLimitSec: 20,
  defaultMaxPoints: 100,
  defaultMinPoints: 50,
  wrongPenalty: 0,
};

const question = (status: QuestionRecord['status']): QuestionRecord => ({
  id: 'q1',
  order: 1,
  prompt: 'Which?',
  code: null,
  codeLanguage: null,
  options: [
    { id: 'A', text: 'x' },
    { id: 'B', text: 'y' },
  ],
  correctOptionId: 'B',
  explanation: 'because',
  timeLimitSec: null,
  maxPoints: 200,
  minPoints: null,
  status,
  openedAt: null,
  endsAt: null,
});

const view = (role: 'gm' | 'screen' | 'participant', status: QuestionRecord['status']) =>
  toQuestionView(role, question(status), round, { number: 1, total: 1 }, { A: 3, B: 5 });

describe('toQuestionView', () => {
  it('never leaks the answer, explanation or distribution to phones or the projector before reveal', () => {
    for (const status of QUESTION_STATUSES.filter((s) => s !== 'REVEALED')) {
      for (const role of ['screen', 'participant'] as const) {
        const json = JSON.stringify(view(role, status));
        expect(json).not.toContain('correctOptionId');
        expect(json).not.toContain('because');
        expect(json).not.toContain('distribution');
      }
    }
  });

  it('shows the answer to everyone after reveal, distribution only to GM and projector', () => {
    expect(view('participant', 'REVEALED').correctOptionId).toBe('B');
    expect(view('participant', 'REVEALED').distribution).toBeUndefined();
    expect(view('screen', 'REVEALED')).toMatchObject({ correctOptionId: 'B', distribution: { A: 3, B: 5 } });
  });

  it('always shows the answer and live distribution to the Game Master', () => {
    expect(view('gm', 'OPEN')).toMatchObject({ correctOptionId: 'B', explanation: 'because', distribution: { B: 5 } });
  });

  it('applies question overrides on top of round defaults', () => {
    expect(view('participant', 'OPEN')).toMatchObject({ timeLimitSec: 20, maxPoints: 200, minPoints: 50 });
  });
});
