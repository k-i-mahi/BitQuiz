import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { parseQuestionCsv } from '@bitquiz/shared';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api';

interface Props {
  competitionId: string;
  hasQuestions: boolean;
  onImported: () => void;
}

/** Upload a CSV, preview every row with its problems, then import all rows or none. */
export function ImportPanel({ competitionId, hasQuestions, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [importing, setImporting] = useState(false);

  const result = useMemo(() => (csv ? parseQuestionCsv(csv) : null), [csv]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error('The file is larger than 2 MB');
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
  };

  const reset = () => {
    setCsv(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    if (!csv) return;
    setImporting(true);
    try {
      const { imported } = await api<{ imported: number }>(`/competitions/${competitionId}/import`, {
        method: 'POST',
        body: { csv, mode },
      });
      toast.success(`Imported ${imported} question(s)`);
      reset();
      onImported();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Import questions from CSV</CardTitle>
          <p className="text-sm text-muted">
            Prepare questions in Excel or Google Sheets (one row per question) and download as CSV.
          </p>
        </div>
        <a
          href={`/api/competitions/${competitionId}/template.csv`}
          download
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <Download className="size-4" aria-hidden /> Template
        </a>
      </CardHeader>
      <CardBody className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {!csv ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files[0]);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-8 text-muted transition-colors hover:border-accent/60 hover:text-fg"
          >
            <FileUp className="size-6" aria-hidden />
            <span className="text-sm">Click to choose a CSV file, or drop it here</span>
          </button>
        ) : (
          result && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{fileName}</span>
                <Badge tone={result.errors.length ? 'bad' : 'good'}>
                  {result.errors.length ? `${result.errors.length} problem(s)` : `${result.questions.length} question(s) ready`}
                </Badge>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Choose another file
                </Button>
              </div>

              {result.errors.length > 0 ? (
                <ul className="max-h-60 space-y-1 overflow-auto rounded-xl border border-bad/30 bg-bad-soft p-3 text-sm">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono text-bad">Row {e.row}:</span> {e.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                      <tr>
                        <th className="px-3 py-2">Round</th>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Question</th>
                        <th className="px-3 py-2">Options</th>
                        <th className="px-3 py-2">Answer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {result.questions.map((q, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 tabular">{q.round}</td>
                          <td className="px-3 py-2 tabular">{q.order}</td>
                          <td className="max-w-md truncate px-3 py-2">{q.prompt}</td>
                          <td className="px-3 py-2 tabular">{q.options.length}</td>
                          <td className="px-3 py-2 font-mono text-good">{q.correctOptionId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.errors.length === 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={mode === 'append'}
                        onChange={() => setMode('append')}
                        className="accent-[var(--color-accent)]"
                      />
                      Add to existing questions
                    </label>
                    {hasQuestions && (
                      <label className="flex items-center gap-2 text-warn">
                        <input
                          type="radio"
                          checked={mode === 'replace'}
                          onChange={() => setMode('replace')}
                          className="accent-[var(--color-warn)]"
                        />
                        Replace all rounds and questions
                      </label>
                    )}
                  </div>
                  <Button variant="primary" loading={importing} onClick={submit}>
                    <Upload className="size-4" aria-hidden /> Import {result.questions.length} question(s)
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </CardBody>
    </Card>
  );
}
