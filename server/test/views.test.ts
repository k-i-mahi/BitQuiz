import { describe, expect, it } from 'vitest';
import { QUESTION_STATUSES } from '@bitquiz/shared';
import { mediaFor, toQuestionView, type QuestionRecord, type RoundRecord } from '../src/realtime/views';

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
  mediaKind: null,
  mediaSource: null,
  mediaRef: null,
  mediaOnPhones: false,
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

describe('mediaFor', () => {
  const withMedia = (media: Partial<QuestionRecord>): QuestionRecord => ({ ...question('SHOWN'), ...media });
  const video = withMedia({ mediaKind: 'VIDEO', mediaSource: 'LINK', mediaRef: 'https://youtu.be/dQw4w9WgXcQ' });
  const phoneImage = withMedia({
    mediaKind: 'IMAGE',
    mediaSource: 'LINK',
    mediaRef: 'https://example.com/graph.png',
    mediaOnPhones: true,
  });
  const projectorImage = withMedia({ mediaKind: 'IMAGE', mediaSource: 'LOCAL', mediaRef: 'graph.png' });

  it('gives the projector and console every kind of media', () => {
    for (const q of [video, phoneImage, projectorImage]) {
      expect(mediaFor('screen', q)).not.toBeNull();
      expect(mediaFor('gm', q)).not.toBeNull();
    }
  });

  it('never sends videos or projector-only images to phones', () => {
    expect(mediaFor('participant', video)).toBeNull();
    expect(mediaFor('participant', projectorImage)).toBeNull();
    expect(mediaFor('participant', { ...video, mediaOnPhones: true })).toBeNull();
  });

  it('sends linked images marked for phones', () => {
    expect(mediaFor('participant', phoneImage)).toEqual({
      kind: 'IMAGE',
      source: 'LINK',
      ref: 'https://example.com/graph.png',
      onPhones: true,
    });
  });

  it('returns nothing for questions without media', () => {
    expect(mediaFor('screen', question('SHOWN'))).toBeNull();
  });
});

describe('media stage', () => {
  const staged: QuestionRecord = {
    ...question('MEDIA'),
    code: 'int x;',
    codeLanguage: 'c',
    mediaKind: 'VIDEO',
    mediaSource: 'LINK',
    mediaRef: 'https://youtu.be/6GoRsZayogE',
  };
  const stagedView = (role: 'gm' | 'screen' | 'participant') =>
    toQuestionView(role, staged, round, { number: 1, total: 1 }, {});

  it('withholds the question text, code and options from the projector and phones', () => {
    for (const role of ['screen', 'participant'] as const) {
      const v = stagedView(role);
      expect(v).toMatchObject({ prompt: '', code: null, options: [] });
      expect(JSON.stringify(v)).not.toContain('Which?');
    }
  });

  it('still gives the projector the media, and the organizer everything', () => {
    expect(stagedView('screen').media?.kind).toBe('VIDEO');
    expect(stagedView('participant').watchScreen).toBe(true);
    expect(stagedView('gm')).toMatchObject({ prompt: 'Which?', code: 'int x;' });
    expect(stagedView('gm').options).toHaveLength(2);
  });

  it('shows everything once the question is shown', () => {
    const shown = toQuestionView('participant', { ...staged, status: 'SHOWN' }, round, { number: 1, total: 1 }, {});
    expect(shown.prompt).toBe('Which?');
    expect(shown.options).toHaveLength(2);
  });
});
