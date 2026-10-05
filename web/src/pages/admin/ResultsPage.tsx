import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Download, Medal } from 'lucide-react';
import { toast } from 'sonner';
import type { CompetitionStatus, RankedRow } from '@bitquiz/shared';
import { STATUS_TONE } from './CompetitionsPage';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';
import { cn, formatSeconds } from '@/lib/utils';

interface LeaderboardResponse {
  competition: { id: string; title: string; status: CompetitionStatus };
  revealed: number;
  rows: RankedRow[];
}

const MEDAL = ['text-amber-300', 'text-slate-300', 'text-orange-400'];

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  useEffect(() => {
    api<LeaderboardResponse>(`/competitions/${id}/leaderboard`)
      .then(setData)
      .catch((error) => toast.error(errorMessage(error)));
  }, [id]);

  if (!data) return <Spinner className="py-20" />;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Competitions
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{data.competition.title}</h1>
              <Badge tone={STATUS_TONE[data.competition.status]}>{data.competition.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {data.rows.length} participant(s) · {data.revealed} revealed question(s)
            </p>
          </div>
          <div className="flex gap-2">
            <a href={`/api/competitions/${id}/results.csv`} download className={buttonVariants({ variant: 'primary' })}>
              <Download className="size-4" aria-hidden /> Results CSV
            </a>
            <a href={`/api/competitions/${id}/answers.csv`} download className={buttonVariants()}>
              <Download className="size-4" aria-hidden /> All answers CSV
            </a>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Roll</th>
                <th className="px-4 py-3 text-right">Points</th>
                <th className="px-4 py-3 text-right">Correct</th>
                <th className="px-4 py-3 text-right">Wrong</th>
                <th className="px-4 py-3 text-right">Correct time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No participants yet.
                  </td>
                </tr>
              )}
              {data.rows.map((row) => (
                <tr key={row.participantId} className="hover:bg-surface-2/60">
                  <td className="px-4 py-3">
                    <span className={cn('tabular inline-flex items-center gap-1.5 font-semibold', MEDAL[row.rank - 1])}>
                      {row.rank <= 3 && <Medal className="size-4" aria-hidden />}
                      {row.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-muted">{row.roll}</td>
                  <td className="tabular px-4 py-3 text-right font-display text-base font-semibold">{row.points}</td>
                  <td className="tabular px-4 py-3 text-right text-good">{row.correct}</td>
                  <td className="tabular px-4 py-3 text-right text-bad">{row.wrong}</td>
                  <td className="tabular px-4 py-3 text-right text-muted">{formatSeconds(row.correctTimeMs)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
