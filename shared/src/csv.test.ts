import { describe, expect, it } from 'vitest';
import { QUESTION_CSV_TEMPLATE, parseQuestionCsv, toCsv } from './csv';

const header =
  'round,order,question,code,code_language,option_a,option_b,option_c,option_d,option_e,option_f,correct,max_points,min_points,time_limit,explanation';

describe('parseQuestionCsv', () => {
  it('parses the bundled template without errors', () => {
    const result = parseQuestionCsv(QUESTION_CSV_TEMPLATE);
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(4);
    expect(result.questions[3]).toMatchObject({
      mediaKind: 'IMAGE',
      mediaSource: 'LINK',
      mediaOnPhones: true,
    });
    expect(result.questions[0]).toMatchObject({ mediaKind: null, mediaSource: null, mediaRef: null });
    expect(result.questions[1]).toMatchObject({
      round: 1,
      options: [{ id: 'A' }, { id: 'B' }],
      correctOptionId: 'B',
    });
    expect(result.questions[2]).toMatchObject({ round: 2, codeLanguage: 'c', maxPoints: 200, minPoints: 100 });
  });

  it('reports a correct option that points to an empty option', () => {
    const csv = `${header}\n1,1,Q?,,,a,b,,,,,E,,,,`;
    const result = parseQuestionCsv(csv);
    expect(result.questions).toHaveLength(0);
    expect(result.errors[0]).toEqual({ row: 2, message: 'correct is E but option_e is empty' });
  });

  it('rejects min_points below 1 and above max_points', () => {
    const csv = `${header}\n1,1,Q?,,,a,b,,,,,A,100,0,,\n1,2,Q?,,,a,b,,,,,A,10,20,,`;
    const result = parseQuestionCsv(csv);
    expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('rejects gaps between options', () => {
    const csv = `${header}\n1,1,Q?,,,a,,c,,,,A,,,,`;
    expect(parseQuestionCsv(csv).errors[0]?.message).toMatch(/without gaps/);
  });

  it('reports missing required columns', () => {
    expect(parseQuestionCsv('round,question\n1,Q?').errors[0]?.message).toMatch(/Missing column/);
  });

  it('assigns order automatically when the column is empty', () => {
    const csv = `${header}\n1,,Q1,,,a,b,,,,,A,,,,\n1,,Q2,,,a,b,,,,,B,,,,`;
    expect(parseQuestionCsv(csv).questions.map((q) => q.order)).toEqual([1, 2]);
  });
});

describe('parseQuestionCsv media columns', () => {
  const mediaHeader = `${header},media_type,media,media_on_phones`;
  const row = (media: string) => `${mediaHeader}\n1,1,Which algorithm?,,,a,b,,,,,A,,,,,${media}`;

  it('treats a non-link as a file on the projector computer', () => {
    const [q] = parseQuestionCsv(row('video,round1-q1.mp4,')).questions;
    expect(q).toMatchObject({
      mediaKind: 'VIDEO',
      mediaSource: 'LOCAL',
      mediaRef: 'round1-q1.mp4',
      mediaOnPhones: false,
    });
  });

  it('accepts a YouTube link as a video', () => {
    const [q] = parseQuestionCsv(row('video,https://youtu.be/dQw4w9WgXcQ,no')).questions;
    expect(q).toMatchObject({ mediaKind: 'VIDEO', mediaSource: 'LINK' });
  });

  it('reports missing type, unknown type and phones for videos', () => {
    expect(parseQuestionCsv(row(',clip.mp4,')).errors[0]?.message).toMatch(/media_type is required/);
    expect(parseQuestionCsv(row('audio,clip.mp3,')).errors[0]?.message).toMatch(/image or video/);
    expect(parseQuestionCsv(row('video,https://youtu.be/dQw4w9WgXcQ,yes')).errors[0]?.message).toMatch(/linked images/);
    expect(parseQuestionCsv(row('video,clip.txt,')).errors[0]?.message).toMatch(/must end with/);
  });
});

describe('toCsv', () => {
  it('quotes special characters and neutralizes formulas', () => {
    const out = toCsv(
      ['a', 'b'],
      [
        ['=1+1', 'x,"y"'],
        [5, null],
      ],
    );
    expect(out).toBe(`a,b\r\n'=1+1,"x,""y"""\r\n5,\r\n`);
  });
});
