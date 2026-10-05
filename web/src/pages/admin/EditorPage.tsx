import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Lock, Pencil, Play, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { pointsPreview } from '@bitquiz/shared';
import { STATUS_TONE } from './CompetitionsPage';
import type { CompetitionDetail, QuestionRow, RoundRow } from './editor-types';
import { ImportPanel } from './ImportPanel';
import { QuestionDialog } from './QuestionDialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { OptionLetter } from '@/components/quiz';
import { api, errorMessage } from '@/lib/api';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [competition, setCompetition] = useState<CompetitionDetail | null>(null);
  const [questionDialog, setQuestionDialog] = useState<{ round: RoundRow; question: QuestionRow | null } | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: 'round' | 'question'; id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setCompetition(await api<CompetitionDetail>(`/competitions/${id}`));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!competition) return <Spinner className="py-20" />;
  const editable = competition.status === 'DRAFT';
  const questionCount = competition.rounds.reduce((sum, r) => sum + r.questions.length, 0);

  const addRound = async () => {
    const order = Math.max(0, ...competition.rounds.map((r) => r.order)) + 1;
    try {
      await api(`/competitions/${competition.id}/rounds`, {
        method: 'POST',
        body: {
          title: `Round ${order}`,
          order,
          defaultTimeLimitSec: 20,
          defaultMaxPoints: 100,
          defaultMinPoints: 50,
          wrongPenalty: 0,
        },
      });
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api(toDelete.kind === 'round' ? `/competitions/rounds/${toDelete.id}` : `/competitions/questions/${toDelete.id}`, {
        method: 'DELETE',
      });
      setToDelete(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Competitions
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{competition.title}</h1>
              <Badge tone={STATUS_TONE[competition.status]}>{competition.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              Join code <span className="font-mono text-fg">{competition.joinCode}</span> · {competition.rounds.length}{' '}
              round(s) · {questionCount} question(s)
            </p>
          </div>
          <Link
            to={`/admin/competitions/${competition.id}/console`}
            className={buttonVariants({ variant: 'primary' })}
          >
            <Play className="size-4" aria-hidden /> Open console
          </Link>
        </div>
      </div>

      {!editable && (
        <div className="flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <Lock className="size-4 shrink-0" aria-hidden />
          Questions are locked because the competition is {competition.status.toLowerCase()}.
          {competition.status === 'LOBBY' && ' Close the lobby from the console to edit them.'}
        </div>
      )}

      <SettingsCard competition={competition} onSaved={load} />

      {editable && <ImportPanel competitionId={competition.id} hasQuestions={questionCount > 0} onImported={load} />}

      {competition.rounds.map((round) => (
        <RoundCard
          key={round.id}
          round={round}
          editable={editable}
          onChanged={load}
          onAddQuestion={() => setQuestionDialog({ round, question: null })}
          onEditQuestion={(question) => setQuestionDialog({ round, question })}
          onDeleteRound={() => setToDelete({ kind: 'round', id: round.id, label: round.title })}
          onDeleteQuestion={(q) => setToDelete({ kind: 'question', id: q.id, label: `question ${q.order}` })}
        />
      ))}

      {editable && (
        <Button onClick={addRound} className="w-full border-dashed" size="lg">
          <Plus className="size-4" aria-hidden /> Add round
        </Button>
      )}

      {questionDialog && (
        <QuestionDialog
          round={questionDialog.round}
          question={questionDialog.question}
          readOnly={!editable}
          onClose={() => setQuestionDialog(null)}
          onSaved={async () => {
            setQuestionDialog(null);
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete ${toDelete?.label ?? ''}?`}
        description={toDelete?.kind === 'round' ? 'All questions in this round are deleted too.' : 'This cannot be undone.'}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function SettingsCard({ competition, onSaved }: { competition: CompetitionDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: competition.title,
    rollMinLength: competition.rollMinLength,
    rollMaxLength: competition.rollMaxLength,
    rollDigitsOnly: competition.rollDigitsOnly,
    allowLateJoin: competition.allowLateJoin,
  });
  const [saving, setSaving] = useState(false);
  const locked = competition.status !== 'DRAFT' && competition.status !== 'LOBBY';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/competitions/${competition.id}`, { method: 'PATCH', body: form });
      toast.success('Settings saved');
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Settings</CardTitle>
          <p className="text-sm text-muted">Participants join with their name and roll.</p>
        </div>
      </CardHeader>
      <CardBody>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Label htmlFor="c-title">Title</Label>
            <Input
              id="c-title"
              value={form.title}
              disabled={locked}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              minLength={3}
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="roll-min">Roll min length</Label>
            <Input
              id="roll-min"
              type="number"
              min={1}
              max={20}
              disabled={locked}
              value={form.rollMinLength}
              onChange={(e) => setForm({ ...form, rollMinLength: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="roll-max">Roll max length</Label>
            <Input
              id="roll-max"
              type="number"
              min={1}
              max={20}
              disabled={locked}
              value={form.rollMaxLength}
              onChange={(e) => setForm({ ...form, rollMaxLength: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-6 md:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={form.rollDigitsOnly}
                disabled={locked}
                onChange={(e) => setForm({ ...form, rollDigitsOnly: e.target.checked })}
              />
              Roll contains digits only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={form.allowLateJoin}
                disabled={locked}
                onChange={(e) => setForm({ ...form, allowLateJoin: e.target.checked })}
              />
              Allow joining after the quiz starts
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving} disabled={locked}>
              <Save className="size-4" aria-hidden /> Save settings
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

interface RoundCardProps {
  round: RoundRow;
  editable: boolean;
  onChanged: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (question: QuestionRow) => void;
  onDeleteRound: () => void;
  onDeleteQuestion: (question: QuestionRow) => void;
}

function RoundCard({ round, editable, onChanged, onAddQuestion, onEditQuestion, onDeleteRound, onDeleteQuestion }: RoundCardProps) {
  const [form, setForm] = useState({
    title: round.title,
    order: round.order,
    defaultTimeLimitSec: round.defaultTimeLimitSec,
    defaultMaxPoints: round.defaultMaxPoints,
    defaultMinPoints: round.defaultMinPoints,
    wrongPenalty: round.wrongPenalty,
  });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({
    title: round.title,
    order: round.order,
    defaultTimeLimitSec: round.defaultTimeLimitSec,
    defaultMaxPoints: round.defaultMaxPoints,
    defaultMinPoints: round.defaultMinPoints,
    wrongPenalty: round.wrongPenalty,
  });

  const save = async () => {
    setSaving(true);
    try {
      await api(`/competitions/rounds/${round.id}`, { method: 'PATCH', body: form });
      toast.success(`${form.title} saved`);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const numberField = (key: keyof typeof form, label: string, min: number, max: number) => (
    <div>
      <Label htmlFor={`${round.id}-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`${round.id}-${key}`}
        type="number"
        min={min}
        max={max}
        disabled={!editable}
        value={form[key] as number}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
        className="h-9"
      />
    </div>
  );

  const validRule = form.defaultMinPoints >= 1 && form.defaultMinPoints <= form.defaultMaxPoints;
  const preview = validRule
    ? pointsPreview(
        { maxPoints: form.defaultMaxPoints, minPoints: form.defaultMinPoints, wrongPenalty: form.wrongPenalty },
        form.defaultTimeLimitSec,
      )
    : [];

  return (
    <Card>
      <div className="border-b border-line p-5">
        <div className="grid gap-3 md:grid-cols-[2fr_repeat(5,minmax(0,1fr))]">
          <div>
            <Label htmlFor={`${round.id}-title`} className="text-xs">
              Round title
            </Label>
            <Input
              id={`${round.id}-title`}
              value={form.title}
              disabled={!editable}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-9 font-semibold"
            />
          </div>
          {numberField('order', 'Order', 1, 1000)}
          {numberField('defaultTimeLimitSec', 'Time (s)', 5, 300)}
          {numberField('defaultMaxPoints', 'Max points', 1, 10000)}
          {numberField('defaultMinPoints', 'Min points', 1, 10000)}
          {numberField('wrongPenalty', 'Wrong penalty', 0, 10000)}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {validRule ? (
              <>
                Correct answer at{' '}
                {preview.map((p, i) => (
                  <span key={p.atSec}>
                    {i > 0 && ' · '}
                    <span className="tabular text-fg">{p.atSec}s</span> → {p.points}
                  </span>
                ))}
                {form.wrongPenalty > 0 ? ` · wrong → −${form.wrongPenalty}` : ' · wrong → 0'}
              </>
            ) : (
              <span className="text-bad">Min points must be at least 1 and no more than max points.</span>
            )}
          </p>
          {editable && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="text-bad hover:text-bad" onClick={onDeleteRound}>
                <Trash2 className="size-3.5" aria-hidden /> Delete round
              </Button>
              <Button size="sm" variant="primary" disabled={!dirty || !validRule} loading={saving} onClick={save}>
                <Save className="size-3.5" aria-hidden /> Save round
              </Button>
            </div>
          )}
        </div>
      </div>

      <ol className="divide-y divide-line">
        {round.questions.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-muted">No questions in this round yet.</li>
        )}
        {round.questions.map((q) => (
          <li key={q.id} className="flex items-start gap-4 px-5 py-3.5">
            <span className="tabular mt-0.5 w-6 shrink-0 text-right font-mono text-sm text-faint">{q.order}</span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{q.prompt}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  Answer <OptionLetter id={q.correctOptionId} className="size-5 text-[11px]" />
                </span>
                <span>· {q.options.length} options</span>
                <span>· {q.timeLimitSec ?? round.defaultTimeLimitSec}s</span>
                <span>
                  · {q.maxPoints ?? round.defaultMaxPoints}/{q.minPoints ?? round.defaultMinPoints} pts
                </span>
                {q.code && <Badge tone="accent">code</Badge>}
                {q.status !== 'PENDING' && <Badge>{q.status}</Badge>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" aria-label="Edit question" onClick={() => onEditQuestion(q)}>
                <Pencil className="size-4" />
              </Button>
              {editable && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete question"
                  className="hover:text-bad"
                  onClick={() => onDeleteQuestion(q)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {editable && (
        <div className="border-t border-line p-3">
          <Button variant="ghost" size="sm" onClick={onAddQuestion}>
            <Plus className="size-4" aria-hidden /> Add question
          </Button>
        </div>
      )}
    </Card>
  );
}
