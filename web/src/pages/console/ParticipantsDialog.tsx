import { useMemo, useState } from 'react';
import { Check, Pencil, Search, Smartphone, UserX, Undo2, X } from 'lucide-react';
import type { GmState, ParticipantSummary } from '@bitquiz/shared';
import type { SendCommand } from './ConsolePage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  state: GmState;
  send: SendCommand;
}

export function ParticipantsDialog({ open, onClose, state, send }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? state.participants.filter((p) => p.name.toLowerCase().includes(q) || p.roll.toLowerCase().includes(q))
      : state.participants;
    return [...list].sort((a, b) => Number(a.kicked) - Number(b.kicked) || a.roll.localeCompare(b.roll));
  }, [query, state.participants]);

  const saveName = async () => {
    if (!editing) return;
    if (await send({ type: 'EDIT_NAME', participantId: editing.id, name: editing.name }, 'Name updated'))
      setEditing(null);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Participants"
      description={`${state.stats.joined} joined · ${state.stats.connected} connected`}
      className="w-[min(48rem,calc(100vw-2rem))]"
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or roll"
          className="pl-9"
        />
      </div>
      <p className="mb-2 text-xs text-muted">
        <strong className="text-fg">Reset device</strong> lets a participant who changed phones join again with the same
        roll and keep their points.
      </p>
      <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {filtered.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">No participants found</li>}
        {filtered.map((p) => (
          <Row
            key={p.id}
            participant={p}
            editing={editing?.id === p.id ? editing.name : null}
            onEditChange={(name) => setEditing({ id: p.id, name })}
            onEditStart={() => setEditing({ id: p.id, name: p.name })}
            onEditCancel={() => setEditing(null)}
            onEditSave={saveName}
            send={send}
          />
        ))}
      </ul>
    </Dialog>
  );
}

function Row({
  participant: p,
  editing,
  onEditChange,
  onEditStart,
  onEditCancel,
  onEditSave,
  send,
}: {
  participant: ParticipantSummary;
  editing: string | null;
  onEditChange: (name: string) => void;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  send: SendCommand;
}) {
  return (
    <li className={cn('flex flex-wrap items-center gap-3 px-3 py-2', p.kicked && 'opacity-50')}>
      <span
        className={cn('size-2 shrink-0 rounded-full', p.connected ? 'bg-good' : 'bg-line-strong')}
        title={p.connected ? 'Connected' : 'Not connected'}
      />
      <div className="min-w-0 flex-1">
        {editing !== null ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              onEditSave();
            }}
          >
            <Input
              value={editing}
              onChange={(e) => onEditChange(e.target.value)}
              className="h-8"
              maxLength={40}
              autoFocus
            />
            <Button type="submit" size="icon" variant="ghost" aria-label="Save name">
              <Check className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Cancel" onClick={onEditCancel}>
              <X className="size-4" />
            </Button>
          </form>
        ) : (
          <p className="truncate text-sm font-medium">{p.name}</p>
        )}
        <p className="font-mono text-xs text-faint">{p.roll}</p>
      </div>
      {p.kicked && <Badge tone="bad">removed</Badge>}
      {!p.kicked && !p.hasDevice && <Badge tone="warn">waiting to rejoin</Badge>}
      <div className="flex gap-1">
        {editing === null && !p.kicked && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Edit name of ${p.roll}`}
            title="Edit name"
            onClick={onEditStart}
          >
            <Pencil className="size-4" />
          </Button>
        )}
        {!p.kicked && p.hasDevice && (
          <Button
            size="sm"
            variant="ghost"
            title="Allow this roll to join from a new phone"
            onClick={() => send({ type: 'RESET_DEVICE', participantId: p.id }, `${p.roll} can rejoin on a new device`)}
          >
            <Smartphone className="size-4" aria-hidden /> Reset device
          </Button>
        )}
        {p.kicked ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => send({ type: 'UNKICK', participantId: p.id }, `${p.roll} restored`)}
          >
            <Undo2 className="size-4" aria-hidden /> Restore
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-bad hover:text-bad"
            onClick={() => send({ type: 'KICK', participantId: p.id }, `${p.roll} removed`)}
          >
            <UserX className="size-4" aria-hidden /> Remove
          </Button>
        )}
      </div>
    </li>
  );
}
