import { useState } from 'react';
import { CopyPlus, MoreHorizontal, Play, RotateCcw } from 'lucide-react';
import {
  ACTIVE_QUESTION_STATUSES,
  OPTION_IDS,
  type GmState,
  type OptionId,
  type QuestionStatus,
  type RunSheetQuestion,
} from '@bitquiz/shared';
import type { SendCommand } from './ConsolePage';
import { OptionLetter } from '@/components/quiz';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<QuestionStatus, string> = {
  PENDING: 'border-line-strong',
  MEDIA: 'border-accent bg-accent/15',
  SHOWN: 'border-accent bg-accent/30',
  OPEN: 'border-good bg-good animate-pulse',
  CLOSED: 'border-warn bg-warn/50',
  REVEALED: 'border-accent bg-accent',
  VOID: 'border-bad bg-bad/40',
};

interface Props {
  state: GmState;
  send: SendCommand;
  busy: boolean;
}

export function RunSheet({ state, send, busy }: Props) {
  const [menu, setMenu] = useState<RunSheetQuestion | null>(null);
  const live = state.competition.status === 'LIVE';
  const finished = state.competition.status === 'FINISHED';
  const active = state.question && ACTIVE_QUESTION_STATUSES.includes(state.question.status);

  return (
    <Card className="flex max-h-[calc(100dvh-8rem)] flex-col overflow-hidden xl:sticky xl:top-4">
      <div className="border-b border-line px-4 py-3 text-sm font-semibold">Run sheet</div>
      <div className="flex-1 overflow-y-auto p-2">
        {state.runSheet.map((round) => (
          <div key={round.id} className="mb-3">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-faint">{round.title}</p>
            <ol>
              {round.questions.map((q) => {
                const current = state.question?.id === q.id;
                const canShow = live && !active && q.status === 'PENDING';
                const hasMenu = (live || finished) && q.status !== 'PENDING';
                return (
                  <li
                    key={q.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                      current && 'bg-accent-soft',
                      q.status === 'VOID' && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn('size-2.5 shrink-0 rounded-full border-2', STATUS_DOT[q.status])}
                      title={q.status}
                    />
                    <span className="tabular w-5 shrink-0 text-xs text-faint">{q.order}</span>
                    <span
                      className={cn('min-w-0 flex-1 truncate', q.status === 'VOID' && 'line-through')}
                      title={q.prompt}
                    >
                      {q.prompt}
                    </span>
                    {canShow && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => send({ type: 'SHOW_QUESTION', questionId: q.id })}
                        className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-surface-3 hover:text-accent group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Show question ${q.order} now`}
                        title="Show this question now"
                      >
                        <Play className="size-3.5" />
                      </button>
                    )}
                    {hasMenu && (
                      <button
                        type="button"
                        onClick={() => setMenu(q)}
                        className="rounded p-1 text-muted hover:bg-surface-3 hover:text-fg"
                        aria-label={`Actions for question ${q.order}`}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      {menu && <QuestionActions question={menu} state={state} send={send} busy={busy} onClose={() => setMenu(null)} />}
    </Card>
  );
}

function QuestionActions({
  question,
  state,
  send,
  busy,
  onClose,
}: {
  question: RunSheetQuestion;
  state: GmState;
  send: SendCommand;
  busy: boolean;
  onClose: () => void;
}) {
  const [correct, setCorrect] = useState<OptionId>(question.correctOptionId);
  const canRegrade = question.status === 'CLOSED' || question.status === 'REVEALED';
  const live = state.competition.status === 'LIVE';
  const options = OPTION_IDS.slice(0, question.optionCount);

  return (
    <Dialog open onClose={onClose} title={`Question ${question.order}`} description={question.prompt}>
      <div className="space-y-6">
        {canRegrade && (
          <section>
            <h3 className="mb-1 text-sm font-semibold">Fix the answer key</h3>
            <p className="mb-3 text-sm text-muted">
              Points for everyone who answered are recalculated from their saved answer times.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {options.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCorrect(id)}
                  aria-pressed={correct === id}
                  className={cn('rounded-xl border-2 p-1', correct === id ? 'border-good' : 'border-transparent')}
                >
                  <OptionLetter id={id} className="size-9" />
                </button>
              ))}
              <Button
                variant="warn"
                className="ml-auto"
                disabled={busy || correct === question.correctOptionId}
                onClick={async () => {
                  if (
                    await send(
                      { type: 'REGRADE', questionId: question.id, correctOptionId: correct },
                      `Regraded to ${correct}`,
                    )
                  )
                    onClose();
                }}
              >
                <RotateCcw className="size-4" aria-hidden /> Regrade to {correct}
              </Button>
            </div>
          </section>
        )}
        {live && (
          <section className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button
              disabled={busy}
              onClick={async () => {
                if (await send({ type: 'DUPLICATE_QUESTION', questionId: question.id }, 'Copy added after it'))
                  onClose();
              }}
            >
              <CopyPlus className="size-4" aria-hidden /> Duplicate (re-ask later)
            </Button>
            {question.status !== 'VOID' && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (await send({ type: 'VOID_QUESTION', questionId: question.id }, 'Question voided')) onClose();
                }}
              >
                Void question
              </Button>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
