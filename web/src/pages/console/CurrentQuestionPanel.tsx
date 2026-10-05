import { useState } from 'react';
import { Ban, CheckCircle2, Clock, Eye, FastForward, Flag, Play, Plus, Square } from 'lucide-react';
import type { GmState, NextStep } from '@bitquiz/shared';
import type { SendCommand } from './ConsolePage';
import { CodeBlock, OptionLetter, TimerBar, TimerNumber, useRemaining } from '@/components/quiz';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import type { ServerClock } from '@/lib/clock';
import { cn } from '@/lib/utils';

interface Props {
  state: GmState;
  clock: ServerClock;
  busy: boolean;
  send: SendCommand;
  step: NextStep;
  onMainStep: () => void;
}

const STEP_LABEL: Record<Exclude<NextStep, null>, { label: string; icon: typeof Play }> = {
  SHOW: { label: 'Show first question', icon: Eye },
  OPEN: { label: 'Open answering', icon: Play },
  CLOSE: { label: 'Close answering', icon: Square },
  REVEAL: { label: 'Reveal answer', icon: CheckCircle2 },
  NEXT: { label: 'Show next question', icon: FastForward },
  FINISH: { label: 'Finish quiz', icon: Flag },
};

export function CurrentQuestionPanel({ state, clock, busy, send, step, onMainStep }: Props) {
  const question = state.question;
  const remaining = useRemaining(question, clock);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const main = step ? STEP_LABEL[step] : null;
  const active = question && ['SHOWN', 'OPEN', 'CLOSED'].includes(question.status);
  const totalAnswers = Object.values(question?.distribution ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3 text-sm">
          {question ? (
            <>
              <span className="font-semibold">
                {question.roundTitle} · Q{question.number}/{question.total}
              </span>
              <Badge
                tone={
                  question.status === 'OPEN' ? 'good' : question.status === 'REVEALED' ? 'accent' : question.status === 'CLOSED' ? 'warn' : 'neutral'
                }
              >
                {question.status}
              </Badge>
              <span className="text-muted">
                {question.maxPoints}→{question.minPoints} pts · {question.timeLimitSec}s
                {question.wrongPenalty > 0 && ` · −${question.wrongPenalty} wrong`}
              </span>
            </>
          ) : (
            <span className="text-muted">No question on screen</span>
          )}
        </div>
        {question?.status === 'OPEN' && remaining !== null && (
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-muted" aria-hidden />
            <TimerNumber remainingMs={remaining} className="text-3xl" />
          </span>
        )}
      </div>
      {question?.status === 'OPEN' && remaining !== null && (
        <TimerBar remainingMs={remaining} totalMs={question.timeLimitSec * 1000} className="rounded-none" />
      )}

      <div className="space-y-4 p-5">
        {question ? (
          <>
            <p className="text-xl font-semibold leading-snug">{question.prompt}</p>
            {question.code && <CodeBlock code={question.code} language={question.codeLanguage} className="text-sm" />}
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options.map((option) => {
                const correct = option.id === question.correctOptionId;
                const count = question.distribution?.[option.id] ?? 0;
                const pct = totalAnswers ? Math.round((count / totalAnswers) * 100) : 0;
                return (
                  <div
                    key={option.id}
                    className={cn(
                      'relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5',
                      correct ? 'border-good/60' : 'border-line',
                    )}
                  >
                    <div
                      className={cn('absolute inset-y-0 left-0 transition-[width] duration-300', correct ? 'bg-good/15' : 'bg-surface-3')}
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                    <OptionLetter id={option.id} className="relative size-7 text-sm" />
                    <span className="relative flex-1 text-sm">{option.text}</span>
                    {correct && <CheckCircle2 className="relative size-4 text-good" aria-label="Correct answer" />}
                    <span className="tabular relative w-14 text-right text-xs text-muted">
                      {count} · {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
            {question.explanation && <p className="text-sm text-muted">Explanation: {question.explanation}</p>}
          </>
        ) : (
          <p className="py-6 text-center text-muted">
            {state.hasPendingQuestions
              ? 'Press the button (or Space) to show the next question.'
              : 'All questions are done. Show the leaderboard, then finish the quiz.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {main && (
            <Button
              variant={step === 'FINISH' ? 'danger' : 'primary'}
              size="xl"
              loading={busy}
              onClick={onMainStep}
              className="min-w-64"
            >
              <main.icon className="size-5" aria-hidden />
              {main.label}
              <kbd className="ml-2 rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs">Space</kbd>
            </Button>
          )}
          {!active && state.hasPendingQuestions && (
            <Button size="lg" disabled={busy} onClick={() => send({ type: 'OPEN_QUESTION' })} title="Show the next question and start the timer at once">
              <FastForward className="size-4" aria-hidden /> Show + open next
            </Button>
          )}
          {question?.status === 'OPEN' && (
            <Button size="lg" disabled={busy} onClick={() => send({ type: 'EXTEND', seconds: 10 })}>
              <Plus className="size-4" aria-hidden /> 10 s
            </Button>
          )}
          {question && question.status !== 'VOID' && (
            <Button size="lg" variant="ghost" className="ml-auto text-bad hover:text-bad" disabled={busy} onClick={() => setConfirmVoid(true)}>
              <Ban className="size-4" aria-hidden /> Void
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmVoid}
        title="Void this question?"
        description="It won't count for anyone and its points are removed. You can re-ask it with Duplicate in the run sheet."
        confirmLabel="Void question"
        loading={busy}
        onConfirm={async () => {
          if (question && (await send({ type: 'VOID_QUESTION', questionId: question.id }, 'Question voided'))) setConfirmVoid(false);
        }}
        onCancel={() => setConfirmVoid(false)}
      />
    </Card>
  );
}
