import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

const TERM_TYPES = ['category', 'tag', 'collection', 'topic'];
const ENTITY_TYPES = ['NightClub', 'EventVenue', 'LocalBusiness', 'Organization', 'Person', 'Service'];
const CONTENT_ENTITY_TYPES = ['Person', 'Organization', 'Place', 'Service'];

export default function AdminSeoTaxonomy() {
  const queryClient = useQueryClient();
  const [termForm, setTermForm] = useState({ name: '', termType: 'category' });
  const [entityForm, setEntityForm] = useState({ name: '', entityTypes: 'NightClub', idSlug: '' });
  const [contentEntityForm, setContentEntityForm] = useState({ name: '', entityType: 'Person' });
  const [termError, setTermError] = useState<string | null>(null);
  const [entityError, setEntityError] = useState<string | null>(null);
  const [contentEntityError, setContentEntityError] = useState<string | null>(null);

  const { data: terms = [] } = useQuery({ queryKey: ['taxonomy-terms'], queryFn: api.getTaxonomyTerms });
  const { data: duplicates = [] } = useQuery({ queryKey: ['taxonomy-duplicates'], queryFn: api.getTaxonomyDuplicates });
  const { data: masterEntities = [] } = useQuery({ queryKey: ['master-entities'], queryFn: api.getMasterEntities });
  const { data: contentEntities = [] } = useQuery({ queryKey: ['seo-entities'], queryFn: api.getSeoEntities });

  const createTermMutation = useMutation({
    mutationFn: () => api.createTaxonomyTerm(termForm),
    onSuccess: () => {
      setTermError(null);
      setTermForm({ name: '', termType: 'category' });
      queryClient.invalidateQueries({ queryKey: ['taxonomy-terms'] });
      queryClient.invalidateQueries({ queryKey: ['taxonomy-duplicates'] });
    },
    onError: (err: Error) => setTermError(err.message),
  });

  const createEntityMutation = useMutation({
    mutationFn: () => api.createMasterEntity({ ...entityForm, entityTypes: [entityForm.entityTypes] }),
    onSuccess: () => {
      setEntityError(null);
      setEntityForm({ name: '', entityTypes: 'NightClub', idSlug: '' });
      queryClient.invalidateQueries({ queryKey: ['master-entities'] });
    },
    onError: (err: Error) => setEntityError(err.message),
  });

  const createContentEntityMutation = useMutation({
    mutationFn: () => api.createSeoEntity(contentEntityForm),
    onSuccess: () => {
      setContentEntityError(null);
      setContentEntityForm({ name: '', entityType: 'Person' });
      queryClient.invalidateQueries({ queryKey: ['seo-entities'] });
    },
    onError: (err: Error) => setContentEntityError(err.message),
  });

  const inputCls = 'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Entities &amp; Taxonomy</h1>
        <p className="text-white/50 mt-1">Manage categories, tags, and the stable-@id entity database</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Taxonomy terms */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Taxonomy Terms</h2>
            <span className="text-white/50 text-sm">{terms.length} total</span>
          </div>

          {duplicates.length > 0 && (
            <div className="mb-4 rounded-lg border border-[#C9A962]/40 bg-[#C9A962]/10 px-4 py-3">
              <p className="text-xs text-[#C9A962] font-medium">{duplicates.length} possible duplicate term pair(s) detected</p>
              {duplicates.map((pair, i) => (
                <p key={i} className="text-xs text-white/50 mt-1">"{pair.termAName}" ↔ "{pair.termBName}" ({Math.round(pair.similarity * 100)}% similar)</p>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); createTermMutation.mutate(); }}
            className="flex flex-col gap-3 mb-6"
          >
            {termError && <div className="text-sm text-red-400">{termError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Term name"
                value={termForm.name}
                onChange={(e) => setTermForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
              <select
                value={termForm.termType}
                onChange={(e) => setTermForm((f) => ({ ...f, termType: e.target.value }))}
                className={inputCls}
              >
                {TERM_TYPES.map((t) => <option key={t} value={t} className="bg-[#1C1C1C] capitalize">{t}</option>)}
              </select>
            </div>
            <button type="submit" disabled={createTermMutation.isPending} className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50">
              Create Term
            </button>
          </form>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {terms.map((term) => (
              <div key={term.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60 capitalize">{term.termType}</span>
                <span className="flex-1 text-white text-sm">{term.name}</span>
                <span className="text-white/40 text-xs font-mono">{term.slug}</span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${term.indexEligible ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-white/10 text-white/50'}`}>
                  {term.indexEligible ? 'Indexable' : 'Not Indexed'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Master entities */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Master Entities</h2>
            <span className="text-white/50 text-sm">{masterEntities.length} total</span>
          </div>
          <p className="text-white/50 text-xs mb-4">Stable @id records — the venue itself, or a recurring performer/service — that public JSON-LD can reference.</p>

          <form
            onSubmit={(e) => { e.preventDefault(); createEntityMutation.mutate(); }}
            className="flex flex-col gap-3 mb-6"
          >
            {entityError && <div className="text-sm text-red-400">{entityError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Entity name"
                value={entityForm.name}
                onChange={(e) => setEntityForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
              <select
                value={entityForm.entityTypes}
                onChange={(e) => setEntityForm((f) => ({ ...f, entityTypes: e.target.value }))}
                className={inputCls}
              >
                {ENTITY_TYPES.map((t) => <option key={t} value={t} className="bg-[#1C1C1C]">{t}</option>)}
              </select>
            </div>
            <input
              placeholder="@id slug (optional — derived from name)"
              value={entityForm.idSlug}
              onChange={(e) => setEntityForm((f) => ({ ...f, idSlug: e.target.value }))}
              className={inputCls + ' font-mono text-sm'}
            />
            <button type="submit" disabled={createEntityMutation.isPending} className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50">
              Create Master Entity
            </button>
          </form>

          <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
            {masterEntities.map((entity) => (
              <div key={entity.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                <span className="flex-1 text-white text-sm">{entity.name}</span>
                <span className="text-white/40 text-xs">{entity.entityTypes.join(', ')}</span>
                <span className="text-white/40 text-xs font-mono">#{entity.idSlug}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-white">Content Entities</h3>
            <span className="text-white/50 text-sm">{contentEntities.length} total</span>
          </div>
          <p className="text-white/50 text-xs mb-4">Reusable person/place/org/service references a page can attach to its own JSON-LD.</p>

          <form
            onSubmit={(e) => { e.preventDefault(); createContentEntityMutation.mutate(); }}
            className="flex flex-col gap-3 mb-4"
          >
            {contentEntityError && <div className="text-sm text-red-400">{contentEntityError}</div>}
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Entity name"
                value={contentEntityForm.name}
                onChange={(e) => setContentEntityForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
              <select
                value={contentEntityForm.entityType}
                onChange={(e) => setContentEntityForm((f) => ({ ...f, entityType: e.target.value }))}
                className={inputCls}
              >
                {CONTENT_ENTITY_TYPES.map((t) => <option key={t} value={t} className="bg-[#1C1C1C]">{t}</option>)}
              </select>
            </div>
            <button type="submit" disabled={createContentEntityMutation.isPending} className="px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50">
              Create Content Entity
            </button>
          </form>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {contentEntities.map((entity) => (
              <div key={entity.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60">{entity.entityType}</span>
                <span className="flex-1 text-white text-sm">{entity.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
