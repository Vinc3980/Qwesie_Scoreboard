import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/api.js';
import { Button } from '../components/ui/Button.js';
import { Input, Label, Select } from '../components/ui/Input.js';
import { Modal } from '../components/ui/Modal.js';
import { useNotification } from '../contexts/NotificationContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import { Copy, KeyRound, Pencil, UserX, UserCheck } from 'lucide-react';

type UserRow = { id: string; username: string; displayName: string; email?: string; isActive: boolean; role: 'ADMIN'|'SCORER'|'VIEWER'; mustChangePassword?: boolean };

export const UserManagementPage: React.FC = () => {
  const notify = useNotification();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const usersQ = useQuery({ queryKey: ['auth-users'], queryFn: authApi.listUsers });
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'SCORER' as 'SCORER'|'VIEWER'|'ADMIN' });
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<{ displayName: string; role: 'ADMIN'|'SCORER'|'VIEWER'; active: boolean }>({ displayName: '', role: 'VIEWER', active: true });
  const [confirm, setConfirm] = useState<{ type: 'reset'|'disable'|'enable'|'role'; user: UserRow; nextRole?: 'ADMIN'|'SCORER'|'VIEWER' } | null>(null);
  const [tempResult, setTempResult] = useState<{ username: string; tempPassword: string } | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth-users'] });

  const create = useMutation({
    mutationFn: () => authApi.createUser(form),
    onSuccess: () => { notify.success('User created'); setForm({ username:'', displayName:'', password:'', role:'SCORER' }); invalidate(); },
    onError: (e: any) => notify.error(e.message || 'Failed'),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => authApi.updateUser(id, body),
    onSuccess: () => { notify.success('User updated'); invalidate(); setConfirm(null); setEditUser(null); },
    onError: (e: any) => notify.error(e.message || 'Failed'),
  });

  const resetMut = useMutation({
    mutationFn: (id: string) => authApi.resetUserPassword(id),
    onSuccess: (data: any) => { setConfirm(null); setTempResult({ username: data?.username || '', tempPassword: data?.tempPassword || '' }); invalidate(); },
    onError: (e: any) => { notify.error(e.message || 'Failed'); setConfirm(null); },
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => authApi.deleteUser(id),
    onSuccess: () => { notify.success('User disabled'); setConfirm(null); invalidate(); },
    onError: (e: any) => { notify.error(e.message || 'Failed'); setConfirm(null); },
  });

  const openEdit = (u: UserRow) => { setEditUser(u); setEditForm({ displayName: u.displayName || u.username, role: u.role, active: u.isActive }); };

  const saveEdit = () => {
    if (!editUser) return;
    const body: any = {};
    if (editForm.displayName !== (editUser.displayName || editUser.username)) body.displayName = editForm.displayName;
    if (editForm.role !== editUser.role) body.role = editForm.role;
    if (editForm.active !== editUser.isActive) body.active = editForm.active;
    if (!Object.keys(body).length) { setEditUser(null); return; }
    // confirm sensitive changes
    if (body.role && body.role !== editUser.role) { setConfirm({ type: 'role', user: editUser, nextRole: body.role }); return; }
    if (body.active === false) { setConfirm({ type: 'disable', user: editUser }); return; }
    if (body.active === true) { setConfirm({ type: 'enable', user: editUser }); return; }
    patchMut.mutate({ id: editUser.id, body });
  };

  const confirmAction = () => {
    if (!confirm) return;
    if (confirm.type === 'reset') { resetMut.mutate(confirm.user.id); return; }
    if (confirm.type === 'disable') {
      const id = editUser?.id === confirm.user.id ? editUser.id : confirm.user.id;
      patchMut.mutate({ id, body: { active: false, ...(editUser?.id === confirm.user.id && editForm.displayName ? { displayName: editForm.displayName } : {}) } });
      return;
    }
    if (confirm.type === 'enable') {
      const id = editUser?.id === confirm.user.id ? editUser.id : confirm.user.id;
      patchMut.mutate({ id, body: { active: true, ...(editUser?.id === confirm.user.id && editForm.displayName ? { displayName: editForm.displayName } : {}) } });
      return;
    }
    if (confirm.type === 'role' && confirm.nextRole) {
      const body: any = { role: confirm.nextRole };
      if (editUser?.id === confirm.user.id && editForm.displayName && editForm.displayName !== (editUser.displayName || editUser.username)) body.displayName = editForm.displayName;
      patchMut.mutate({ id: confirm.user.id, body });
      return;
    }
  };

  const isSelf = (id: string) => me?.id === id;
  const activeAdmins = useMemo(() => (usersQ.data || []).filter((u: any) => u.isActive && u.role === 'ADMIN').length, [usersQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-fg">User Management</h1>
        <p className="text-sm text-fg-subtle">Create and manage users, roles, access and password resets.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div className="font-bold">Add user</div>
          <div><Label>Username</Label><Input value={form.username} onChange={e=>setForm(f=>({...f, username:e.target.value}))} /></div>
          <div><Label>Display name</Label><Input value={form.displayName} onChange={e=>setForm(f=>({...f, displayName:e.target.value}))} /></div>
          <div><Label>Password or PIN</Label><Input type="password" value={form.password} onChange={e=>setForm(f=>({...f, password:e.target.value}))} /></div>
          <div className="text-xs text-fg-subtle">Min 8 characters, or a numeric PIN of 6+ digits for Scorer/Viewer (if enabled on server).</div>
          <div><Label>Role</Label><Select value={form.role} onChange={e=>setForm(f=>({...f, role:e.target.value as any}))}><option value="SCORER">Scorer</option><option value="VIEWER">Viewer</option><option value="ADMIN">Admin</option></Select></div>
          <Button variant="primary" onClick={()=>create.mutate()} disabled={!form.username || !form.password || create.isPending} isLoading={create.isPending}>Create user</Button>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="font-bold mb-3">Users</div>
          <div className="space-y-2">
            {(usersQ.data || []).map((u: any) => {
              const self = isSelf(u.id);
              const lastAdmin = u.role === 'ADMIN' && u.isActive && activeAdmins <= 1;
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-fg truncate">{u.displayName || u.username} {self && <span className="text-xs text-fg-subtle">(you)</span>}</div>
                    <div className="text-xs text-fg-subtle truncate">@{u.username} · {u.role}{u.mustChangePassword ? ' · must change password' : ''}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    <span className={`text-xs px-2 py-1 rounded border ${u.isActive ? 'bg-success-subtle text-success border-success/30' : 'bg-surface-sunken text-fg-muted border-border'}`}>{u.isActive ? 'Active' : 'Disabled'}</span>
                    <Button size="sm" variant="outline" onClick={()=>openEdit(u)} title="Edit user"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={()=>setConfirm({ type: 'reset', user: u })} title="Reset password"><KeyRound className="w-3.5 h-3.5" /></Button>
                    {u.isActive ? (
                      <Button size="sm" variant="outline" onClick={()=>setConfirm({ type: 'disable', user: u })} disabled={self || lastAdmin} title={self ? 'Cannot disable yourself' : lastAdmin ? 'Cannot disable last active admin' : 'Disable user'}><UserX className="w-3.5 h-3.5" /></Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={()=>setConfirm({ type: 'enable', user: u })} title="Enable user"><UserCheck className="w-3.5 h-3.5" /></Button>
                    )}
                  </div>
                </div>
              );
            })}
            {usersQ.isLoading && <div className="text-sm text-fg-subtle">Loading…</div>}
            {!usersQ.isLoading && !(usersQ.data||[]).length && <div className="text-sm text-fg-subtle">No users</div>}
          </div>
        </div>
      </div>

      <Modal isOpen={!!editUser} onClose={()=>setEditUser(null)} title="Edit user">
        {editUser && (
          <div className="space-y-3">
            <div className="text-sm text-fg-subtle">@{editUser.username}{isSelf(editUser.id) ? ' (you)' : ''}</div>
            <div><Label>Display name</Label><Input value={editForm.displayName} onChange={e=>setEditForm(f=>({...f, displayName: e.target.value}))} /></div>
            <div><Label>Role</Label>
              <Select value={editForm.role} onChange={e=>setEditForm(f=>({...f, role: e.target.value as any}))} disabled={isSelf(editUser.id)}>
                <option value="SCORER">Scorer</option><option value="VIEWER">Viewer</option><option value="ADMIN">Admin</option>
              </Select>
              {isSelf(editUser.id) && <div className="text-xs text-fg-subtle mt-1">You cannot change your own role.</div>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Active</span>
              <input type="checkbox" checked={editForm.active} onChange={e=>setEditForm(f=>({...f, active: e.target.checked}))} disabled={isSelf(editUser.id) || (editUser.role === 'ADMIN' && editUser.isActive && activeAdmins <= 1)} className="accent-amber-500 w-4 h-4" />
            </div>
            {(isSelf(editUser.id)) && <div className="text-xs text-fg-subtle">You cannot disable your own account.</div>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={()=>setEditUser(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveEdit} isLoading={patchMut.isPending}>Save</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!confirm} onClose={()=>setConfirm(null)} title="Confirm action">
        {confirm && (
          <div className="space-y-3">
            <div className="text-sm text-fg">
              {confirm.type === 'reset' && <>Reset password for <b>{confirm.user.displayName || confirm.user.username}</b>? A one-time temporary password will be generated and all existing sessions will be invalidated. The user must change it on next sign-in.</>}
              {confirm.type === 'disable' && <>Disable <b>{confirm.user.displayName || confirm.user.username}</b>? They will not be able to sign in and active sessions will be invalidated.</>}
              {confirm.type === 'enable' && <>Enable <b>{confirm.user.displayName || confirm.user.username}</b>?</>}
              {confirm.type === 'role' && <>Change role for <b>{confirm.user.displayName || confirm.user.username}</b> to <b>{confirm.nextRole}</b>? Active sessions will be invalidated.</>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setConfirm(null)}>Cancel</Button>
              <Button variant={confirm.type === 'disable' ? 'danger' : 'primary'} onClick={confirmAction} isLoading={resetMut.isPending || patchMut.isPending || disableMut.isPending}>Confirm</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!tempResult} onClose={()=>setTempResult(null)} title="Temporary password (shown once)">
        {tempResult && (
          <div className="space-y-3">
            <div className="text-sm text-fg-muted">Share this temporary password securely with <b>{tempResult.username}</b>. It will not be shown again. The user must change it on next sign-in.</div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-alt border border-border font-mono text-lg font-bold tracking-wider text-fg">
              <span className="flex-1 select-all">{tempResult.tempPassword}</span>
              <button type="button" className="p-2 rounded hover:bg-surface-alt dark:hover:bg-surface-raised" title="Copy" onClick={async()=>{ try{ await navigator.clipboard.writeText(tempResult.tempPassword); notify.success('Copied'); }catch{ notify.error('Copy failed'); } }}><Copy className="w-4 h-4" /></button>
            </div>
            <div className="flex justify-end"><Button variant="primary" onClick={()=>setTempResult(null)}>Done</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserManagementPage;

