import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, emptyPageHero, type BuilderSection, type FaqItem, type PageHero } from '../../../lib/api';
import AdminSidebar from '../AdminSidebar';
import Providers from '../../Providers';
import PageEditorHero from './PageEditorHero';
import PageEditorSections from './PageEditorSections';
import PageEditorSeo from './PageEditorSeo';

interface Props {
  mode: 'new' | 'edit';
  pageId?: number;
  currentPath: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const inputCls = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

interface EditorForm {
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
}

const emptyForm = (): EditorForm => ({
  title: '', slug: '', description: '',
  seo_title: '', seo_description: '', seo_keywords: '',
  og_image: '', json_ld: '', robots: 'noindex, nofollow', status: 'draft',
});

// Outer shell supplies QueryClientProvider (this island is not wrapped at the
// .astro level); inner component holds all state and hooks.
export default function AdminPageEditor(props: Props) {
  return (
    <Providers>
      <AdminPageEditorInner {...props} />
    </Providers>
  );
}

function AdminPageEditorInner({ mode, pageId, currentPath }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditorForm>(emptyForm());
  const [slugTouched, setSlugTouched] = useState(false);
  const [hero, setHero] = useState<PageHero>(emptyPageHero());
  const [sections, setSections] = useState<BuilderSection[]>([]);
  const [faqItems, setFaqItems] = useState<FaqItem[]>([]);
  const [heroVideoFile, setHeroVideoFile] = useState<File | null>(null);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [jsonLdError, setJsonLdError] = useState('');
  const [slugError, setSlugError] = useState('');
  const submittingRef = useRef(false);

  const existing = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => api.getPage(pageId!),
    enabled: mode === 'edit' && !!pageId,
  });

  useEffect(() => {
    if (mode !== 'edit' || !existing.data) return;
    const page = existing.data;
    setForm({
      title: page.title, slug: page.slug, description: page.description,
      seo_title: page.seo_title, seo_description: page.seo_description,
      seo_keywords: page.seo_keywords, og_image: page.og_image,
      json_ld: page.json_ld, robots: page.robots, status: page.status,
    });
    setSlugTouched(true);
    try { setHero({ ...emptyPageHero(), ...JSON.parse(page.hero_json || '{}') }); } catch (_e) {}
    try { setSections(JSON.parse(page.content_sections || '[]')); } catch (_e) {}
    try { setFaqItems(JSON.parse(page.faq_items || '[]')); } catch (_e) {}
  }, [mode, existing.data]);

  const validateJsonLd = (value: string) => {
    if (!value.trim()) { setJsonLdError(''); return; }
    try {
      const parsed = JSON.parse(value);
      if (parsed === null || typeof parsed !== 'object') throw new Error();
      setJsonLdError('');
    } catch (_e) { setJsonLdError('Not valid JSON — must be an object or array'); }
  };

  const patchForm = (patch: Record<string, string>) => {
    const { status, ...rest } = patch;
    setForm((f) => ({ ...f, ...rest, ...(status ? { status: status as EditorForm['status'] } : {}) }));
    if (patch.json_ld !== undefined) validateJsonLd(patch.json_ld);
  };

  const saveMutation = useMutation({
    mutationFn: (data: FormData) =>
      mode === 'edit' ? api.updatePage(pageId!, data) : api.createPage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      window.location.href = '/admin/pages';
    },
    onSettled: () => { submittingRef.current = false; },
  });

  const handleSave = () => {
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
    data.append('content_sections', JSON.stringify(sections));
    data.append('faq_items', JSON.stringify(faqItems));
    data.append('hero_json', JSON.stringify(hero));
    if (ogImageFile) data.append('og_image_file', ogImageFile);
    if (heroVideoFile) data.append('hero_video_file', heroVideoFile);
    saveMutation.mutate(data);
  };

  if (mode === 'edit' && existing.isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#C9A962] border-t-transparent"></div>
      </div>
    );
  }

  if (mode === 'edit' && existing.isError) {
    return (
      <div className="p-8">
        <p className="text-red-300">Failed to load page — {String((existing.error as Error)?.message || 'unknown error')}</p>
      </div>
    );
  }

  return (
    <>
      <AdminSidebar currentPath={currentPath} />
      <main className="min-w-0 flex-1 overflow-auto pt-16 md:pt-0">
        <div className="p-8 max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <div className="flex items-center gap-3 text-sm text-white/40">
                <a href="/admin/pages" className="hover:text-white">← Pages</a>
                {mode === 'edit' && form.slug && (
                  <a href={`/${form.slug}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">View page ↗</a>
                )}
              </div>
              <h1 className="text-2xl font-semibold text-white mt-2">
                {mode === 'edit' ? (form.title || 'Edit Page') : 'New Page'}
              </h1>
              <p className="text-white/40 text-sm">
                {form.slug ? `blvdpark.com/${form.slug}` : 'Set a title and slug to get started'}
                {form.status === 'published' ? ' · published' : ' · draft'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-6 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50 font-medium"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Page'}
            </button>
          </div>

          {saveMutation.error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {saveMutation.error.message}
            </div>
          )}

          <div className="border border-white/10 rounded-xl p-5 space-y-4 bg-white/[0.02]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          <PageEditorHero hero={hero} onChange={setHero} onVideoFileChange={setHeroVideoFile} />

          <PageEditorSections
            sections={sections}
            onChange={setSections}
            faqItems={faqItems}
            onFaqChange={setFaqItems}
          />

          <PageEditorSeo
            seoTitle={form.seo_title}
            seoDescription={form.seo_description}
            seoKeywords={form.seo_keywords}
            ogImage={form.og_image}
            jsonLd={form.json_ld}
            robots={form.robots}
            status={form.status}
            slug={form.slug}
            fallbackTitle={form.title}
            fallbackDescription={form.description}
            jsonLdError={jsonLdError}
            onChange={patchForm}
            onOgFileChange={setOgImageFile}
          />

          <div className="flex justify-end pb-8">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-8 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50 font-medium"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Page'}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
