import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Clock, Hourglass, Lock, MonitorPlay, Trophy, XCircle } from 'lucide-react';
import type { OptionId, ParticipantState, QuestionView } from '@bitquiz/shared';
import {
  CodeBlock,
  ConnectionBanner,
  Logo,
  OptionLetter,
  TimerBar,
  TimerNumber,
  optionClasses,
  useRemaining,
  type OptionState,
} from '@/components/quiz';
import { MediaView } from '@/components/MediaView';
import { Button } from '@/components/ui/button';
import { FullPageSpinner } from '@/components/ui/spinner';
import { ApiError, api } from '@/lib/api';
import { useLive } from '@/lib/live';
import { cn, formatSeconds, randomId } from '@/lib/utils';

interface Props {
  token: string;
  onSignedOut: (message: string) => void;
}

type Submission =
  | { questionId: string; optionId: OptionId; status: 'sending' }
  | { questionId: string; optionId: OptionId; status: 'locked' }
  | { questionId: string; optionId: OptionId; status: 'failed'; message: string };

export function LiveParticipant({ token, onSignedOut }: Props) {
  const { state, me, status, kicked, clock } = useLive<ParticipantState>({ role: 'participant', token });
  useWakeLock();

  useEffect(() => {
    if (kicked === 'reset') onSignedOut('The organizer reset your device. Join again with the same name and roll.');
    else if (kicked === 'kicked') onSignedOut('You were removed from this quiz by the organizer.');
    else if (status === 'denied') onSignedOut('Your session ended. Please join again.');
  }, [kicked, status, onSignedOut]);

  if (!state || !me) return <FullPageSpinner label="Connecting to the quiz" />;

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBanner status={status} />
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface/70 px-4 py-3 backdrop-blur">
        <Logo size="sm" />
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold">{me.name}</p>
          <p className="font-mono text-xs text-faint">{me.roll}</p>
        </div>
      </header>
      <div className="flex items-center justify-between border-b border-line/60 px-4 py-2 text-sm">
        <span className="truncate text-muted">{state.competition.title}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="tabular font-display font-semibold">{me.totalPoints} pts</span>
          {me.rank !== null && state.competition.status !== 'LOBBY' && (
            <span className="tabular rounded-md bg-surface-3 px-2 py-0.5 text-xs text-muted">
              #{me.rank} / {me.participantCount}
            </span>
          )}
        </span>
      </div>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-5">
        <Body state={state} me={me} token={token} clock={clock} />
      </main>
    </div>
  );
}

function Body({
  state,
  me,
  token,
  clock,
}: {
  state: ParticipantState;
  me: NonNullable<ReturnType<typeof useLive<ParticipantState>>['me']>;
  token: string;
  clock: ReturnType<typeof useLive>['clock'];
}) {
  const { competition, question } = state;

  if (competition.status === 'FINISHED') {
    return (
      <Centered>
        <Trophy className="size-14 text-warn" aria-hidden />
        <h1 className="text-3xl font-bold">Quiz finished</h1>
        <p className="text-muted">Thanks for playing, {me.name.split(' ')[0]}!</p>
        <div className="mt-4 grid w-full grid-cols-2 gap-3">
          <Stat label="Your points" value={me.totalPoints} />
          <Stat label="Your rank" value={me.rank ? `#${me.rank}` : '—'} />
        </div>
      </Centered>
    );
  }

  if (competition.displayMode === 'HOLD' && (!question || question.status === 'REVEALED')) {
    return (
      <Centered>
        <Clock className="size-12 text-accent" aria-hidden />
        <h1 className="text-2xl font-bold">{competition.holdMessage || 'Short break'}</h1>
        <p className="text-muted">Stay on this page. The quiz will continue here.</p>
      </Centered>
    );
  }

  if (!question) {
    return (
      <Centered>
        <motion.div
          className="grid size-20 place-items-center rounded-full bg-accent-soft"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <Hourglass className="size-9 text-accent" aria-hidden />
        </motion.div>
        <h1 className="text-2xl font-bold">You&apos;re in, {me.name.split(' ')[0]}!</h1>
        <p className="text-muted">
          {competition.status === 'LOBBY'
            ? 'Watch the screen. The quiz starts soon.'
            : 'Get ready — the next question is coming.'}
        </p>
        <p className="tabular text-sm text-faint">{state.participantCount} participants joined</p>
      </Centered>
    );
  }

  return <QuestionScreen key={question.id} question={question} me={me} token={token} clock={clock} />;
}

function QuestionScreen({
  question,
  me,
  token,
  clock,
}: {
  question: QuestionView;
  me: NonNullable<ReturnType<typeof useLive<ParticipantState>>['me']>;
  token: string;
  clock: ReturnType<typeof useLive>['clock'];
}) {
  const remaining = useRemaining(question, clock);
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const requestId = useRef(randomId());

  const serverAnswer = me.answer?.questionId === question.id ? me.answer.optionId : null;
  const lockedOption = serverAnswer ?? (submission?.status !== 'failed' ? submission?.optionId : null) ?? null;
  const open = question.status === 'OPEN' && (remaining ?? 0) > 0;
  const canAnswer = open && !lockedOption && submission?.status !== 'sending';
  const result = me.result?.questionId === question.id ? me.result : null;

  const submit = async (optionId: OptionId) => {
    setSubmission({ questionId: question.id, optionId, status: 'sending' });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await api<{ optionId: OptionId }>('/answers', {
          method: 'POST',
          token,
          body: { questionId: question.id, optionId, clientRequestId: requestId.current },
        });
        setSubmission({ questionId: question.id, optionId: response.optionId, status: 'locked' });
        return;
      } catch (error) {
        // Retry only network failures; the same request id makes retries safe.
        if (error instanceof ApiError && error.status !== 0) {
          setSubmission({ questionId: question.id, optionId, status: 'failed', message: error.message });
          return;
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    setSubmission({ questionId: question.id, optionId, status: 'failed', message: 'Network problem. Tap Lock again.' });
  };

  const optionState = (id: OptionId): OptionState => {
    if (question.status === 'REVEALED') {
      if (id === question.correctOptionId) return 'correct';
      if (id === lockedOption) return 'wrong';
      return 'dimmed';
    }
    if (lockedOption) return id === lockedOption ? 'selected' : 'dimmed';
    if (selected === id) return 'selected';
    return question.status === 'OPEN' ? 'idle' : 'dimmed';
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
        <span className="truncate">
          {question.roundTitle} · Q{question.number}/{question.total}
        </span>
        {question.status === 'OPEN' && remaining !== null && (
          <TimerNumber remainingMs={remaining} className="text-2xl" />
        )}
      </div>
      {question.status === 'OPEN' && remaining !== null && (
        <TimerBar remainingMs={remaining} totalMs={question.timeLimitSec * 1000} />
      )}

      {question.watchScreen && (
        <p className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent">
          <MonitorPlay className="size-4 shrink-0" aria-hidden /> Watch the screen: this question has a video or
          picture.
        </p>
      )}
      <h1 className="text-xl font-semibold leading-snug">{question.prompt}</h1>
      {question.media && (
        <MediaView key={question.id} media={question.media} className="h-56 w-full rounded-2xl border border-line" />
      )}
      {question.code && <CodeBlock code={question.code} language={question.codeLanguage} className="text-[13px]" />}

      <div className="grid gap-2.5">
        {question.options.map((option) => {
          const stateName = optionState(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={!canAnswer}
              onClick={() => setSelected(option.id)}
              aria-pressed={selected === option.id}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-2xl border p-3 text-left text-base font-medium transition-all',
                optionClasses(stateName),
                canAnswer && 'active:scale-[0.99]',
              )}
            >
              <OptionLetter id={option.id} className="size-9" />
              <span className="flex-1">{option.text}</span>
              {stateName === 'correct' && <CheckCircle2 className="size-5 text-good" aria-label="Correct answer" />}
              {stateName === 'wrong' && <XCircle className="size-5 text-bad" aria-label="Your answer" />}
              {stateName === 'selected' && lockedOption && <Lock className="size-4 text-accent" aria-label="Locked" />}
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${question.status}-${lockedOption ?? ''}-${submission?.status ?? ''}-${Boolean(result)}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Footer
              question={question}
              open={open}
              selected={selected}
              lockedOption={lockedOption}
              submission={submission}
              result={result}
              onLock={() => selected && submit(selected)}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Footer({
  question,
  open,
  selected,
  lockedOption,
  submission,
  result,
  onLock,
}: {
  question: QuestionView;
  open: boolean;
  selected: OptionId | null;
  lockedOption: OptionId | null;
  submission: Submission | null;
  result: { isCorrect: boolean; points: number; responseMs: number } | null;
  onLock: () => void;
}) {
  if (question.status === 'REVEALED') {
    if (!lockedOption) return <Notice tone="neutral" title="No answer" text="You didn't answer this one. 0 points." />;
    if (!result) return <Notice tone="neutral" title="Checking…" text="" />;
    return result.isCorrect ? (
      <Notice
        tone="good"
        title={`Correct! +${result.points}`}
        text={`Answered in ${formatSeconds(result.responseMs)} s${question.explanation ? ` · ${question.explanation}` : ''}`}
      />
    ) : (
      <Notice
        tone="bad"
        title={result.points < 0 ? `Wrong. ${result.points}` : 'Wrong answer'}
        text={`Correct answer: ${question.correctOptionId}${question.explanation ? ` · ${question.explanation}` : ''}`}
      />
    );
  }

  if (submission?.status === 'sending') return <Notice tone="neutral" title="Sending…" text="Hold on a moment." />;
  if (lockedOption) {
    return (
      <Notice
        tone="accent"
        title={`Answer ${lockedOption} locked`}
        text={question.status === 'OPEN' ? 'Wait for the time to run out.' : 'Waiting for the answer…'}
      />
    );
  }
  if (submission?.status === 'failed' && !open)
    return <Notice tone="bad" title="Not counted" text={submission.message} />;

  if (question.status === 'SHOWN')
    return <Notice tone="neutral" title="Get ready…" text="Answering opens in a moment." />;
  if (!open) return <Notice tone="neutral" title="Time's up" text="Waiting for the answer…" />;

  return (
    <div className="space-y-2">
      {submission?.status === 'failed' && <p className="text-center text-sm text-bad">{submission.message}</p>}
      <Button variant="primary" size="xl" className="w-full" disabled={!selected} onClick={onLock}>
        {selected ? `Lock answer ${selected}` : 'Tap an option'}
      </Button>
    </div>
  );
}

function Notice({ tone, title, text }: { tone: 'good' | 'bad' | 'accent' | 'neutral'; title: string; text: string }) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-2xl border p-4 text-center',
        tone === 'good' && 'border-good/40 bg-good-soft',
        tone === 'bad' && 'border-bad/40 bg-bad-soft',
        tone === 'accent' && 'border-accent/40 bg-accent-soft',
        tone === 'neutral' && 'border-line bg-surface-2',
      )}
    >
      <p
        className={cn(
          'font-display text-xl font-bold',
          tone === 'good' && 'text-good',
          tone === 'bad' && 'text-bad',
          tone === 'accent' && 'text-accent',
        )}
      >
        {title}
      </p>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{children}</div>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className="tabular font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

/** Keeps the phone screen on during the quiz where the browser supports it. */
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<typeof lock> } };
        lock = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        // Not supported or denied; harmless.
      }
    };
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
