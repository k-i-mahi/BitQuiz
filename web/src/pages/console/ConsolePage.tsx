import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ArrowLeft,
  BarChart3,
  Copy,
  DoorOpen,
  ExternalLink,
  Monitor,
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
import { ConfirmDialog } from '@/components/ui/dialog';
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
  { mode: 'HOLD', label: 'Hold', key: 'H' },
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

  const step = state?.question ? nextStep(state.question.status, state.hasPendingQuestions) : nextStep(null, state?.hasPendingQuestions ?? false);

  const runMainStep = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.competition.status !== 'LIVE') return;
    const current = s.question?.status ?? null;
    const action = nextStep(current, s.hasPendingQuestions);
    if (action === 'OPEN') void send({ type: 'OPEN_QUESTION' });
    else if (action === 'CLOSE') void send({ type: 'CLOSE_QUESTION' });
    else if (action === 'REVEAL') void send({ type: 'REVEAL' });
    else if (action === 'SHOW' || action === 'NEXT') void send({ type: 'SHOW_QUESTION' });
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
        <RunSheet state={state} send={send} busy={busy} />

        <div className="flex min-w-0 flex-col gap-4">
          {competition.status === 'DRAFT' && (
            <PhaseCard
              title="Ready to open the lobby?"
              text="People can join once the lobby is open. Questions are checked first and locked while the lobby is open."
            >
              <Button variant="primary" size="xl" loading={busy} onClick={() => send({ type: 'OPEN_LOBBY' }, 'Lobby is open')}>
                <DoorOpen className="size-5" aria-hidden /> Open lobby
              </Button>
            </PhaseCard>
          )}

          {competition.status === 'LOBBY' && (
            <PhaseCard
              title={`${state.stats.joined} joined · ${state.stats.connected} connected`}
              text="The projector shows the QR code and join code. Start when everyone is in."
            >
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="xl" loading={busy} onClick={() => send({ type: 'START' }, 'Quiz started')}>
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
            <PhaseCard title="Quiz finished" text="The projector shows the final podium. Download the results now.">
              <Link to={`/admin/competitions/${id}/results`} className={buttonVariants({ variant: 'primary', size: 'xl' })}>
                <BarChart3 className="size-5" aria-hidden /> Open results
              </Link>
            </PhaseCard>
          )}

          {(competition.status === 'LOBBY' || live || competition.status === 'FINISHED') && (
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Monitor className="size-4 text-accent" aria-hidden /> Projector shows
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DISPLAY_MODES.map(({ mode, label, key }) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={competition.displayMode === mode ? 'primary' : 'secondary'}
                      disabled={busy}
                      onClick={() => send({ type: 'SET_DISPLAY', mode, message: mode === 'HOLD' ? holdMessage : undefined })}
                    >
                      {label}
                      {key && <kbd className="ml-1 rounded bg-black/20 px-1 font-mono text-[10px] opacity-70">{key}</kbd>}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Input
                  value={holdMessage}
                  onChange={(e) => setHoldMessage(e.target.value)}
                  placeholder="Hold message, e.g. Break — back in 10 minutes"
                  maxLength={200}
                  className="h-9 min-w-56 flex-1"
                />
                {live && (
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
                  >
                    <Snowflake className="size-4" aria-hidden />
                    {competition.leaderboardFrozen ? 'Unfreeze leaderboard' : 'Freeze leaderboard'}
                  </Button>
                )}
                {live && !state.question && (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmFinish(true)}>
                    <Square className="size-4" aria-hidden /> Finish quiz
                  </Button>
                )}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-2 font-semibold">
                <Monitor className="size-4 text-accent" aria-hidden /> Projector link
              </span>
              <span className={cn('text-xs', state.projectorConnected ? 'text-good' : 'text-warn')}>
                ● {state.projectorConnected ? `${state.projectorConnected} connected` : 'not connected'}
              </span>
              <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">{projectorUrl}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(projectorUrl, 'Projector link')}>
                <Copy className="size-4" aria-hidden /> Copy
              </Button>
              <a href={projectorUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
                <ExternalLink className="size-4" aria-hidden /> Open
              </a>
              <Button size="sm" variant="ghost" onClick={rotateProjector} title="Create a new link; the old one stops working">
                <RefreshCw className="size-4" aria-hidden /> New link
              </Button>
            </div>
          </Card>
        </div>

        <StatsPanel state={state} />
      </div>

      <footer className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-2 text-xs text-faint">
        <span className={status === 'online' ? 'text-good' : 'text-warn'}>● Server {status === 'online' ? 'connected' : status}</span>
        <span>Latency {clock.latencyMs} ms</span>
        <span className="ml-auto">
          <kbd className="font-mono">Space</kbd> next step · <kbd className="font-mono">L</kbd> leaderboard ·{' '}
          <kbd className="font-mono">Q</kbd> question · <kbd className="font-mono">H</kbd> hold
        </span>
      </footer>

      <ParticipantsDialog open={participantsOpen} onClose={() => setParticipantsOpen(false)} state={state} send={send} />
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

