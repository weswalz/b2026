import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type RedirectItem } from '../../lib/api';

const MATCH_TYPES: RedirectItem['matchType'][] = ['exact', 'prefix', 'regex'];
const STATUS_CODES = [301, 302, 307, 308];

const emptyForm = () => ({ fromPath: '', toPath: '', matchType: 'exact' as RedirectItem['matchType'], statusCode: 301, notes: '' });

function toCsv(rows: RedirectItem[]) {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['fromPath', 'toPath', 'matchType', 'statusCode', 'isActive', 'hitCount', 'lastHitAt', 'notes'];
  const lines = rows.map((r) => [r.fromPath, r.toPath, r.matchType, r.statusCode, r.isActive, r.hitCount, r.lastHitAt, r.notes].map(escape).join(','));
  return [header.join(','), ...lines].join('\n');
}

export default function AdminRedirects() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const { data: redirects = [], isLoading } = useQuery({ queryKey: ['redirects'], queryFn: api.getRedirects });

  const createMutation = useMutation({
    mutationFn: api.createRedirect,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['redirects'] }); setShowForm(false); setForm(emptyForm()); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.updateRedirect(id, { isActive: isActive ? 1 : 0 } as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redirects'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRedirect,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['redirects'] }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const handleExportCsv = () => {
    const blob = new Blob([toCsv(redirects)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blvd-redirects-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <h1 className="text-2xl font-semibold text-white">Redirects</h1>
          <p className="text-white/50 mt-1">{redirects.length} redirects</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportCsv}
            disabled={redirects.length === 0}
            className="px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            onClick={() => { createMutation.reset(); setForm(emptyForm()); setShowForm(true); }}
            className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            New Redirect
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">New Redirect</h2>
              <button onClick={() => setShowForm(false)} className="text-white/50 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {createMutation.error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {createMutation.error.message}
                </div>
              )}
              <div>
                <label className="block text-white/70 text-sm mb-2">From path (or regex pattern)</label>
                <input
                  required
                  value={form.fromPath}
                  onChange={(e) => setForm((f) => ({ ...f, fromPath: e.target.value }))}
                  className={inputCls + ' font-mono text-sm'}
                  placeholder="/old-page or ^/old-.*$"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">To path</label>
                <input
                  required
                  value={form.toPath}
                  onChange={(e) => setForm((f) => ({ ...f, toPath: e.target.value }))}
                  className={inputCls}
                  placeholder="/new-page"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Match type</label>
                  <select
                    value={form.matchType}
                    onChange={(e) => setForm((f) => ({ ...f, matchType: e.target.value as RedirectItem['matchType'] }))}
                    className={inputCls}
                  >
                    {MATCH_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-[#1C1C1C] capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Status code</label>
                  <select
                    value={form.statusCode}
                    onChange={(e) => setForm((f) => ({ ...f, statusCode: Number(e.target.value) }))}
                    className={inputCls}
                  >
                    {STATUS_CODES.map((c) => (
                      <option key={c} value={c} className="bg-[#1C1C1C]">{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className={inputCls + ' resize-none'}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving...' : 'Create Redirect'}
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
                <th className="text-left text-white/50 text-sm font-medium p-4">From</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">To</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Type</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Code</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Hits</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Status</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {redirects.map((r) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-4 text-white text-sm font-mono">{r.fromPath}</td>
                  <td className="p-4 text-white/70 text-sm font-mono">{r.toPath}</td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60 capitalize">{r.matchType}</span>
                  </td>
                  <td className="p-4 text-white/60 text-sm">{r.statusCode}</td>
                  <td className="p-4 text-white/60 text-sm">
                    {r.hitCount}
                    {r.lastHitAt && <span className="text-white/30 text-xs block">{new Date(r.lastHitAt + 'Z').toLocaleDateString()}</span>}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => toggleMutation.mutate({ id: r.id, isActive: r.isActive !== 1 })}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        r.isActive === 1 ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-white/10 text-white/50'
                      }`}
                    >
                      {r.isActive === 1 ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => { if (confirm('Delete this redirect?')) deleteMutation.mutate(r.id); }}
                      className="p-2 text-red-400/70 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {redirects.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/40">No redirects yet</p>
        </div>
      )}
    </div>
  );
}
