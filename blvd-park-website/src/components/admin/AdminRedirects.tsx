import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type RedirectItem } from '../../lib/api';

const MATCH_TYPES: RedirectItem['matchType'][] = ['exact', 'prefix', 'regex'];
const STATUS_CODES = [301, 302, 307, 308];

const emptyForm = () => ({ fromPath: '', toPath: '', matchType: 'exact' as RedirectItem['matchType'], statusCode: 301, notes: '' });

export default function AdminRedirects() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [csvText, setCsvText] = useState('');
  const [canManageOperations, setCanManageOperations] = useState(false);
  useEffect(() => {
    try {
      const role = JSON.parse(localStorage.getItem('blvd-user') || '{}').role;
      setCanManageOperations(role === 'admin' || role === 'super_admin');
    } catch {
      setCanManageOperations(false);
    }
  }, []);

  const { data: redirects = [], isLoading } = useQuery({ queryKey: ['redirects'], queryFn: api.getRedirects });
  const { data: importJobs = [] } = useQuery({ queryKey: ['redirect-import-jobs'], queryFn: api.getRedirectImportJobs });
  const { data: linkJobs = [] } = useQuery({ queryKey: ['link-migration-jobs'], queryFn: api.getLinkMigrationJobs });

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
  const refreshOperations = () => {
    queryClient.invalidateQueries({ queryKey: ['redirects'] });
    queryClient.invalidateQueries({ queryKey: ['redirect-import-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['link-migration-jobs'] });
  };
  const importPreviewMutation = useMutation({ mutationFn: () => api.previewRedirectCsv(csvText), onSuccess: refreshOperations });
  const importApplyMutation = useMutation({ mutationFn: api.applyRedirectImport, onSuccess: refreshOperations });
  const importRollbackMutation = useMutation({ mutationFn: api.rollbackRedirectImport, onSuccess: refreshOperations });
  const linkPreviewMutation = useMutation({ mutationFn: api.previewLinkMigration, onSuccess: refreshOperations });
  const linkApplyMutation = useMutation({ mutationFn: api.applyLinkMigration, onSuccess: refreshOperations });
  const linkRollbackMutation = useMutation({ mutationFn: api.rollbackLinkMigration, onSuccess: refreshOperations });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const handleExportCsv = async () => {
    const blob = await api.exportRedirectsCsv();
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
    <div className="p-4 sm:p-8">
      <div className="flex flex-col justify-between gap-4 mb-6 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-white">Redirects</h1>
          <p className="text-white/50 mt-1">{redirects.length} redirects</p>
        </div>
        <div className="flex flex-wrap gap-3">
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

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">CSV import &amp; rollback</h2>
          <p className="mb-3 text-sm text-white/50">Paste or load CSV, preview every row through the redirect-loop validator, then apply explicitly.</p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setCsvText(await file.text());
            }}
            className="mb-3 block w-full text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
          />
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={5} className="w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-xs text-white" placeholder={'fromPath,toPath,statusCode,matchType,notes\n/old,/new,301,exact,Migration'} />
          <button disabled={!csvText.trim() || importPreviewMutation.isPending} onClick={() => importPreviewMutation.mutate()} className="mt-3 rounded-lg bg-[#C9A962] px-4 py-2 text-[#1C1C1C] disabled:opacity-40">Preview CSV</button>
          {importPreviewMutation.error && <p className="mt-2 text-sm text-red-300">{importPreviewMutation.error.message}</p>}
          {(importApplyMutation.error || importRollbackMutation.error) && <p className="mt-2 text-sm text-red-300">{(importApplyMutation.error || importRollbackMutation.error)?.message}</p>}
          <div className="mt-4 space-y-2">
            {importJobs.slice(0, 8).map((job) => (
              <div key={job.id} className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 text-xs">
                <span className="text-white">Import #{job.id}</span><span className="text-white/50">{job.status} · {job.preview.length} rows</span>
                <span className="flex-1 text-red-300">{job.preview.filter((row) => !row.valid).length ? `${job.preview.filter((row) => !row.valid).length} invalid` : ''}</span>
                {job.status === 'preview' && canManageOperations && <button disabled={job.preview.some((row) => !row.valid)} onClick={() => importApplyMutation.mutate(job.id)} className="rounded bg-[#1A5F36] px-3 py-1.5 text-white disabled:opacity-40">Apply</button>}
                {job.status === 'applied' && canManageOperations && <button onClick={() => importRollbackMutation.mutate(job.id)} className="rounded bg-white/10 px-3 py-1.5 text-white">Rollback</button>}
                {(job.status === 'preview' || job.status === 'applied') && !canManageOperations && <span className="text-white/40">Admin role required to apply or roll back.</span>}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Stale-link migration</h2>
          <p className="mb-4 text-sm text-white/50">Scan CMS HTML for internal links that still point through active redirects. Preview, apply, and restore exact page snapshots.</p>
          <button disabled={linkPreviewMutation.isPending} onClick={() => linkPreviewMutation.mutate()} className="rounded-lg bg-[#1A5F36] px-4 py-2 text-white">{linkPreviewMutation.isPending ? 'Scanning…' : 'Scan stale internal links'}</button>
          {linkPreviewMutation.error && <p className="mt-2 text-sm text-red-300">{linkPreviewMutation.error.message}</p>}
          {(linkApplyMutation.error || linkRollbackMutation.error) && <p className="mt-2 text-sm text-red-300">{(linkApplyMutation.error || linkRollbackMutation.error)?.message}</p>}
          <div className="mt-4 space-y-2">
            {linkJobs.slice(0, 8).map((job) => (
              <div key={job.id} className="border-t border-white/5 pt-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white">Migration #{job.id}</span>
                  <span className="text-white/50">{job.status} · {job.preview?.findings?.length || 0} links across {job.preview?.pagesScanned || 0} pages</span>
                  <span className="flex-1" />
                  {job.status === 'preview' && canManageOperations && <button disabled={!job.preview?.findings?.length} onClick={() => linkApplyMutation.mutate(job.id)} className="rounded bg-[#1A5F36] px-3 py-1.5 text-white disabled:opacity-40">Apply</button>}
                  {job.status === 'applied' && canManageOperations && <button onClick={() => linkRollbackMutation.mutate(job.id)} className="rounded bg-white/10 px-3 py-1.5 text-white">Rollback</button>}
                  {(job.status === 'preview' || job.status === 'applied') && !canManageOperations && <span className="text-white/40">Admin role required to apply or roll back.</span>}
                </div>
                {job.preview?.findings?.slice(0, 3).map((finding, index) => <p key={index} className="mt-1 truncate font-mono text-white/40">{finding.pageSlug}: {finding.rawHref} → {finding.redirectTarget}</p>)}
              </div>
            ))}
          </div>
        </section>
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
