import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type User } from '../../lib/api';

const ROLES: User['role'][] = ['editor', 'admin', 'super_admin'];

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ email: '', username: '', role: 'editor' as User['role'] });
  const [resentId, setResentId] = useState<number | null>(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: api.getUsers });

  const createMutation = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setShowForm(false); setForm({ email: '', username: '', role: 'editor' }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User> }) => api.updateUser(id, data as any),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setEditingUser(null); },
  });

  const resendMutation = useMutation({
    mutationFn: api.resendInvite,
    onSuccess: (_data, id) => { setResentId(id); setTimeout(() => setResentId(null), 3000); },
  });

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const inputCls = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#C9A962] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Users</h1>
          <p className="text-white/50 mt-1">{users.length} admin users</p>
        </div>
        <button
          onClick={() => { createMutation.reset(); setForm({ email: '', username: '', role: 'editor' }); setShowForm(true); }}
          className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Invite User
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Invite User</h2>
              <button onClick={() => setShowForm(false)} className="text-white/50 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
              {createMutation.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {createMutation.error.message}
                </div>
              )}
              <div>
                <label className="block text-white/70 text-sm mb-2">Username</label>
                <input
                  required
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as User['role'] }))}
                  className={inputCls}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-[#1C1C1C]">{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <p className="text-white/30 text-xs">
                No password is set here — an invite email with a 72-hour setup link will be sent.
              </p>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Sending Invite...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-white/50 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                updateMutation.mutate({
                  id: editingUser.id,
                  data: { username: String(fd.get('username')), email: String(fd.get('email')), role: fd.get('role') as User['role'] },
                });
              }}
              className="p-6 space-y-5"
            >
              {updateMutation.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {updateMutation.error.message}
                </div>
              )}
              <div>
                <label className="block text-white/70 text-sm mb-2">Username</label>
                <input name="username" required defaultValue={editingUser.username} className={inputCls} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Email</label>
                <input name="email" required type="email" defaultValue={editingUser.email} className={inputCls} />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Role</label>
                <select name="role" defaultValue={editingUser.role} className={inputCls}>
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="bg-[#1C1C1C]">{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-white/70">
                <input
                  type="checkbox"
                  defaultChecked={editingUser.isActive !== 0}
                  onChange={(e) => updateMutation.mutate({ id: editingUser.id, data: { isActive: e.target.checked } })}
                  className="w-4 h-4 rounded bg-white/10 border-white/20 text-[#1A5F36] focus:ring-[#C9A962]"
                />
                Active (deactivating immediately revokes their session)
              </label>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/50 text-sm font-medium p-4">Username</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Email</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Role</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Active</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Last Login</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-4 text-white text-sm">{u.username}</td>
                  <td className="p-4 text-white/70 text-sm">{u.email}</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[#C9A962]/20 text-[#C9A962] capitalize">{u.role.replace('_', ' ')}</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${u.isActive !== 0 ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-red-500/20 text-red-400'}`}>
                      {u.isActive !== 0 ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-white/50 text-sm">
                    {u.last_login ? new Date(u.last_login + 'Z').toLocaleDateString() : 'Never'}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button onClick={() => setEditingUser(u)} className="p-2 text-white/50 hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => resendMutation.mutate(u.id)}
                        disabled={resendMutation.isPending}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50"
                      >
                        {resentId === u.id ? 'Sent!' : 'Resend Invite'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {users.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/40">No users yet</p>
        </div>
      )}
    </div>
  );
}
