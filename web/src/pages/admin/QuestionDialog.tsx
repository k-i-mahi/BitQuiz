import { useState, type FormEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  CODE_LANGUAGES,
  MAX_OPTIONS,
  MIN_OPTIONS,
  OPTION_IDS,
  pointsPreview,
  questionSchema,
  type MediaKind,
  type MediaSource,
  type OptionId,
} from '@bitquiz/shared';
import type { QuestionRow, RoundRow } from './editor-types';
import { MediaFields } from './MediaFields';
import { CodeBlock, OptionLetter } from '@/components/quiz';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  round: RoundRow;
  question: QuestionRow | null;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const optionalNumber = (value: string): number | null => (value.trim() === '' ? null : Number(value));

export function QuestionDialog({ round, question, readOnly = false, onClose, onSaved }: Props) {
  const nextOrder = Math.max(0, ...round.questions.map((q) => q.order)) + 1;
  const [order, setOrder] = useState(String(question?.order ?? nextOrder));
  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [withCode, setWithCode] = useState(Boolean(question?.code));
  const [code, setCode] = useState(question?.code ?? '');
  const [codeLanguage, setCodeLanguage] = useState(question?.codeLanguage ?? 'c');
  const [options, setOptions] = useState<string[]>(question?.options.map((o) => o.text) ?? ['', '', '', '']);
  const [correct, setCorrect] = useState<OptionId>(question?.correctOptionId ?? 'A');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [timeLimit, setTimeLimit] = useState(question?.timeLimitSec?.toString() ?? '');
  const [maxPoints, setMaxPoints] = useState(question?.maxPoints?.toString() ?? '');
  const [minPoints, setMinPoints] = useState(question?.minPoints?.toString() ?? '');
  const [mediaKind, setMediaKind] = useState<MediaKind | ''>(question?.mediaKind ?? '');
  const [mediaSource, setMediaSource] = useState<MediaSource>(question?.mediaSource ?? 'LINK');
  const [mediaRef, setMediaRef] = useState(question?.mediaRef ?? '');
  const [mediaOnPhones, setMediaOnPhones] = useState(question?.mediaOnPhones ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effective = {
    timeLimitSec: optionalNumber(timeLimit) ?? round.defaultTimeLimitSec,
    maxPoints: optionalNumber(maxPoints) ?? round.defaultMaxPoints,
    minPoints: optionalNumber(minPoints) ?? round.defaultMinPoints,
  };
  const ruleValid =
    effective.minPoints >= 1 && effective.minPoints <= effective.maxPoints && effective.timeLimitSec >= 5;

  const removeOption = (index: number) => {
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
    const correctIndex = OPTION_IDS.indexOf(correct);
    if (correctIndex === index) setCorrect('A');
    else if (correctIndex > index) setCorrect(OPTION_IDS[correctIndex - 1]!);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      order: Number(order),
      prompt,
      code: withCode && code.trim() ? code : null,
      codeLanguage: withCode && code.trim() ? codeLanguage : null,
      options: options.map((text, i) => ({ id: OPTION_IDS[i]!, text })),
      correctOptionId: correct,
      explanation: explanation.trim() || null,
      timeLimitSec: optionalNumber(timeLimit),
      maxPoints: optionalNumber(maxPoints),
      minPoints: optionalNumber(minPoints),
      mediaKind: mediaKind || null,
      mediaSource: mediaKind ? mediaSource : null,
      mediaRef: mediaKind ? mediaRef.trim() : null,
      mediaOnPhones: mediaKind === 'IMAGE' && mediaSource === 'LINK' && mediaOnPhones,
    };
    const parsed = questionSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue?.path.join('.') ? `${issue.path.join('.')}: ` : ''}${issue?.message ?? 'Invalid question'}`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (question) {
        await api(`/competitions/questions/${question.id}`, { method: 'PATCH', body: parsed.data });
      } else {
        await api(`/competitions/rounds/${round.id}/questions`, { method: 'POST', body: parsed.data });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={readOnly ? 'Question' : question ? 'Edit question' : 'New question'}
      description={round.title}
      className="w-[min(46rem,calc(100vw-2rem))]"
    >
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={readOnly} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <div>
              <Label htmlFor="q-order">Order</Label>
              <Input id="q-order" type="number" min={1} value={order} onChange={(e) => setOrder(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="q-prompt">Question</Label>
              <Textarea
                id="q-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={1000}
                required
                autoFocus
                className="min-h-20"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-muted">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={withCode}
                onChange={(e) => setWithCode(e.target.checked)}
              />
              Include a code block
            </label>
            {withCode && (
              <div className="mt-3 grid gap-3">
                <Select
                  value={codeLanguage}
                  onChange={(e) => setCodeLanguage(e.target.value)}
                  aria-label="Code language"
                  className="w-48"
                >
                  {CODE_LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={4000}
                  spellCheck={false}
                  aria-label="Code"
                  className="min-h-32 font-mono text-sm"
                />
                {code.trim() && <CodeBlock code={code} language={codeLanguage} className="text-sm" />}
              </div>
            )}
          </div>

          <MediaFields
            kind={mediaKind}
            source={mediaSource}
            mediaRef={mediaRef}
            onPhones={mediaOnPhones}
            onKind={setMediaKind}
            onSource={setMediaSource}
            onRef={setMediaRef}
            onPhonesChange={setMediaOnPhones}
          />

          <div>
            <Label>Options — select the correct one</Label>
            <div className="space-y-2">
              {options.map((text, index) => {
                const id = OPTION_IDS[index]!;
                return (
                  <div
                    key={id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-2 pr-2.5',
                      correct === id ? 'border-good/60 bg-good-soft' : 'border-line',
                    )}
                  >
                    <input
                      type="radio"
                      name="correct"
                      checked={correct === id}
                      onChange={() => setCorrect(id)}
                      aria-label={`Option ${id} is correct`}
                      className="ml-1 size-4 accent-[var(--color-good)]"
                    />
                    <OptionLetter id={id} className="size-8 text-sm" />
                    <Input
                      value={text}
                      onChange={(e) => setOptions(options.map((o, i) => (i === index ? e.target.value : o)))}
                      placeholder={`Option ${id}`}
                      maxLength={200}
                      required
                      aria-label={`Option ${id}`}
                      className="h-9 flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove option ${id}`}
                      disabled={options.length <= MIN_OPTIONS}
                      onClick={() => removeOption(index)}
                    >
                      <Minus className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={options.length >= MAX_OPTIONS}
                onClick={() => setOptions([...options, ''])}
              >
                <Plus className="size-4" aria-hidden /> Add option
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOptions(['True', 'False']);
                  setCorrect('A');
                }}
              >
                Make True / False
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="q-time">Time (s)</Label>
              <Input
                id="q-time"
                type="number"
                min={5}
                max={300}
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                placeholder={`${round.defaultTimeLimitSec} (round)`}
              />
            </div>
            <div>
              <Label htmlFor="q-max">Max points</Label>
              <Input
                id="q-max"
                type="number"
                min={1}
                value={maxPoints}
                onChange={(e) => setMaxPoints(e.target.value)}
                placeholder={`${round.defaultMaxPoints} (round)`}
              />
            </div>
            <div>
              <Label htmlFor="q-min">Min points</Label>
              <Input
                id="q-min"
                type="number"
                min={1}
                value={minPoints}
                onChange={(e) => setMinPoints(e.target.value)}
                placeholder={`${round.defaultMinPoints} (round)`}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted">
            {ruleValid
              ? `Correct at ${pointsPreview({ ...effective, wrongPenalty: round.wrongPenalty }, effective.timeLimitSec)
                  .map((p) => `${p.atSec}s → ${p.points}`)
                  .join(' · ')}`
              : 'Min points must be at least 1 and no more than max points; time at least 5 s.'}
          </p>

          <div>
            <Label htmlFor="q-explanation">Explanation (shown after reveal, optional)</Label>
            <Textarea
              id="q-explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              maxLength={1000}
              className="min-h-16"
            />
          </div>
        </fieldset>

        <FieldError>{error}</FieldError>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button type="submit" variant="primary" loading={saving}>
              {question ? 'Save question' : 'Add question'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
