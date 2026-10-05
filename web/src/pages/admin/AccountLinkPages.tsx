import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { passwordSchema, personNameSchema, type InvitationInfo } from '@bitquiz/shared';
import { AuthShell } from './AuthShell';
import { Button, buttonVariants } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';

function useLinkToken(): string {
  const [params] = useSearchParams();
  return params.get('token') ?? '';
}

function BackToLogin() {
  return (
    <Link to="/admin/login" className={buttonVariants({ variant: 'secondary', size: 'lg' }) + ' w-full'}>
      Back to login
    </Link>
  );
}

/** New password + confirmation, validated with the same rules as the server. */
function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  error,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  error?: string | null;
}) {
  return (
    <>
      <div>
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => onPassword(e.target.value)}
        />
        <p className="mt-1 text-xs text-faint">At least 8 characters.</p>
      </div>
      <div>
        <Label htmlFor="confirm-password">Repeat password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          aria-invalid={Boolean(error)}
        />
        <FieldError>{error}</FieldError>
      </div>
    </>
  );
}

function checkPasswords(password: string, confirm: string): string | null {
  const result = passwordSchema.safeParse(password);
  if (!result.success) return result.error.issues[0]?.message ?? 'Invalid password';
  if (password !== confirm) return "The passwords don't match";
  return null;
}

// ---------------------------------------------------------------------------

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your email">
        <div className="flex gap-3 text-sm text-muted">
          <MailCheck className="size-5 shrink-0 text-accent" aria-hidden />
          <p>
            If <span className="text-fg">{email}</span> belongs to an organizer account, we sent a link to choose a new
            password. It expires in 1 hour.
          </p>
        </div>
        <BackToLogin />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError>{error}</FieldError>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Send reset link
        </Button>
        <Link to="/admin/login" className="block text-center text-sm text-muted hover:text-fg">
          Back to login
        </Link>
      </form>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function ResetPasswordPage() {
  const token = useLinkToken();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = checkPasswords(password, confirm);
    if (problem) return setError(problem);
    setLoading(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out on every other device.">
      <form onSubmit={submit} className="space-y-4">
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          error={error}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!token}>
          Save password and log in
        </Button>
        {error && (
          <Link to="/admin/forgot-password" className="block text-center text-sm text-accent hover:underline">
            Request a new link
          </Link>
        )}
      </form>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function AcceptInvitePage() {
  const token = useLinkToken();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ name?: string | null; password?: string | null; form?: string | null }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<InvitationInfo>(`/auth/invitations/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((err) => setLoadError(errorMessage(err)));
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nameResult = personNameSchema.safeParse(name);
    const passwordProblem = checkPasswords(password, confirm);
    if (!nameResult.success || passwordProblem) {
      return setErrors({
        name: nameResult.success ? null : nameResult.error.issues[0]?.message,
        password: passwordProblem,
      });
    }
    setLoading(true);
    setErrors({});
    try {
      await api('/auth/invitations/accept', { method: 'POST', body: { token, name: nameResult.data, password } });
      navigate('/admin', { replace: true });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  if (loadError) {
    return (
      <AuthShell title="Invitation unavailable" subtitle={loadError}>
        <BackToLogin />
      </AuthShell>
    );
  }
  if (!info) return <Spinner className="min-h-dvh" />;

  return (
    <AuthShell
      title={`Join ${info.organizationName}`}
      subtitle={`You're invited as ${info.role === 'OWNER' ? 'an owner' : 'an organizer'}. Set up your account to continue.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" value={info.email} disabled readOnly />
        </div>
        <div>
          <Label htmlFor="invite-name">Your name</Label>
          <Input
            id="invite-name"
            autoComplete="name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError>{errors.name}</FieldError>
        </div>
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          error={errors.password}
        />
        <FieldError>{errors.form}</FieldError>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function VerifyEmailPage() {
  const token = useLinkToken();
  const [state, setState] = useState<'working' | 'done' | string>('working');
  const started = useRef(false);

  useEffect(() => {
    // Links are single-use; guard against React running the effect twice in development.
    if (started.current) return;
    started.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch((err) => setState(errorMessage(err)));
  }, [token]);

  if (state === 'working') return <Spinner className="min-h-dvh" label="Confirming your email" />;
  if (state === 'done') {
    return (
      <AuthShell title="Email confirmed">
        <p className="flex items-center gap-2 text-sm text-good">
          <CheckCircle2 className="size-5" aria-hidden /> Your email address is verified.
        </p>
        <Link to="/admin" className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' w-full'}>
          Go to dashboard
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Couldn't confirm your email" subtitle={state}>
      <p className="text-sm text-muted">Log in and use “Send verification email” to get a new link.</p>
      <BackToLogin />
    </AuthShell>
  );
}
