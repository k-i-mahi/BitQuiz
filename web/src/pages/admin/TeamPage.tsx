import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import {
  Ban,
  CheckCircle2,
  Copy,
  LogOut,
  Mail,
  MailPlus,
  RotateCw,
  Send,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdminRole, InvitationSent, TeamMember, TeamView } from '@bitquiz/shared';
import { useAdmin } from './AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
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
  const [sent, setSent] = useState<(InvitationSent & { email: string }) | null>(null);
  const [testing, setTesting] = useState(false);

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
      const result = await api<InvitationSent>('/team/invitations', { method: 'POST', body: { email, role } });
      setSent({ ...result, email });
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

      {team && (
        <EmailStatus
          team={team}
          testing={testing}
          onTest={async () => {
            setTesting(true);
            try {
              const result = await api<{ sentTo: string }>('/team/test-email', { method: 'POST' });
              toast.success(`Test email sent to ${result.sentTo}. Check the inbox (and spam).`);
            } catch (error) {
              toast.error(errorMessage(error), { duration: 12_000 });
            } finally {
              setTesting(false);
            }
          }}
        />
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
                        run(async () => {
                          const result = await api<InvitationSent>(`/team/invitations/${inv.id}/resend`, {
                            method: 'POST',
                          });
                          setSent({ ...result, email: inv.email });
                        }, 'New invitation link created')
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

      <InvitationResult sent={sent} onClose={() => setSent(null)} />
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

function EmailStatus({ team, testing, onTest }: { team: TeamView; testing: boolean; onTest: () => void }) {
  const { mode, sender } = team.email;
  if (mode === 'log') {
    return (
      <div className="flex gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Email sending isn't set up on this server, so nothing is emailed. Invitations still work: copy the link shown
          after inviting and send it yourself. To send real emails, set BREVO_API_KEY and MAIL_FROM (see the deployment
          guide).
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3 text-sm">
      <Mail className="size-4 text-accent" aria-hidden />
      <span className="flex-1 text-muted">
        Emails are sent from <span className="text-fg">{sender ?? 'the configured sender'}</span> via{' '}
        {mode === 'brevo' ? 'Brevo' : 'SMTP'}.
      </span>
      <Button size="sm" variant="ghost" loading={testing} onClick={onTest}>
        Send test email
      </Button>
    </div>
  );
}

function InvitationResult({
  sent,
  onClose,
}: {
  sent: (InvitationSent & { email: string }) | null;
  onClose: () => void;
}) {
  const copy = async () => {
    if (!sent) return;
    try {
      await navigator.clipboard.writeText(sent.inviteUrl);
      toast.success('Invitation link copied');
    } catch {
      toast.error('Copy failed. Select the link and copy it manually.');
    }
  };

  return (
    <Dialog
      open={sent !== null}
      onClose={onClose}
      title={sent?.emailSent ? 'Invitation sent' : 'Invitation created'}
      description={sent ? `For ${sent.email}` : undefined}
    >
      {sent && (
        <div className="space-y-4">
          {sent.emailSent ? (
            <p className="flex gap-2 text-sm text-good">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              We emailed the invitation. If it doesn't arrive within a few minutes, ask them to check spam, or send them
              the link below.
            </p>
          ) : (
            <p className="flex gap-2 text-sm text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {sent.emailError ?? 'Email is not set up, so nothing was emailed.'} Send them this link (for example on
              WhatsApp or Messenger).
            </p>
          )}
          <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{sent.inviteUrl}</code>
          <p className="text-xs text-faint">
            The link works once, only for {sent.email}, and expires in 7 days. Anyone with the link can create this
            account, so share it only with that person.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button variant="primary" onClick={copy}>
              <Copy className="size-4" aria-hidden /> Copy link
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
