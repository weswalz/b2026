import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type SeoResource } from '../../lib/api';

type EditableResource = Pick<SeoResource,
  'seoTitle' | 'seoDescription' | 'canonicalUrl' | 'indexState' | 'followState' |
  'includeSitemap' | 'ogTitle' | 'ogDescription' | 'ogImage' | 'schemaType'
> & { changeSummary: string };
type ResourceForm = EditableResource & { schemaJsonText: string };

const fromResource = (resource: SeoResource): ResourceForm => ({
  seoTitle: resource.seoTitle || '',
  seoDescription: resource.seoDescription || '',
  canonicalUrl: resource.canonicalUrl || '',
  indexState: resource.indexState,
  followState: resource.followState,
  includeSitemap: resource.includeSitemap,
  ogTitle: resource.ogTitle || '',
  ogDescription: resource.ogDescription || '',
  ogImage: resource.ogImage || '',
  schemaType: resource.schemaType || '',
  schemaJsonText: resource.schemaJson ? JSON.stringify(resource.schemaJson, null, 2) : '',
  changeSummary: '',
});

export default function AdminSeoResources() {
  const queryClient = useQueryClient();
  const { data: resources = [], isLoading } = useQuery({ queryKey: ['seo-resources'], queryFn: api.getSeoResources });
  const { data: jobs = [] } = useQuery({ queryKey: ['seo-bulk-jobs'], queryFn: api.getSeoBulkJobs });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [form, setForm] = useState<ResourceForm | null>(null);
  const [bulkField, setBulkField] = useState<'indexState' | 'followState' | 'includeSitemap'>('indexState');
  const [bulkValue, setBulkValue] = useState('noindex');

  const selected = useMemo(() => resources.find((resource) => resource.id === selectedId) || null, [resources, selectedId]);
  useEffect(() => {
    if (!selectedId && resources[0]) setSelectedId(resources[0].id);
  }, [resources, selectedId]);
  useEffect(() => {
    if (selected) setForm(fromResource(selected));
  }, [selected]);

  const { data: revisions = [] } = useQuery({
    queryKey: ['seo-revisions', selected?.id],
    queryFn: () => api.getSeoRevisions(selected!),
    enabled: !!selected,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['seo-resources'] });
    queryClient.invalidateQueries({ queryKey: ['seo-revisions'] });
    queryClient.invalidateQueries({ queryKey: ['seo-bulk-jobs'] });
  };
  const saveMutation = useMutation({
    mutationFn: () => {
      const { schemaJsonText, ...metadata } = form!;
      let schemaJson = null;
      if (schemaJsonText.trim()) {
        try {
          schemaJson = JSON.parse(schemaJsonText);
        } catch {
          throw new Error('Advanced JSON-LD must be valid JSON.');
        }
      }
      return api.updateSeoResource(selected!, { ...metadata, schemaJson });
    },
    onSuccess: refresh,
  });
  const rollbackRevisionMutation = useMutation({ mutationFn: api.rollbackSeoRevision, onSuccess: refresh });
  const previewBulkMutation = useMutation({
    mutationFn: () => {
      const patchValue = bulkField === 'includeSitemap' ? Number(bulkValue) : bulkValue;
      return api.previewSeoBulk(resources.filter((resource) => checkedIds.includes(resource.id)).map((resource) => ({
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        patch: { [bulkField]: patchValue },
      })));
    },
    onSuccess: refresh,
  });
  const applyBulkMutation = useMutation({ mutationFn: api.applySeoBulk, onSuccess: refresh });
  const rollbackBulkMutation = useMutation({ mutationFn: api.rollbackSeoBulk, onSuccess: refresh });

  const inputClass = 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-white outline-none focus:border-[#C9A962]';
  const error = saveMutation.error || rollbackRevisionMutation.error || previewBulkMutation.error || applyBulkMutation.error || rollbackBulkMutation.error;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">SEO Resources</h1>
        <p className="mt-1 text-white/50">Edit public search metadata with revision history, safe bulk previews, and rollback.</p>
      </div>
      {error && <div className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error.message}</div>}

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 p-4 text-sm text-white/60">{resources.length} tracked resources</div>
          <div className="max-h-[42rem] overflow-y-auto">
            {isLoading ? <p className="p-4 text-white/50">Loading…</p> : resources.map((resource) => (
              <label key={resource.id} className={`flex cursor-pointer gap-3 border-b border-white/5 p-3 ${selectedId === resource.id ? 'bg-[#1A5F36]/30' : 'hover:bg-white/5'}`}>
                <input
                  type="checkbox"
                  checked={checkedIds.includes(resource.id)}
                  onChange={(event) => setCheckedIds((ids) => event.target.checked ? [...ids, resource.id] : ids.filter((id) => id !== resource.id))}
                  aria-label={`Select ${resource.path} for bulk edit`}
                />
                <button type="button" onClick={() => setSelectedId(resource.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm text-white">{resource.path}</span>
                  <span className="text-xs text-white/40">{resource.resourceType} · {resource.indexState}</span>
                </button>
              </label>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          {selected && form && (
            <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-white">{selected.path}</h2><p className="text-xs text-white/40">{selected.resourceType}:{selected.resourceId}</p></div>
                <a href={selected.path} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white">Preview public page</a>
              </div>
              <form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-white/70">SEO title<input value={form.seoTitle || ''} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} className={`${inputClass} mt-1`} /></label>
                  <label className="text-sm text-white/70">Canonical URL<input value={form.canonicalUrl || ''} onChange={(e) => setForm({ ...form, canonicalUrl: e.target.value })} className={`${inputClass} mt-1`} /></label>
                </div>
                <label className="block text-sm text-white/70">SEO description<textarea value={form.seoDescription || ''} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} rows={3} className={`${inputClass} mt-1`} /></label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm text-white/70">Index<select value={form.indexState} onChange={(e) => setForm({ ...form, indexState: e.target.value as EditableResource['indexState'] })} className={`${inputClass} mt-1`}><option className="bg-[#1C1C1C]">index</option><option className="bg-[#1C1C1C]">noindex</option></select></label>
                  <label className="text-sm text-white/70">Links<select value={form.followState} onChange={(e) => setForm({ ...form, followState: e.target.value as EditableResource['followState'] })} className={`${inputClass} mt-1`}><option className="bg-[#1C1C1C]">follow</option><option className="bg-[#1C1C1C]">nofollow</option></select></label>
                  <label className="text-sm text-white/70">Sitemap<select value={form.includeSitemap} onChange={(e) => setForm({ ...form, includeSitemap: Number(e.target.value) })} className={`${inputClass} mt-1`}><option value="1" className="bg-[#1C1C1C]">Included</option><option value="0" className="bg-[#1C1C1C]">Excluded</option></select></label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-white/70">Open Graph title<input value={form.ogTitle || ''} onChange={(e) => setForm({ ...form, ogTitle: e.target.value })} className={`${inputClass} mt-1`} /></label>
                  <label className="text-sm text-white/70">Open Graph image<input value={form.ogImage || ''} onChange={(e) => setForm({ ...form, ogImage: e.target.value })} className={`${inputClass} mt-1`} /></label>
                </div>
                <label className="block text-sm text-white/70">Open Graph description<textarea value={form.ogDescription || ''} onChange={(e) => setForm({ ...form, ogDescription: e.target.value })} rows={2} className={`${inputClass} mt-1`} /></label>
                <label className="block text-sm text-white/70">Advanced JSON-LD<textarea value={form.schemaJsonText} onChange={(e) => setForm({ ...form, schemaJsonText: e.target.value })} rows={8} spellCheck={false} className={`${inputClass} mt-1 font-mono text-xs`} placeholder={'{\n  "@context": "https://schema.org",\n  "@type": "WebPage"\n}'} /></label>
                <label className="block text-sm text-white/70">Change summary<input required value={form.changeSummary} onChange={(e) => setForm({ ...form, changeSummary: e.target.value })} className={`${inputClass} mt-1`} placeholder="Why this metadata changed" /></label>
                <button disabled={saveMutation.isPending} className="rounded-lg bg-[#1A5F36] px-5 py-2.5 text-white disabled:opacity-50">{saveMutation.isPending ? 'Saving…' : 'Save revision'}</button>
              </form>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Revision history</h2>
            <div className="space-y-2">{revisions.length ? revisions.map((revision) => (
              <div key={revision.id} className="flex flex-wrap items-center gap-3 border-b border-white/5 py-2 text-sm">
                <span className="text-white">#{revision.revisionNumber}</span>
                <span className="min-w-0 flex-1 text-white/60">{revision.changeSummary || 'Metadata update'} · {new Date(revision.createdAt).toLocaleString()}</span>
                <button type="button" onClick={() => rollbackRevisionMutation.mutate(revision.id)} className="rounded bg-white/10 px-3 py-1.5 text-white">Rollback</button>
              </div>
            )) : <p className="text-sm text-white/40">No saved revisions for this resource.</p>}</div>
          </section>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Bulk operations</h2>
        <p className="mb-4 text-sm text-white/50">Select resources in the list, preview a change, then explicitly apply it. Applied jobs remain rollbackable.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select value={bulkField} onChange={(e) => { const field = e.target.value as typeof bulkField; setBulkField(field); setBulkValue(field === 'includeSitemap' ? '0' : field === 'followState' ? 'nofollow' : 'noindex'); }} className={inputClass}>
            <option value="indexState" className="bg-[#1C1C1C]">Index state</option><option value="followState" className="bg-[#1C1C1C]">Follow state</option><option value="includeSitemap" className="bg-[#1C1C1C]">Sitemap inclusion</option>
          </select>
          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className={inputClass}>
            {bulkField === 'indexState' && <><option className="bg-[#1C1C1C]">index</option><option className="bg-[#1C1C1C]">noindex</option></>}
            {bulkField === 'followState' && <><option className="bg-[#1C1C1C]">follow</option><option className="bg-[#1C1C1C]">nofollow</option></>}
            {bulkField === 'includeSitemap' && <><option value="1" className="bg-[#1C1C1C]">Included</option><option value="0" className="bg-[#1C1C1C]">Excluded</option></>}
          </select>
          <button disabled={!checkedIds.length || previewBulkMutation.isPending} onClick={() => previewBulkMutation.mutate()} className="rounded-lg bg-[#C9A962] px-5 py-2.5 text-[#1C1C1C] disabled:opacity-40">Preview {checkedIds.length} selected</button>
        </div>
        <div className="mt-5 space-y-2">{jobs.slice(0, 10).map((job) => (
          <div key={job.id} className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-3 text-sm">
            <span className="text-white">Job #{job.id}</span><span className="text-white/50">{job.status} · {job.preview.length} rows</span>
            <span className="flex-1 text-xs text-white/40">{job.preview.some((row) => !row.valid) ? 'Preview contains validation errors' : 'Preview valid'}</span>
            {job.status === 'preview' && <button onClick={() => applyBulkMutation.mutate(job.id)} disabled={job.preview.some((row) => !row.valid)} className="rounded bg-[#1A5F36] px-3 py-1.5 text-white disabled:opacity-40">Apply</button>}
            {job.status === 'applied' && <button onClick={() => rollbackBulkMutation.mutate(job.id)} className="rounded bg-white/10 px-3 py-1.5 text-white">Rollback</button>}
          </div>
        ))}</div>
      </section>
    </div>
  );
}
