import { describe, expect, it } from 'vitest';
import { nameSchema, questionSchema, rollSchema } from './schemas';

describe('rollSchema', () => {
  const kuet = rollSchema({ rollMinLength: 7, rollMaxLength: 7, rollDigitsOnly: true });

  it('accepts a 7-digit roll and trims it', () => {
    expect(kuet.parse(' 2107001 ')).toBe('2107001');
  });

  it('rejects wrong length and non-digits', () => {
    expect(kuet.safeParse('210700').success).toBe(false);
    expect(kuet.safeParse('21070A1').success).toBe(false);
  });

  it('normalizes letters to upper case when letters are allowed', () => {
    const loose = rollSchema({ rollMinLength: 3, rollMaxLength: 12, rollDigitsOnly: false });
    expect(loose.parse('cse-21')).toBe('CSE-21');
  });
});

describe('nameSchema', () => {
  it('collapses whitespace', () => {
    expect(nameSchema.parse('  Rahim   Ahmed ')).toBe('Rahim Ahmed');
  });

  it('rejects too-short names', () => {
    expect(nameSchema.safeParse('R').success).toBe(false);
  });
});

describe('questionSchema', () => {
  const valid = {
    order: 1,
    prompt: 'Q?',
    code: null,
    codeLanguage: null,
    options: [
      { id: 'A', text: 'x' },
      { id: 'B', text: 'y' },
    ],
    correctOptionId: 'A',
    explanation: null,
    timeLimitSec: null,
    maxPoints: null,
    minPoints: null,
  };

  it('accepts a two-option question', () => {
    expect(questionSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a correct option that does not exist', () => {
    expect(questionSchema.safeParse({ ...valid, correctOptionId: 'C' }).success).toBe(false);
  });

  it('rejects options out of order', () => {
    const options = [
      { id: 'B', text: 'x' },
      { id: 'A', text: 'y' },
    ];
    expect(questionSchema.safeParse({ ...valid, options }).success).toBe(false);
  });
});
