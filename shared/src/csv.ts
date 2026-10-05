import Papa from 'papaparse';
import { CODE_LANGUAGES, OPTION_IDS, type CodeLanguage, type OptionId } from './enums';
import { questionSchema, type QuestionInput } from './schemas';

export const QUESTION_CSV_COLUMNS = [
  'round',
  'order',
  'question',
  'code',
  'code_language',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'option_e',
  'option_f',
  'correct',
  'max_points',
  'min_points',
  'time_limit',
  'explanation',
] as const;

export interface ImportedQuestion extends QuestionInput {
  /** Round number this question belongs to (1-based). */
  round: number;
}

export interface CsvRowError {
  /** 1-based data row number as seen in a spreadsheet (header = row 1). */
  row: number;
  message: string;
}

export interface QuestionCsvResult {
  questions: ImportedQuestion[];
  errors: CsvRowError[];
}

const REQUIRED = ['round', 'question', 'option_a', 'option_b', 'correct'] as const;

/** Parses and validates a question CSV. Never throws; problems are reported per row. */
export function parseQuestionCsv(text: string): QuestionCsvResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  });

  const errors: CsvRowError[] = [];
  const questions: ImportedQuestion[] = [];
  const headers = parsed.meta.fields ?? [];

  const missing = REQUIRED.filter((c) => !headers.includes(c));
  if (missing.length > 0) {
    return { questions, errors: [{ row: 1, message: `Missing column(s): ${missing.join(', ')}` }] };
  }

  for (const e of parsed.errors) {
    if (e.type !== 'FieldMismatch') {
      errors.push({ row: (e.row ?? 0) + 2, message: e.message });
    }
  }

  const autoOrder = new Map<number, number>();

  parsed.data.forEach((raw, index) => {
    const row = index + 2;
    const get = (key: string) => (raw[key] ?? '').trim();
    const rowErrors: string[] = [];

    const round = parseIntStrict(get('round'));
    if (round === null || round < 1) rowErrors.push('round must be a whole number ≥ 1');

    const options = OPTION_IDS.map((id) => ({ id, text: get(`option_${id.toLowerCase()}`) }));
    const lastFilled = options.reduce((last, o, i) => (o.text ? i : last), -1);
    const used = options.slice(0, lastFilled + 1);
    if (used.some((o) => !o.text)) rowErrors.push('options must be filled in order without gaps (A, B, C…)');

    const correct = get('correct').toUpperCase();
    if (!(OPTION_IDS as readonly string[]).includes(correct)) {
      rowErrors.push('correct must be one of A–F');
    } else if (!used.some((o) => o.id === correct)) {
      rowErrors.push(`correct is ${correct} but option_${correct.toLowerCase()} is empty`);
    }

    const language = get('code_language').toLowerCase();
    if (language && !(CODE_LANGUAGES as readonly string[]).includes(language)) {
      rowErrors.push(`code_language must be one of: ${CODE_LANGUAGES.join(', ')}`);
    }

    const optionalInt = (key: string, label: string): number | null => {
      const v = get(key);
      if (!v) return null;
      const n = parseIntStrict(v);
      if (n === null) rowErrors.push(`${label} must be a whole number`);
      return n;
    };
    const maxPoints = optionalInt('max_points', 'max_points');
    const minPoints = optionalInt('min_points', 'min_points');
    const timeLimit = optionalInt('time_limit', 'time_limit');
    const orderValue = optionalInt('order', 'order');

    if (rowErrors.length > 0 || round === null) {
      rowErrors.forEach((message) => errors.push({ row, message }));
      return;
    }

    const order = orderValue ?? (autoOrder.get(round) ?? 0) + 1;
    autoOrder.set(round, Math.max(order, autoOrder.get(round) ?? 0));

    const code = get('code');
    const candidate = {
      order,
      prompt: get('question'),
      code: code || null,
      codeLanguage: code ? ((language || 'text') as CodeLanguage) : null,
      options: used.map((o) => ({ id: o.id as OptionId, text: o.text })),
      correctOptionId: correct as OptionId,
      explanation: get('explanation') || null,
      timeLimitSec: timeLimit,
      maxPoints,
      minPoints,
    };

    const result = questionSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        errors.push({ row, message: `${field}${issue.message}` });
      }
      return;
    }
    questions.push({ ...result.data, round });
  });

  if (parsed.data.length === 0 && errors.length === 0) {
    errors.push({ row: 2, message: 'The file has no question rows' });
  }

  return { questions, errors };
}

export const QUESTION_CSV_TEMPLATE = toCsv(
  [...QUESTION_CSV_COLUMNS],
  [
    [
      1, 1, 'Which algorithm finds shortest paths in a graph with non-negative edge weights?', '', '',
      'DFS', 'Dijkstra', 'Prim', 'Kruskal', '', '', 'B', 100, 50, 20,
      'Dijkstra repeatedly takes the closest unvisited vertex from a priority queue.',
    ],
    [1, 2, "Dijkstra's algorithm can handle negative edge weights.", '', '', 'True', 'False', '', '', '', '', 'B', '', '', 15, ''],
    [
      2, 1, 'What does this program print?', 'for (int i = 0; i < 3; i++)\n    printf("%d", i);', 'c',
      '012', '123', '0123', 'Compile error', '', '', 'A', 200, 100, 30, '',
    ],
  ],
);

/**
 * Serializes rows as CSV. Cells that a spreadsheet would treat as a formula are prefixed
 * with an apostrophe so exported participant names can't run formulas.
 */
export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null>>): string {
  const cell = (value: string | number | boolean | null): string => {
    if (value === null) return '';
    let s = String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

function parseIntStrict(value: string): number | null {
  return /^-?\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}
