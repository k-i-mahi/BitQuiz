import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Ban, LogOut, MailPlus, RotateCw, Send, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminRole, TeamMember, TeamView } from '@bitquiz/shared';
import { useAdmin } from './AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';

const ROLE_HELP: Record<AdminRole, string> = {
  OWNER: 'Everything, including team & access',
  OPERATOR: 'Build competitions and run the console',
};

type Pending =
  | { kind: 'suspend' | 'remove' | 'sign-out'; member: TeamMember }
  | { kind: 'revoke'; id: string; email: string }
  | null;

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function TeamPage() {
  const me = useAdmin();
  const [team, setTeam] = useState<TeamView | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('OPERATOR');
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTeam(await api<TeamView>('/team'));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (me.role === 'OWNER') void load();
  }, [load, me.role]);

  if (me.role !== 'OWNER') return <Navigate to="/admin" replace />;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setPending(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setInviting(true);
    try {
      await api('/team/invitations', { method: 'POST', body: { email, role } });
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      setRole('OPERATOR');
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setInviting(false);
    }
  };

  const updateMember = (member: TeamMember, body: Partial<Pick<TeamMember, 'role' | 'status'>>, success: string) =>
    run(() => api(`/team/members/${member.id}`, { method: 'PATCH', body }), success);

  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === 'revoke') {
      return run(() => api(`/team/invitations/${pending.id}`, { method: 'DELETE' }), 'Invitation revoked');
    }
    const { member } = pending;
    if (pending.kind === 'suspend') return updateMember(member, { status: 'SUSPENDED' }, `${member.email} suspended`);
    if (pending.kind === 'sign-out') {
      return run(() => api(`/team/members/${member.id}/sign-out`, { method: 'POST' }), `${member.email} signed out`);
    }
    return run(() => api(`/team/members/${member.id}`, { method: 'DELETE' }), `${member.email} removed`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team & access</h1>
        <p className="text-sm text-muted">Invite organizers by email and control what each account can do.</p>
      </div>

      {team && !team.emailDelivery && (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          Email sending isn't configured on this server, so invitations are only written to the server log. Set the SMTP
          settings to send real emails.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={invite} className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
                <option value="OPERATOR">Organizer</option>
                <option value="OWNER">Owner</option>
              </Select>
            </div>
            <Button type="submit" variant="primary" loading={inviting} className="h-11">
              <Send className="size-4" aria-hidden /> Send invitation
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted">
            Organizer: {ROLE_HELP.OPERATOR.toLowerCase()}. Owner: {ROLE_HELP.OWNER.toLowerCase()}. The invitation link
            expires in 7 days.
          </p>
        </CardBody>
      </Card>

      {team === null ? (
        <Spinner className="py-10" />
      ) : (
        <>
          {team.invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending invitations</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-line border-t border-line">
                {team.invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <MailPlus className="size-4 text-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{inv.email}</p>
                      <p className="text-xs text-faint">
                        {inv.role === 'OWNER' ? 'Owner' : 'Organizer'} · invited by {inv.invitedBy ?? 'unknown'} ·
                        expires {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => api(`/team/invitations/${inv.id}/resend`, { method: 'POST' }),
                          `Invitation re-sent to ${inv.email}`,
                        )
                      }
                    >
                      <RotateCw className="size-4" aria-hidden /> Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-bad hover:text-bad"
                      onClick={() => setPending({ kind: 'revoke', id: inv.id, email: inv.email })}
                    >
                      <X className="size-4" aria-hidden /> Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-line border-t border-line">
              {team.members.map((m) => {
                const self = m.id === me.id;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {m.name ?? m.email}
                        {self && <Badge tone="accent">you</Badge>}
                        {m.status === 'SUSPENDED' && <Badge tone="bad">suspended</Badge>}
                        {!m.emailVerified && <Badge tone="warn">email not verified</Badge>}
                      </p>
                      <p className="text-xs text-faint">
                        {m.name ? `${m.email} · ` : ''}last login {formatDate(m.lastLoginAt)}
                      </p>
                    </div>
                    <Select
                      aria-label={`Role of ${m.email}`}
                      value={m.role}
                      disabled={self || busy}
                      onChange={(e) =>
                        updateMember(
                          m,
                          { role: e.target.value as AdminRole },
                          `${m.email} is now ${e.target.value === 'OWNER' ? 'an owner' : 'an organizer'}`,
                        )
                      }
                      className="h-9 w-36"
                    >
                      <option value="OPERATOR">Organizer</option>
                      <option value="OWNER">Owner</option>
                    </Select>
                    {!self && (
                      <div className="flex gap-1">
                        {m.status === 'SUSPENDED' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => updateMember(m, { status: 'ACTIVE' }, `${m.email} reactivated`)}
                          >
                            <UserCheck className="size-4" aria-hidden /> Reactivate
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ kind: 'sign-out', member: m })}
                            >
                              <LogOut className="size-4" aria-hidden /> Sign out
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ kind: 'suspend', member: m })}
                            >
                              <Ban className="size-4" aria-hidden /> Suspend
                            </Button>
                          </>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${m.email}`}
                          className="hover:text-bad"
                          onClick={() => setPending({ kind: 'remove', member: m })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <p className="flex items-center gap-2 text-xs text-faint">
            <ShieldCheck className="size-4" aria-hidden /> There is always at least one active owner; you can't change
            your own role or suspend yourself.
          </p>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'revoke'
            ? 'Revoke invitation?'
            : pending?.kind === 'suspend'
              ? 'Suspend account?'
              : pending?.kind === 'sign-out'
                ? 'Sign out everywhere?'
                : 'Remove member?'
        }
        description={
          pending?.kind === 'revoke'
            ? `The link sent to ${pending.email} will stop working.`
            : pending?.kind === 'suspend'
              ? `${pending.member.email} is signed out immediately and can't log in until reactivated.`
              : pending?.kind === 'sign-out'
                ? `${pending.member.email} is signed out on every device but can log in again.`
                : pending
                  ? `${pending.member.email} loses access permanently. Their competitions stay.`
                  : undefined
        }
        confirmLabel={
          pending?.kind === 'revoke'
            ? 'Revoke'
            : pending?.kind === 'suspend'
              ? 'Suspend'
              : pending?.kind === 'sign-out'
                ? 'Sign out'
                : 'Remove'
        }
        loading={busy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
