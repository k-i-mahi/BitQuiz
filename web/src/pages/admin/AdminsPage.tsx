import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminRole } from '@bitquiz/shared';
import { useAdmin } from './AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, errorMessage } from '@/lib/api';

interface AdminRow {
  id: string;
  email: string;
  role: AdminRole;
  createdAt: string;
}

export function AdminsPage() {
  const me = useAdmin();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [form, setForm] = useState({ email: '', password: '', role: 'OPERATOR' as AdminRole });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminRow | null>(null);

  const load = useCallback(async () => {
    try {
      setAdmins(await api<AdminRow[]>('/admins'));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    if (me.role === 'OWNER') void load();
  }, [load, me.role]);

  if (me.role !== 'OWNER') return <Navigate to="/admin" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/admins', { method: 'POST', body: form });
      toast.success(`Added ${form.email}`);
      setForm({ email: '', password: '', role: 'OPERATOR' });
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await api(`/admins/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admins</h1>
        <p className="text-sm text-muted">Owners manage admins. Operators build competitions and run the console.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add an admin</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-[2fr_2fr_1fr_auto] md:items-end">
            <div>
              <Label htmlFor="a-email">Email</Label>
              <Input
                id="a-email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="a-password">Temporary password</Label>
              <Input
                id="a-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="a-role">Role</Label>
              <Select
                id="a-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
              >
                <option value="OPERATOR">Operator</option>
                <option value="OWNER">Owner</option>
              </Select>
            </div>
            <Button type="submit" variant="primary" loading={saving} className="h-11">
              <UserPlus className="size-4" aria-hidden /> Add
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        {admins === null ? (
          <Spinner className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {admins.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="font-medium">{a.email}</p>
                  <p className="text-xs text-faint">Added {new Date(a.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={a.role === 'OWNER' ? 'accent' : 'neutral'}>{a.role}</Badge>
                  {a.id !== me.id && (
                    <Button size="icon" variant="ghost" aria-label={`Remove ${a.email}`} onClick={() => setRemoving(a)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={removing !== null}
        title="Remove admin?"
        description={`${removing?.email ?? ''} will no longer be able to log in.`}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
