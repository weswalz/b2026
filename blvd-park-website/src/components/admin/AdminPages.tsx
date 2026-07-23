import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl, type Page, type PageSection } from '../../lib/api';

const ROBOTS_OPTIONS = ['noindex, nofollow', 'noindex, follow', 'index, follow', 'index, nofollow'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface FormState {
  title: string;
  slug: string;
  description: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  og_image: string;
  json_ld: string;
  robots: string;
  status: 'draft' | 'published';
  sections: PageSection[];
}

const emptyForm = (): FormState => ({
  title: '', slug: '', description: '',
  seo_title: '', seo_description: '', seo_keywords: '',
  og_image: '', json_ld: '', robots: 'noindex, nofollow', status: 'draft',
  sections: [],
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export default function AdminPages() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [slugTouched, setSlugTouched] = useState(false);
  const [jsonLdError, setJsonLdError] = useState('');
  const [slugError, setSlugError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const { data: pages = [], isLoading } = useQuery({ queryKey: ['pages'], queryFn: api.getPages });

  const closeForm = () => {
    setShowForm(false); setEditingPage(null); setForm(emptyForm());
    setSlugTouched(false); setJsonLdError(''); setSlugError('');
  };

  const createMutation = useMutation({
    mutationFn: api.createPage,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pages'] }); closeForm(); },
    onSettled: () => { submittingRef.current = false; },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => api.updatePage(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pages'] }); closeForm(); },
    onSettled: () => { submittingRef.current = false; },
  });
  const deleteMutation = useMutation({
    mutationFn: api.deletePage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pages'] }),
  });

  const openEdit = (page: Page) => {
    let sections: PageSection[] = [];
    try { sections = JSON.parse(page.content_sections || '[]'); } catch (_e) {}
    setForm({
      title: page.title, slug: page.slug, description: page.description,
      seo_title: page.seo_title, seo_description: page.seo_description, seo_keywords: page.seo_keywords,
      og_image: page.og_image, json_ld: page.json_ld, robots: page.robots, status: page.status,
      sections,
    });
    setSlugTouched(true);
    setEditingPage(page);
    setShowForm(true);
  };

  const setSection = (i: number, patch: Partial<PageSection>) =>
    setForm((f) => ({ ...f, sections: f.sections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));

  const moveSection = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const next = [...f.sections];
      const j = i + dir;
      if (j < 0 || j >= next.length) return f;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...f, sections: next };
    });

  const validateJsonLd = (value: string) => {
    if (!value.trim()) { setJsonLdError(''); return; }
    try {
      const parsed = JSON.parse(value);
      if (parsed === null || typeof parsed !== 'object') throw new Error();
      setJsonLdError('');
    } catch (_e) { setJsonLdError('Not valid JSON — must be an object or array'); }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (jsonLdError) return;
    if (!SLUG_RE.test(form.slug)) { setSlugError('Slug must be lowercase letters, numbers, and single hyphens'); return; }
    setSlugError('');
    submittingRef.current = true;

    const data = new FormData();
    data.append('title', form.title);
    data.append('slug', form.slug);
    data.append('description', form.description);
    data.append('seo_title', form.seo_title);
    data.append('seo_description', form.seo_description);
    data.append('seo_keywords', form.seo_keywords);
    data.append('og_image', form.og_image);
    data.append('json_ld', form.json_ld);
    data.append('robots', form.robots);
    data.append('status', form.status);
    data.append('content_sections', JSON.stringify(form.sections));
    const file = fileRef.current?.files?.[0];
    if (file) data.append('og_image_file', file);

    if (editingPage) updateMutation.mutate({ id: editingPage.id, data });
    else createMutation.mutate(data);
  };

  const submitError = createMutation.error || updateMutation.error;
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
          <h1 className="text-2xl font-semibold text-white">Pages</h1>
          <p className="text-white/50 mt-1">{pages.length} pages — new pages start as noindex drafts</p>
        </div>
        <button
          onClick={() => { createMutation.reset(); updateMutation.reset(); setForm(emptyForm()); setEditingPage(null); setSlugTouched(false); setShowForm(true); }}
          className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          New Page
        </button>
      </div>

      {(showForm || editingPage) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">{editingPage ? 'Edit Page' : 'New Page'}</h2>
              <button onClick={closeForm} className="text-white/50 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {submitError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {submitError.message}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Title</label>
                  <input
                    required
                    value={form.title}
                    className={inputCls}
                    placeholder="Page title"
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Slug (URL: /slug)</label>
                  <input
                    required
                    value={form.slug}
                    className={inputCls}
                    placeholder="my-page"
                    onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
                  />
                  {slugError && <p className="text-red-400 text-xs mt-1">{slugError}</p>}
                </div>
              </div>

              <div>
                <label className="block text-white/70 text-sm mb-2">Internal description</label>
                <input
                  value={form.description}
                  className={inputCls}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Status</label>
                  <select
                    value={form.status}
                    className={inputCls}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as 'draft' | 'published' }))}
                  >
                    <option value="draft" className="bg-[#1C1C1C]">Draft (hidden)</option>
                    <option value="published" className="bg-[#1C1C1C]">Published</option>
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Robots</label>
                  <select
                    value={form.robots}
                    className={inputCls}
                    onChange={(e) => setForm((f) => ({ ...f, robots: e.target.value }))}
                  >
                    {ROBOTS_OPTIONS.map((r) => (
                      <option key={r} value={r} className="bg-[#1C1C1C]">{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border border-white/10 rounded-lg p-4 space-y-4">
                <p className="text-white/70 text-sm font-medium">SEO</p>
                <input
                  value={form.seo_title}
                  className={inputCls}
                  placeholder="SEO title (falls back to page title)"
                  onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                />
                <textarea
                  value={form.seo_description}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  placeholder="Meta description"
                  onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                />
                <input
                  value={form.seo_keywords}
                  className={inputCls}
                  placeholder="Keywords, comma, separated"
                  onChange={(e) => setForm((f) => ({ ...f, seo_keywords: e.target.value }))}
                />
                <div>
                  <label className="block text-white/70 text-sm mb-2">OG image</label>
                  {form.og_image && (
                    <img src={getImageUrl(form.og_image)} alt="OG preview" className="w-24 h-24 object-cover rounded-lg mb-2" />
                  )}
                  <input
                    ref={fileRef}
                    name="og_image_file"
                    type="file"
                    accept="image/*"
                    className={inputCls + ' file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#1A5F36] file:text-white file:cursor-pointer'}
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">JSON-LD (structured data)</label>
                  <textarea
                    value={form.json_ld}
                    rows={4}
                    className={inputCls + ' font-mono text-xs resize-none'}
                    placeholder='{"@context":"https://schema.org","@type":"WebPage","name":"..."}'
                    onChange={(e) => { setForm((f) => ({ ...f, json_ld: e.target.value })); validateJsonLd(e.target.value); }}
                  />
                  {jsonLdError && <p className="text-red-400 text-xs mt-1">{jsonLdError}</p>}
                </div>
              </div>

              <div className="border border-white/10 rounded-lg p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-white/70 text-sm font-medium">Content sections</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, sections: [...f.sections, { type: 'text', body: '' }] }))}
                      className="px-3 py-1.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20"
                    >
                      + Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, sections: [...f.sections, { type: 'html', body: '' }] }))}
                      className="px-3 py-1.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20"
                    >
                      + HTML
                    </button>
                  </div>
                </div>
                {form.sections.map((s, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <span className="uppercase tracking-wider">{s.type}</span>
                      <span className="flex-1" />
                      <button type="button" onClick={() => moveSection(i, -1)} className="px-2 py-1 hover:text-white">↑</button>
                      <button type="button" onClick={() => moveSection(i, 1)} className="px-2 py-1 hover:text-white">↓</button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, sections: f.sections.filter((_, idx) => idx !== i) }))}
                        className="px-2 py-1 text-red-400/70 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      value={s.body}
                      rows={s.type === 'html' ? 6 : 3}
                      className={inputCls + (s.type === 'html' ? ' font-mono text-xs' : '')}
                      placeholder={s.type === 'html' ? '<h2>Heading</h2><p>Rich content…</p> (scripts are stripped)' : 'Plain text paragraph'}
                      onChange={(e) => setSection(i, { body: e.target.value })}
                    />
                  </div>
                ))}
                {form.sections.length === 0 && <p className="text-white/30 text-sm">No sections yet.</p>}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving…' : 'Save Page'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {pages.map((page) => (
          <div key={page.id} className="bg-white/5 rounded-xl border border-white/10 p-5 flex items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-white font-medium truncate">{page.title}</h3>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  page.status === 'published' ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-white/10 text-white/50'
                }`}>
                  {page.status}
                </span>
                {page.robots.includes('noindex') && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[#C9A962]/20 text-[#C9A962]">noindex</span>
                )}
              </div>
              <p className="text-white/50 text-sm truncate">
                /{page.slug} — updated {new Date(page.updated_at + 'Z').toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              {page.status === 'published' && (
                <a
                  href={`/${page.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-white/50 hover:text-white text-sm"
                >
                  View
                </a>
              )}
              <button
                onClick={() => { createMutation.reset(); updateMutation.reset(); openEdit(page); }}
                className="p-2 text-white/50 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button
                onClick={() => { if (confirm('Delete this page?')) deleteMutation.mutate(page.id); }}
                className="p-2 text-red-400/70 hover:text-red-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {pages.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/40">No pages yet</p>
          <button onClick={() => setShowForm(true)} className="mt-4 text-[#C9A962] hover:underline">
            Create your first page
          </button>
        </div>
      )}
    </div>
  );
}
