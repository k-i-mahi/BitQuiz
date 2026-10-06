import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Check, Crown, Maximize, Snowflake, Users } from 'lucide-react';
import type { LeaderboardEntry, MediaPlayback, OptionId, QuestionView, ScreenState } from '@bitquiz/shared';
import { CodeBlock, Logo, OptionLetter, TimerBar, TimerNumber, useRemaining } from '@/components/quiz';
import { Button } from '@/components/ui/button';
import { useLive } from '@/lib/live';
import { useLocalMedia, type LocalMediaUrls } from '@/lib/localMedia';
import { MediaView } from '@/components/MediaView';
import { LocalMediaButton } from './LocalMediaButton';
import type { ServerClock } from '@/lib/clock';
import { cn } from '@/lib/utils';

export function ScreenPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { state, status, clock } = useLive<ScreenState>({ role: 'screen', token });
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const localMedia = useLocalMedia();

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (status === 'denied') {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <h1 className="text-5xl font-bold">Projector link is invalid</h1>
            <p className="mt-4 text-2xl text-muted">Copy the current projector link from the Game Master console.</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center text-3xl text-muted">Connecting…</div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex items-center justify-between px-[3vw] pt-[2.5vh]">
        <Logo className="text-[2.2vw]" />
        <div className="flex items-center gap-6 text-[1.4vw] text-muted">
          <span className="font-display">{state.competition.title}</span>
          <span className="flex items-center gap-2">
            <Users className="size-[1.4vw]" aria-hidden />
            <span className="tabular">{state.participantCount}</span>
          </span>
          {status !== 'online' && <span className="text-warn">Reconnecting…</span>}
        </div>
      </header>

      <main className="flex flex-1 flex-col px-[3vw] pb-[3vh] pt-[2vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey(state)}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
          >
            <View state={state} clock={clock} localUrls={localMedia.urls} />
          </motion.div>
        </AnimatePresence>
      </main>

      {state.localMediaFiles.length > 0 && <LocalMediaButton required={state.localMediaFiles} media={localMedia} />}

      {!fullscreen && (
        <Button
          variant="secondary"
          size="lg"
          className="fixed bottom-6 right-6 opacity-70 hover:opacity-100"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
        >
          <Maximize className="size-5" aria-hidden /> Go fullscreen
        </Button>
      )}
    </Shell>
  );
}

function viewKey(state: ScreenState): string {
  const mode = state.competition.status === 'FINISHED' ? 'FINAL' : state.competition.displayMode;
  return mode === 'QUESTION' ? `q-${state.question?.id ?? 'none'}` : mode;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="grid-lines flex h-dvh flex-col overflow-hidden bg-bg text-fg">{children}</div>;
}

function View({ state, clock, localUrls }: { state: ScreenState; clock: ServerClock; localUrls: LocalMediaUrls }) {
  const mode = state.competition.status === 'FINISHED' ? 'FINAL' : state.competition.displayMode;
  switch (mode) {
    case 'LOBBY':
      return <Lobby state={state} />;
    case 'LEADERBOARD':
      return <Leaderboard rows={state.leaderboard} frozen={state.competition.leaderboardFrozen} />;
    case 'HOLD':
      return (
        <div className="grid flex-1 place-items-center text-center">
          <h1 className="max-w-[80vw] text-[5vw] font-bold leading-tight">
            {state.competition.holdMessage || 'Short break'}
          </h1>
        </div>
      );
    case 'FINAL':
      return <Final rows={state.leaderboard} />;
    default:
      return state.question ? (
        <Question
          question={state.question}
          clock={clock}
          answered={state.answeredCount}
          total={state.participantCount}
          playback={state.competition.media}
          localUrls={localUrls}
        />
      ) : (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <p className="text-[2vw] uppercase tracking-[0.3em] text-accent">Get ready</p>
            <h1 className="mt-4 text-[5vw] font-bold">The next question is coming</h1>
          </div>
        </div>
      );
  }
}

function Lobby({ state }: { state: ScreenState }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(state.joinUrl, { margin: 1, width: 800, color: { dark: '#070b16', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [state.joinUrl]);

  return (
    <div className="grid flex-1 grid-cols-[1fr_auto] items-center gap-[5vw]">
      <div>
        <p className="text-[1.6vw] uppercase tracking-[0.3em] text-accent">Join the quiz</p>
        <h1 className="mt-3 text-[4.5vw] font-bold leading-tight">{state.competition.title}</h1>
        <ol className="mt-[4vh] space-y-[2vh] text-[2vw] text-muted">
          <li>
            <span className="text-fg">1.</span> Scan the QR code, or open{' '}
            <span className="font-mono text-fg">
              {state.joinUrl.replace(/^https?:\/\//, '').replace(/\/play\/.*/, '')}
            </span>
          </li>
          <li>
            <span className="text-fg">2.</span> Enter the code{' '}
            <span className="rounded-xl bg-surface-3 px-[1vw] py-[0.3vh] font-mono font-bold tracking-[0.2em] text-accent">
              {state.competition.joinCode}
            </span>
          </li>
          <li>
            <span className="text-fg">3.</span> Type your name and roll
          </li>
        </ol>
        <p className="mt-[5vh] flex items-center gap-3 text-[2.4vw]">
          <Users className="size-[2.4vw] text-accent" aria-hidden />
          <motion.span
            key={state.participantCount}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className="tabular font-display font-bold"
          >
            {state.participantCount}
          </motion.span>
          <span className="text-muted">joined</span>
        </p>
      </div>
      <div className="rounded-[2vw] bg-white p-[1.2vw] shadow-[0_0_80px_-10px_rgb(34_211_238/0.5)]">
        {qr ? (
          <img src={qr} alt={`QR code for ${state.joinUrl}`} className="size-[30vw] max-h-[60vh] max-w-[60vh]" />
        ) : (
          <div className="size-[30vw]" />
        )}
      </div>
    </div>
  );
}

function Question({
  question,
  clock,
  answered,
  total,
  playback,
  localUrls,
}: {
  question: QuestionView;
  clock: ServerClock;
  answered: number;
  total: number;
  playback: MediaPlayback;
  localUrls: LocalMediaUrls;
}) {
  const remaining = useRemaining(question, clock);
  const revealed = question.status === 'REVEALED';
  const counts = question.distribution ?? {};
  const totalAnswers = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const many = question.options.length > 4;
  // Media or code takes the left column; options then stack on the right.
  const side = Boolean(question.code || question.media);
  // Media stage: only the image or video, large. The same MediaView stays mounted when the question
  // and options appear, so a playing video is never reloaded.
  const staged = question.status === 'MEDIA';

  return (
    <div className="flex flex-1 flex-col gap-[2.5vh]">
      <div className="flex items-center justify-between">
        <p className="text-[1.5vw] font-semibold uppercase tracking-[0.2em] text-muted">
          {question.roundTitle} · Question {question.number} of {question.total}
        </p>
        <div className="flex items-center gap-[2vw]">
          {(question.status === 'OPEN' || question.status === 'CLOSED') && (
            <span className="tabular text-[1.5vw] text-muted">
              {answered}/{total} answered
            </span>
          )}
          {question.status === 'OPEN' && remaining !== null && (
            <span className="grid size-[7vw] place-items-center rounded-full border-4 border-line-strong bg-surface">
              <TimerNumber remainingMs={remaining} className="text-[3.6vw]" />
            </span>
          )}
          {question.status === 'CLOSED' && <span className="text-[2vw] font-bold text-warn">Time&apos;s up</span>}
        </div>
      </div>
      {question.status === 'OPEN' && remaining !== null && (
        <TimerBar remainingMs={remaining} totalMs={question.timeLimitSec * 1000} className="h-[1vh]" />
      )}

      {!staged && (
        <h1 className={cn('font-semibold leading-tight', side ? 'text-[2.6vw]' : 'text-[3.4vw]')}>{question.prompt}</h1>
      )}

      <div className={cn('grid min-h-0 flex-1 gap-[2vw]', side && !staged ? 'grid-cols-[1.25fr_1fr]' : 'grid-cols-1')}>
        {side && (
          <div className={cn('flex min-h-0 flex-col gap-[2vh]', staged && 'items-center justify-center')}>
            {question.media && (
              <MediaView
                key={question.id}
                media={question.media}
                playback={playback}
                localUrls={localUrls}
                className={cn(
                  'aspect-video rounded-[1.2vw] border border-line',
                  staged ? 'h-[66vh] max-w-full' : 'max-h-[58vh] w-full',
                )}
              />
            )}
            {question.code && (
              <CodeBlock code={question.code} language={question.codeLanguage} className="self-start text-[1.8vw]" />
            )}
          </div>
        )}
        <div className={cn('grid content-start gap-[1.6vh]', !side && 'grid-cols-2', staged && 'hidden')}>
          {question.options.map((option) => {
            const isCorrect = revealed && option.id === question.correctOptionId;
            const count = counts[option.id as OptionId] ?? 0;
            const pct = totalAnswers ? Math.round((count / totalAnswers) * 100) : 0;
            return (
              <div
                key={option.id}
                className={cn(
                  'relative flex items-center gap-[1.2vw] overflow-hidden rounded-[1.2vw] border-2 px-[1.4vw] py-[1.6vh] transition-all duration-500',
                  revealed
                    ? isCorrect
                      ? 'border-good bg-good-soft shadow-[0_0_40px_-8px_rgb(34_197_94/0.6)]'
                      : 'border-line bg-surface opacity-50'
                    : 'border-line-strong bg-surface-2',
                )}
              >
                {revealed && (
                  <motion.div
                    className={cn('absolute inset-y-0 left-0', isCorrect ? 'bg-good/20' : 'bg-surface-3/70')}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                )}
                <OptionLetter id={option.id} className="relative size-[3.6vw] text-[1.8vw]" />
                <span className={cn('relative flex-1 font-medium', many || side ? 'text-[1.9vw]' : 'text-[2.3vw]')}>
                  {option.text}
                </span>
                {revealed && (
                  <span className="relative tabular text-[1.7vw] font-semibold">
                    {isCorrect && <Check className="mr-2 inline size-[1.8vw] text-good" aria-hidden />}
                    {pct}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {staged && <p className="text-center text-[1.6vw] text-muted">Watch carefully. The question comes next.</p>}

      {revealed && question.explanation && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="rounded-[1vw] border border-line bg-surface/80 px-[1.4vw] py-[1.2vh] text-[1.6vw] text-muted"
        >
          {question.explanation}
        </motion.p>
      )}
    </div>
  );
}

function Leaderboard({ rows, frozen }: { rows: LeaderboardEntry[]; frozen: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-[75vw] flex-1 flex-col">
      <div className="mb-[3vh] flex items-end justify-between">
        <h1 className="text-[3.6vw] font-bold">Leaderboard</h1>
        {frozen && (
          <span className="flex items-center gap-2 text-[1.5vw] text-accent">
            <Snowflake className="size-[1.6vw]" aria-hidden /> Frozen
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-[2vw] text-muted">No scores yet.</p>
      ) : (
        <LayoutGroup>
          <ol className="space-y-[1.2vh]">
            {rows.map((row) => (
              <motion.li
                layout
                key={row.participantId}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                className={cn(
                  'flex items-center gap-[1.6vw] rounded-[1vw] border px-[1.6vw] py-[1.1vh]',
                  row.rank === 1 ? 'border-warn/60 bg-warn/10' : 'border-line bg-surface/90',
                )}
              >
                <span className="tabular w-[3vw] font-display text-[2.2vw] font-bold text-muted">{row.rank}</span>
                <span className="flex-1 truncate text-[2.1vw] font-semibold">{row.name}</span>
                <span className="font-mono text-[1.5vw] text-faint">{row.roll}</span>
                <span className="tabular w-[9vw] text-right font-display text-[2.4vw] font-bold text-accent">
                  {row.points}
                </span>
              </motion.li>
            ))}
          </ol>
        </LayoutGroup>
      )}
    </div>
  );
}

function Final({ rows }: { rows: LeaderboardEntry[] }) {
  const podium = [rows[1], rows[0], rows[2]];
  const heights = ['h-[22vh]', 'h-[30vh]', 'h-[16vh]'];
  const rest = rows.slice(3, 10);
  return (
    <div className="flex flex-1 flex-col items-center">
      <p className="text-[1.6vw] uppercase tracking-[0.3em] text-accent">Final results</p>
      <div className="mt-[4vh] flex items-end gap-[2vw]">
        {podium.map((row, i) =>
          row ? (
            <motion.div
              key={row.participantId}
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: [0.6, 1.2, 0.2][i], duration: 0.6 }}
              className="flex w-[18vw] flex-col items-center"
            >
              {row.rank === 1 && <Crown className="mb-2 size-[3vw] text-warn" aria-hidden />}
              <p className="w-full truncate text-center text-[2vw] font-bold">{row.name}</p>
              <p className="font-mono text-[1.2vw] text-faint">{row.roll}</p>
              <p className="tabular mt-1 font-display text-[2.2vw] font-bold text-accent">{row.points}</p>
              <div
                className={cn(
                  'mt-[1vh] grid w-full place-items-center rounded-t-[1vw] border border-b-0 font-display text-[4vw] font-bold',
                  heights[i],
                  row.rank === 1 ? 'border-warn/60 bg-warn/15 text-warn' : 'border-line-strong bg-surface-2 text-muted',
                )}
              >
                {row.rank}
              </div>
            </motion.div>
          ) : (
            <div key={i} className="w-[18vw]" />
          ),
        )}
      </div>
      {rest.length > 0 && (
        <ol className="mt-[3vh] grid w-full max-w-[70vw] grid-cols-2 gap-x-[3vw] gap-y-[0.8vh] text-[1.5vw]">
          {rest.map((row) => (
            <li key={row.participantId} className="flex justify-between gap-4 border-b border-line/60 py-[0.6vh]">
              <span className="truncate">
                <span className="tabular mr-3 text-muted">{row.rank}.</span>
                {row.name}
              </span>
              <span className="tabular font-semibold text-accent">{row.points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
