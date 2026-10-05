import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { LogIn } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { email, password } });
      const next = params.get('next');
      navigate(next?.startsWith('/admin') ? next : '/admin', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid-lines grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" size="lg" />
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-surface/85 p-7 shadow-2xl backdrop-blur">
          <div>
            <h1 className="text-xl font-bold">Organizer login</h1>
            <p className="text-sm text-muted">Manage competitions and run the live console.</p>
          </div>
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
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(error)}
            />
            <FieldError>{error}</FieldError>
          </div>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            <LogIn className="size-4" aria-hidden /> Log in
          </Button>
        </form>
      </div>
    </div>
  );
}
