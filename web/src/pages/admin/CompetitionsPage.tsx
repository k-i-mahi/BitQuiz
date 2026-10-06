import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Archive, BarChart3, Copy, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CompetitionStatus } from '@bitquiz/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { FieldError, Input, Label } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';

interface CompetitionRow {
  id: string;
  title: string;
  joinCode: string;
  status: CompetitionStatus;
  updatedAt: string;
  roundCount: number;
  questionCount: number;
  participantCount: number;
}

export const STATUS_TONE: Record<CompetitionStatus, 'neutral' | 'accent' | 'good' | 'warn'> = {
  DRAFT: 'neutral',
  LOBBY: 'warn',
  LIVE: 'good',
  FINISHED: 'accent',
  ARCHIVED: 'neutral',
};

type PendingAction = { kind: 'delete' | 'archive'; competition: CompetitionRow } | null;

export function CompetitionsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CompetitionRow[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<CompetitionRow[]>(`/competitions${showArchived ? '?archived=1' : ''}`));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const duplicate = async (row: CompetitionRow) => {
    try {
      const { id } = await api<{ id: string }>(`/competitions/${row.id}/duplicate`, { method: 'POST' });
      toast.success('Copied as a new draft');
      navigate(`/admin/competitions/${id}/edit`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'delete') {
        await api(`/competitions/${pending.competition.id}`, { method: 'DELETE' });
        toast.success('Competition deleted');
      } else {
        await api(`/competitions/${pending.competition.id}/archive`, { method: 'POST' });
        toast.success('Competition archived');
      }
      setPending(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Competitions</h1>
          <p className="text-sm text-muted">Build a quiz, open the lobby, and run it live from the console.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Show archived
          </label>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden /> New competition
          </Button>
        </div>
      </div>

      {rows === null ? (
        <Spinner className="py-20" />
      ) : rows.length === 0 ? (
        <Card className="grid place-items-center px-6 py-16 text-center">
          <p className="text-lg font-semibold">No competitions yet</p>
          <p className="mt-1 text-sm text-muted">Create one, then add questions by hand or import a CSV.</p>
          <Button variant="primary" className="mt-6" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden /> New competition
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={row.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/admin/competitions/${row.id}/edit`}
                    className="block truncate text-lg font-semibold hover:text-accent"
                  >
                    {row.title}
                  </Link>
                  <p className="mt-0.5 font-mono text-sm text-faint">Join code {row.joinCode}</p>
                </div>
                <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ['Rounds', row.roundCount],
                  ['Questions', row.questionCount],
                  ['Players', row.participantCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-surface-2 py-2">
                    <dt className="text-xs text-faint">{label}</dt>
                    <dd className="tabular font-display text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {row.status !== 'ARCHIVED' && (
                  <Button size="sm" variant="primary" onClick={() => navigate(`/admin/competitions/${row.id}/console`)}>
                    <Play className="size-3.5" aria-hidden /> Console
                  </Button>
                )}
                <Button size="sm" onClick={() => navigate(`/admin/competitions/${row.id}/edit`)}>
                  <Pencil className="size-3.5" aria-hidden /> {row.status === 'DRAFT' ? 'Edit' : 'View'}
                </Button>
                {(row.status === 'LIVE' || row.status === 'FINISHED' || row.status === 'ARCHIVED') && (
                  <Button size="sm" onClick={() => navigate(`/admin/competitions/${row.id}/results`)}>
                    <BarChart3 className="size-3.5" aria-hidden /> Results
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => duplicate(row)}>
                  <Copy className="size-3.5" aria-hidden /> Duplicate
                </Button>
                {(row.status === 'DRAFT' || row.status === 'FINISHED') && (
                  <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'archive', competition: row })}>
                    <Archive className="size-3.5" aria-hidden /> Archive
                  </Button>
                )}
                {(row.status === 'DRAFT' || row.status === 'ARCHIVED') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-bad hover:text-bad"
                    onClick={() => setPending({ kind: 'delete', competition: row })}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateCompetitionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/admin/competitions/${id}/edit`)}
      />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'delete' ? 'Delete this competition?' : 'Archive this competition?'}
        description={
          pending?.kind === 'delete'
            ? `“${pending.competition.title}” will be permanently deleted with all its questions, participants and answers. This can't be undone.`
            : 'It will be hidden from the list. Results are kept.'
        }
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : 'Archive'}
        loading={busy}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function CreateCompetitionDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>('/competitions', { method: 'POST', body: { title } });
      setTitle('');
      onCreated(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New competition" description="You can change everything later.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Algorithm Rush 2026"
            required
            minLength={3}
            maxLength={120}
            autoFocus
          />
          <FieldError>{error}</FieldError>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
