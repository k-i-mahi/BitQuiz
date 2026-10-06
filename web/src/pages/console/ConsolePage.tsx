import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  BarChart3,
  Copy,
  DoorOpen,
  ExternalLink,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Snowflake,
  Square,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { nextStep, type Command, type DisplayMode, type GmState } from '@bitquiz/shared';
import { STATUS_TONE } from '../admin/CompetitionsPage';
import { CurrentQuestionPanel } from './CurrentQuestionPanel';
import { ParticipantsDialog } from './ParticipantsDialog';
import { RunSheet } from './RunSheet';
import { StatsPanel } from './StatsPanel';
import { ConnectionBanner, Logo } from '@/components/quiz';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { JoinQr } from '@/components/JoinQr';
import { Input } from '@/components/ui/input';
import { FullPageSpinner } from '@/components/ui/spinner';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useAdminSession } from '@/lib/auth';
import { useLive } from '@/lib/live';
import { cn } from '@/lib/utils';

type CommandInput = Command extends infer C ? (C extends unknown ? Omit<C, 'revision'> : never) : never;

export type SendCommand = (command: CommandInput, successMessage?: string) => Promise<boolean>;

const DISPLAY_MODES: Array<{ mode: DisplayMode; label: string; key: string }> = [
  { mode: 'LOBBY', label: 'Lobby', key: '' },
  { mode: 'QUESTION', label: 'Question', key: 'Q' },
  { mode: 'LEADERBOARD', label: 'Leaderboard', key: 'L' },
  { mode: 'FINAL', label: 'Final', key: '' },
];

export function ConsolePage() {
  const { id = '' } = useParams<{ id: string }>();
  const admin = useAdminSession();
  const { state, status, clock } = useLive<GmState>(admin ? { role: 'gm', competitionId: id } : null);
  const [busy, setBusy] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [holdMessage, setHoldMessage] = useState('');
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [projectorOpen, setProjectorOpen] = useState(false);
  const busyRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send: SendCommand = useCallback(
    async (command, successMessage) => {
      const current = stateRef.current;
      if (!current || busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        await api(`/competitions/${id}/commands`, {
          method: 'POST',
          body: { ...command, revision: current.revision },
        });
        if (successMessage) toast.success(successMessage);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.code === 'STALE_REVISION') {
          toast.warning('The quiz just changed — check the screen and try again.');
        } else if (error instanceof ApiError && error.code === 'CONTENT_INVALID') {
          const problems = (error.details as { problems?: string[] } | undefined)?.problems ?? [error.message];
          toast.error('Fix these before opening the lobby', { description: problems.slice(0, 4).join('\n') });
        } else {
          toast.error(errorMessage(error));
        }
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [id],
  );

  const step = state?.question
    ? nextStep(state.question.status, state.hasPendingQuestions)
    : nextStep(null, state?.hasPendingQuestions ?? false);

  const runMainStep = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.competition.status !== 'LIVE') return;
    const current = s.question?.status ?? null;
    const action = nextStep(current, s.hasPendingQuestions);
    if (action === 'OPEN') void send({ type: 'OPEN_QUESTION' });
    else if (action === 'CLOSE') void send({ type: 'CLOSE_QUESTION' });
    else if (action === 'REVEAL') void send({ type: 'REVEAL' });
    // DETAILS: the media is on screen; showing again reveals the question text and options.
    else if (action === 'SHOW' || action === 'NEXT' || action === 'DETAILS') void send({ type: 'SHOW_QUESTION' });
    else if (action === 'FINISH') setConfirmFinish(true);
  }, [send]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if (document.querySelector('dialog[open]')) return;
      const s = stateRef.current;
      if (!s) return;
      if (event.code === 'Space' && target.tagName !== 'BUTTON') {
        event.preventDefault();
        runMainStep();
      } else if (event.key.toLowerCase() === 'l') void send({ type: 'SET_DISPLAY', mode: 'LEADERBOARD' });
      else if (event.key.toLowerCase() === 'q') void send({ type: 'SET_DISPLAY', mode: 'QUESTION' });
      else if (event.key.toLowerCase() === 'h') void send({ type: 'SET_DISPLAY', mode: 'HOLD', message: holdMessage });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runMainStep, send, holdMessage]);

  if (!admin || !state) {
    return status === 'denied' ? (
      <div className="grid min-h-dvh place-items-center text-center">
        <div>
          <h1 className="text-2xl font-bold">You can&apos;t open this console</h1>
          <Link to="/admin" className="mt-4 inline-block text-accent hover:underline">
            Back to competitions
          </Link>
        </div>
      </div>
    ) : (
      <FullPageSpinner label="Loading console" />
    );
  }

  const { competition } = state;
  const projectorUrl = `${window.location.origin}/screen/${state.projectorToken}`;
  const live = competition.status === 'LIVE';
  // Projector controls only matter once a projector screen is actually connected.
  const projector = state.projectorConnected > 0;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy failed — select and copy manually');
    }
  };

  const rotateProjector = async () => {
    try {
      await api(`/competitions/${id}/projector-token`, { method: 'POST' });
      toast.success('New projector link created. Reopen it on the projector.');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBanner status={status} />
      <header className="border-b border-line bg-surface/70 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          <Link to="/admin" className="text-muted hover:text-fg" aria-label="Back to competitions">
            <ArrowLeft className="size-5" />
          </Link>
          <Logo size="sm" />
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-lg font-semibold">{competition.title}</h1>
            <Badge tone={STATUS_TONE[competition.status]}>{competition.status}</Badge>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => copy(state.joinUrl, 'Join link')}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 font-mono tracking-widest hover:border-accent/60"
              title="Copy join link"
            >
              {competition.joinCode}
            </button>
            <Button size="sm" onClick={() => setParticipantsOpen(true)}>
              <Users className="size-4" aria-hidden /> Participants
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setProjectorOpen(true)}
              title="Show the quiz on a big screen"
            >
              <Monitor className="size-4" aria-hidden /> Projector
              {projector && <span className="size-2 rounded-full bg-good" aria-label="connected" />}
            </Button>
            <Link
              to={`/admin/competitions/${id}/results`}
              target="_blank"
              className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            >
              <BarChart3 className="size-4" aria-hidden /> Results
            </Link>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        {/* On phones the controls come first; on wide screens the run sheet sits on the left. */}
        <div className="order-3 xl:order-none">
          <RunSheet state={state} send={send} busy={busy} />
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-4 xl:order-none">
          {competition.status === 'DRAFT' && (
            <PhaseCard
              title="Ready to open the lobby?"
              text="People can join once the lobby is open. Questions are checked first and locked while the lobby is open."
            >
              <Button
                variant="primary"
                size="xl"
                loading={busy}
                onClick={() => send({ type: 'OPEN_LOBBY' }, 'Lobby is open')}
              >
                <DoorOpen className="size-5" aria-hidden /> Open lobby
              </Button>
            </PhaseCard>
          )}

          {competition.status === 'LOBBY' && (
            <PhaseCard
              title={`${state.stats.joined} joined · ${state.stats.connected} connected`}
              text={
                state.localMediaFiles.length > 0
                  ? `Share the QR code or link below. This quiz plays ${state.localMediaFiles.length} file(s) from the projector computer: open the projector screen and load them under “Media files”.`
                  : 'Share the QR code or link below. Start when everyone is in.'
              }
            >
              <div className="flex w-full flex-wrap items-center gap-5 rounded-2xl border border-line bg-surface-2 p-4">
                <JoinQr url={state.joinUrl} className="size-36" />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm text-muted">Join code</p>
                  <p className="font-mono text-3xl font-bold tracking-[0.25em] text-accent">{competition.joinCode}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="min-w-0 truncate rounded-lg bg-surface px-2 py-1 text-xs text-muted">
                      {state.joinUrl}
                    </code>
                    <Button size="sm" variant="ghost" onClick={() => copy(state.joinUrl, 'Join link')}>
                      <Copy className="size-4" aria-hidden /> Copy link
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  size="xl"
                  loading={busy}
                  onClick={() => send({ type: 'START' }, 'Quiz started')}
                >
                  <Rocket className="size-5" aria-hidden /> Start quiz
                </Button>
                <Button size="xl" variant="ghost" disabled={busy} onClick={() => send({ type: 'CLOSE_LOBBY' })}>
                  Close lobby (edit questions)
                </Button>
              </div>
            </PhaseCard>
          )}

          {live && (
            <CurrentQuestionPanel
              state={state}
              clock={clock}
              busy={busy}
              send={send}
              step={step}
              onMainStep={runMainStep}
            />
          )}

          {competition.status === 'FINISHED' && (
            <PhaseCard title="Quiz finished" text="Final results are on every screen. Download them now.">
              <Link
                to={`/admin/competitions/${id}/results`}
                className={buttonVariants({ variant: 'primary', size: 'xl' })}
              >
                <BarChart3 className="size-5" aria-hidden /> Open results
              </Link>
            </PhaseCard>
          )}

          {live && (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Live controls</p>
              <div className="flex flex-wrap items-center gap-3">
                {competition.displayMode === 'HOLD' ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => send({ type: 'SET_DISPLAY', mode: 'QUESTION' })}
                  >
                    <Play className="size-4" aria-hidden /> Back to the quiz
                  </Button>
                ) : (
                  <>
                    <Input
                      value={holdMessage}
                      onChange={(e) => setHoldMessage(e.target.value)}
                      placeholder="Pause message, e.g. Break: back in 10 minutes"
                      maxLength={200}
                      className="h-9 min-w-56 flex-1"
                    />
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => send({ type: 'SET_DISPLAY', mode: 'HOLD', message: holdMessage })}
                    >
                      <Pause className="size-4" aria-hidden /> Pause screens
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant={competition.leaderboardFrozen ? 'primary' : 'secondary'}
                  disabled={busy}
                  onClick={() =>
                    send(
                      { type: competition.leaderboardFrozen ? 'UNFREEZE_LEADERBOARD' : 'FREEZE_LEADERBOARD' },
                      competition.leaderboardFrozen ? 'Leaderboard unfrozen' : 'Leaderboard frozen',
                    )
                  }
                  title="Hide rank changes from participants, e.g. during the final round"
                >
                  <Snowflake className="size-4" aria-hidden />
                  {competition.leaderboardFrozen ? 'Unfreeze ranks' : 'Freeze ranks'}
                </Button>
                {!state.question && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmFinish(true)}>
                    <Square className="size-4" aria-hidden /> Finish quiz
                  </Button>
                )}
              </div>
            </Card>
          )}

          {projector && competition.status !== 'DRAFT' && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Monitor className="size-4 text-accent" aria-hidden /> Projector view
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DISPLAY_MODES.map(({ mode, label, key }) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={competition.displayMode === mode ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => send({ type: 'SET_DISPLAY', mode })}
                  >
                    {label}
                    {key && <kbd className="ml-1 rounded bg-black/20 px-1 font-mono text-[10px] opacity-70">{key}</kbd>}
                  </Button>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="order-2 xl:order-none">
          <StatsPanel state={state} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-2 text-xs text-faint">
        <span className={status === 'online' ? 'text-good' : 'text-warn'}>
          ● Server {status === 'online' ? 'connected' : status}
        </span>
        <span>Latency {clock.latencyMs} ms</span>
        <span className="ml-auto">
          <kbd className="font-mono">Space</kbd> next step · <kbd className="font-mono">H</kbd> pause
          {projector && (
            <>
              {' '}
              · <kbd className="font-mono">L</kbd> leaderboard · <kbd className="font-mono">Q</kbd> question
            </>
          )}
        </span>
      </footer>

      <ParticipantsDialog
        open={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        state={state}
        send={send}
      />
      <Dialog
        open={projectorOpen}
        onClose={() => setProjectorOpen(false)}
        title="Projector screen"
        description="Optional. Open this link on the computer connected to a projector or TV to show questions, the timer and the leaderboard to the room."
      >
        <div className="space-y-4">
          <p className={cn('text-sm', projector ? 'text-good' : 'text-muted')}>
            ● {projector ? state.projectorConnected + ' screen(s) connected' : 'No screen connected'}
          </p>
          <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{projectorUrl}</code>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => copy(projectorUrl, 'Projector link')}>
              <Copy className="size-4" aria-hidden /> Copy link
            </Button>
            <a href={projectorUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm' })}>
              <ExternalLink className="size-4" aria-hidden /> Open here
            </a>
            <Button size="sm" variant="ghost" onClick={rotateProjector} title="The old link stops working">
              <RefreshCw className="size-4" aria-hidden /> New link
            </Button>
          </div>
          <p className="text-xs text-faint">
            Anyone with this link can watch the screen view but can't control the quiz.
          </p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmFinish}
        title="Finish the quiz?"
        description="Everyone sees the final results. You can still regrade questions afterwards."
        confirmLabel="Finish quiz"
        loading={busy}
        onConfirm={async () => {
          if (await send({ type: 'FINISH' }, 'Quiz finished')) setConfirmFinish(false);
        }}
        onCancel={() => setConfirmFinish(false)}
      />
    </div>
  );
}

function PhaseCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-5 p-8">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-muted">{text}</p>
      </div>
      {children}
    </Card>
  );
}
