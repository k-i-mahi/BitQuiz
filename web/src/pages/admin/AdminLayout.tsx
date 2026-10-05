import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router';
import { KeyRound, LogOut, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUserView } from '@bitquiz/shared';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FieldError, Input, Label } from '@/components/ui/input';
import { FullPageSpinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';
import { logout, useAdminSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function useAdmin(): AdminUserView {
  return useOutletContext<AdminUserView>();
}

export function AdminLayout() {
  const admin = useAdminSession();
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!admin) return <FullPageSpinner />;

  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      isActive ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
    );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
          <Logo size="sm" />
          <span className="hidden text-sm text-faint sm:inline">{admin.organizationName}</span>
          <nav className="ml-auto flex items-center gap-1">
            <NavLink to="/admin" end className={link}>
              <Trophy className="size-4" aria-hidden /> Competitions
            </NavLink>
            {admin.role === 'OWNER' && (
              <NavLink to="/admin/admins" className={link}>
                <Users className="size-4" aria-hidden /> Admins
              </NavLink>
            )}
            <Button variant="ghost" size="icon" aria-label="Change password" title="Change password" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Log out"
              title={`Log out ${admin.email}`}
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
      <main className="mx-auto max-w-6xl px-5 py-8">
        <Outlet context={admin} />
      </main>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      toast.success('Password changed. Other sessions were signed out.');
      setCurrent('');
      setNew('');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Change password">
      <form onSubmit={submit} className="space-y-4">
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
          <Label htmlFor="new-password">New password (min 8 characters)</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
          />
          <FieldError>{error}</FieldError>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
