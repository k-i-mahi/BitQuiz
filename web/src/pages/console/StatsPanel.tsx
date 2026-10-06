import { Snowflake } from 'lucide-react';
import type { GmState } from '@bitquiz/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatsPanel({ state }: { state: GmState }) {
  const { stats } = state;
  // Compare against everyone who joined: a phone may answer and then briefly lose its connection.
  const answeringBase = Math.max(stats.joined, stats.answered, 1);
  const showAnswers = state.question && state.question.status !== 'SHOWN';

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold">Live stats</p>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Joined" value={stats.joined} />
          <Stat label="Connected" value={stats.connected} tone={stats.connected < stats.joined ? 'warn' : undefined} />
          <Stat label="Answered" value={showAnswers ? `${stats.answered}/${stats.joined}` : '—'} />
          <Stat label="Correct" value={showAnswers ? stats.correct : '—'} tone="good" />
        </dl>
        {showAnswers && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.min(100, (stats.answered / answeringBase) * 100)}%` }}
            />
          </div>
        )}
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">Leaderboard (live)</p>
          {state.competition.leaderboardFrozen && (
            <span className="flex items-center gap-1 text-xs text-accent">
              <Snowflake className="size-3.5" aria-hidden /> public view frozen
            </span>
          )}
        </div>
        <ol className="max-h-[28rem] flex-1 divide-y divide-line overflow-y-auto">
          {state.leaderboard.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted">No scores yet</li>
          )}
          {state.leaderboard.slice(0, 50).map((row) => (
            <li key={row.participantId} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="tabular w-6 text-right font-semibold text-muted">{row.rank}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="font-mono text-xs text-faint">{row.roll}</span>
              </span>
              <span className="tabular text-xs text-muted">{row.correct}✓</span>
              <span className="tabular w-12 text-right font-display font-semibold text-accent">{row.points}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-xs text-faint">{label}</dt>
      <dd
        className={cn(
          'tabular font-display text-2xl font-bold',
          tone === 'good' && 'text-good',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
