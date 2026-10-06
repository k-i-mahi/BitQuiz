import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router';
import { LogOut, MailWarning, ShieldCheck, Trophy, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUserView } from '@bitquiz/shared';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FieldError, Input, Label } from '@/components/ui/input';
import { FullPageSpinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';
import { logout, useAdminSessionState } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function useAdmin(): AdminUserView {
  return useOutletContext<AdminUserView>();
}

export function AdminLayout() {
  const [admin, setAdmin] = useAdminSessionState();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);

  if (!admin) return <FullPageSpinner />;

  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
    );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-5">
          <Logo size="sm" />
          <span className="hidden text-sm text-faint md:inline">{admin.organizationName}</span>
          <nav className="ml-auto flex items-center gap-1">
            <NavLink to="/admin" end className={link} aria-label="Competitions">
              <Trophy className="size-4" aria-hidden />
              <span className="hidden sm:inline">Competitions</span>
            </NavLink>
            {admin.role === 'OWNER' && (
              <NavLink to="/admin/team" className={link} aria-label="Team & access">
                <ShieldCheck className="size-4" aria-hidden />
                <span className="hidden sm:inline">Team & access</span>
              </NavLink>
            )}
            <Button variant="ghost" size="sm" onClick={() => setAccountOpen(true)} title={admin.email}>
              <UserRound className="size-4" aria-hidden />
              <span className="hidden max-w-32 truncate md:inline">{admin.name ?? admin.email}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Log out"
              title="Log out"
              onClick={async () => {
                await logout();
                navigate('/admin/login');
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </nav>
        </div>
      </header>
      {/* Verification needs outgoing email; without it the banner could never be resolved. */}
      {admin.emailEnabled && !admin.emailVerified && <VerifyEmailBanner email={admin.email} />}
      <main className="mx-auto max-w-6xl px-5 py-8">
        <Outlet context={admin} />
      </main>
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} admin={admin} onUpdated={setAdmin} />
    </div>
  );
}

function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const send = async () => {
    setState('sending');
    try {
      await api('/auth/verify-email/send', { method: 'POST' });
      setState('sent');
    } catch (error) {
      toast.error(errorMessage(error));
      setState('idle');
    }
  };

  return (
    <div className="border-b border-warn/30 bg-warn/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-5 py-2.5 text-sm text-warn">
        <MailWarning className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          {state === 'sent'
            ? `We sent a confirmation link to ${email}. Open it to verify your address.`
            : `Please verify ${email} so password resets and invitations reach you.`}
        </span>
        {state !== 'sent' && (
          <Button size="sm" variant="warn" loading={state === 'sending'} onClick={send}>
            Send verification email
          </Button>
        )}
      </div>
    </div>
  );
}

function AccountDialog({
  open,
  onClose,
  admin,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  admin: AdminUserView;
  onUpdated: (admin: AdminUserView) => void;
}) {
  const [name, setName] = useState(admin.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    setSavingName(true);
    try {
      onUpdated(await api<AdminUserView>('/auth/me', { method: 'PATCH', body: { name } }));
      toast.success('Name saved');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordError(null);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      toast.success('Password changed. Other sessions were signed out.');
      setCurrent('');
      setNew('');
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your account"
      description={`${admin.email} · ${admin.role === 'OWNER' ? 'Owner' : 'Organizer'}`}
    >
      <div className="space-y-6">
        <form onSubmit={saveName} className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={60}
              required
            />
          </div>
          <Button type="submit" loading={savingName} disabled={name.trim() === (admin.name ?? '')}>
            Save
          </Button>
        </form>

        <form onSubmit={savePassword} className="space-y-4 border-t border-line pt-5">
          <h3 className="text-sm font-semibold">Change password</h3>
          <div>
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="new-password">New password (at least 8 characters)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
              required
            />
            <FieldError>{passwordError}</FieldError>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={savingPassword}>
              Change password
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
