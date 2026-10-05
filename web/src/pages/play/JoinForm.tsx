import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { nameSchema, rollSchema, type CompetitionStatus } from '@bitquiz/shared';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export interface JoinInfo {
  title: string;
  joinCode: string;
  status: CompetitionStatus;
  joinable: boolean;
  rollMinLength: number;
  rollMaxLength: number;
  rollDigitsOnly: boolean;
}

interface Props {
  joinCode: string;
  info: JoinInfo | null;
  initialError: string | null;
  onJoined: (token: string) => void;
}

export function JoinForm({ joinCode, info, initialError, onJoined }: Props) {
  const [name, setName] = useState('');
  const [roll, setRoll] = useState('');
  const [errors, setErrors] = useState<{ name?: string; roll?: string; form?: string | null }>({ form: initialError });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!info) return;
    const nameResult = nameSchema.safeParse(name);
    const rollResult = rollSchema(info).safeParse(roll);
    if (!nameResult.success || !rollResult.success) {
      setErrors({
        name: nameResult.success ? undefined : nameResult.error.issues[0]?.message,
        roll: rollResult.success ? undefined : rollResult.error.issues[0]?.message,
      });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      const { token } = await api<{ token: string }>('/join', {
        method: 'POST',
        body: { joinCode, name: nameResult.data, roll: rollResult.data },
      });
      onJoined(token);
    } catch (error) {
      setErrors({ form: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const rollHint =
    info &&
    (info.rollMinLength === info.rollMaxLength
      ? `${info.rollMinLength} ${info.rollDigitsOnly ? 'digits' : 'characters'}`
      : `${info.rollMinLength}–${info.rollMaxLength} ${info.rollDigitsOnly ? 'digits' : 'characters'}`);

  return (
    <div className="grid-lines flex min-h-dvh flex-col px-5 pb-8 pt-6">
      <Link to="/" className="self-center">
        <Logo size="sm" />
      </Link>
      <div className="mx-auto mt-10 w-full max-w-sm flex-1">
        {info ? (
          <>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-accent">You're joining</p>
            <h1 className="mt-2 text-center text-3xl font-bold">{info.title}</h1>
            {!info.joinable && (
              <p className="mt-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-center text-sm text-warn">
                {info.status === 'DRAFT'
                  ? "This quiz isn't open yet. Wait for the organizer to open the lobby."
                  : 'Joining is closed. If you already joined, enter the same name and roll.'}
              </p>
            )}
            <form onSubmit={submit} noValidate className="mt-8 space-y-5">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                  autoCapitalize="words"
                  maxLength={40}
                  aria-invalid={Boolean(errors.name)}
                  className="h-13 text-lg"
                />
                <FieldError>{errors.name}</FieldError>
              </div>
              <div>
                <Label htmlFor="roll">
                  Roll <span className="font-normal text-faint">({rollHint})</span>
                </Label>
                <Input
                  id="roll"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value)}
                  placeholder={info.rollDigitsOnly ? '2107001' : 'CSE-2107001'}
                  inputMode={info.rollDigitsOnly ? 'numeric' : 'text'}
                  autoComplete="off"
                  maxLength={info.rollMaxLength}
                  aria-invalid={Boolean(errors.roll)}
                  className="h-13 font-mono text-lg tracking-wider"
                />
                <FieldError>{errors.roll}</FieldError>
              </div>
              <FieldError>{errors.form}</FieldError>
              <Button type="submit" variant="primary" size="xl" className="w-full" loading={submitting}>
                Join <ArrowRight className="size-5" aria-hidden />
              </Button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <h1 className="text-2xl font-bold">Hmm…</h1>
            <p className="mt-2 text-muted">{initialError}</p>
            <Link to="/" className="mt-6 inline-block text-accent hover:underline">
              Enter a different code
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
