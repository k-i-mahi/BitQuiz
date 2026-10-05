import { Highlight, themes } from 'prism-react-renderer';
import { WifiOff } from 'lucide-react';
import type { OptionId, QuestionView } from '@bitquiz/shared';
import type { ServerClock } from '@/lib/clock';
import type { ConnectionStatus } from '@/lib/live';
import { useTicker } from '@/lib/live';
import { cn } from '@/lib/utils';

const PRISM_LANGUAGE: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  go: 'go',
  rust: 'rust',
  kotlin: 'kotlin',
  sql: 'sql',
};

/** Syntax-highlighted code rendered as React elements (never as raw HTML). */
export { Logo } from './Logo';

export function CodeBlock({ code, language, className }: { code: string; language: string | null; className?: string }) {
  return (
    <Highlight code={code.replace(/\s+$/, '')} language={PRISM_LANGUAGE[language ?? ''] ?? 'text'} theme={themes.nightOwl}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre
          className={cn(
            'overflow-x-auto rounded-xl border border-line bg-[#011627] p-4 font-mono leading-relaxed',
            className,
          )}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}

/** Milliseconds left on the server deadline, re-rendering several times a second. */
export function useRemaining(question: QuestionView | null, clock: ServerClock): number | null {
  const running = question?.status === 'OPEN' && question.endsAt !== null;
  useTicker(100, running);
  if (!question?.endsAt) return null;
  if (question.status !== 'OPEN') return question.status === 'SHOWN' ? question.timeLimitSec * 1000 : 0;
  return Math.max(0, new Date(question.endsAt).getTime() - clock.now());
}

export function TimerBar({ remainingMs, totalMs, className }: { remainingMs: number; totalMs: number; className?: string }) {
  const fraction = totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0;
  const urgent = remainingMs <= 5_000;
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)} aria-hidden>
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-100 ease-linear',
          urgent ? 'bg-warn' : 'bg-accent',
        )}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}

export function TimerNumber({ remainingMs, className }: { remainingMs: number; className?: string }) {
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <span
      className={cn('tabular font-display font-bold', remainingMs <= 5_000 && remainingMs > 0 && 'text-warn', className)}
      aria-live="off"
    >
      {seconds}
    </span>
  );
}

export type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dimmed';

const OPTION_TINT: Record<OptionId, string> = {
  A: 'text-cyan-300',
  B: 'text-violet-300',
  C: 'text-amber-300',
  D: 'text-emerald-300',
  E: 'text-pink-300',
  F: 'text-sky-300',
};

export function OptionLetter({ id, className }: { id: OptionId; className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-lg border border-line-strong bg-surface-3 font-display font-bold',
        OPTION_TINT[id],
        className,
      )}
    >
      {id}
    </span>
  );
}

export function optionClasses(state: OptionState): string {
  switch (state) {
    case 'selected':
      return 'border-accent bg-accent-soft ring-2 ring-accent/40';
    case 'correct':
      return 'border-good bg-good-soft ring-2 ring-good/40';
    case 'wrong':
      return 'border-bad bg-bad-soft';
    case 'dimmed':
      return 'border-line bg-surface opacity-45';
    default:
      return 'border-line-strong bg-surface-2';
  }
}

export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status !== 'offline') return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warn px-4 py-1.5 text-sm font-medium text-bg"
    >
      <WifiOff className="size-4" aria-hidden />
      Reconnecting…
    </div>
  );
}
