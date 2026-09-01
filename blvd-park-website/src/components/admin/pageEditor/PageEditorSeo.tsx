import { useRef, useState } from 'react';
import MediaPicker from '../MediaPicker';

interface Props {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogImage: string;
  jsonLd: string;
  robots: string;
  status: 'draft' | 'published';
  slug: string;
  fallbackTitle: string;
  fallbackDescription: string;
  jsonLdError: string;
  onChange: (patch: Record<string, string>) => void;
  onOgFileChange: (file: File | null) => void;
}

const inputCls = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';
const ROBOTS_OPTIONS = ['noindex, nofollow', 'noindex, follow', 'index, follow', 'index, nofollow'];

// SERP truncation thresholds — Google's live snippet historically cuts around
// ~50-60 chars for titles and ~120-160 for descriptions.
function serpCounterColor(len: number, min: number, max: number) {
  if (len === 0) return 'text-white/30';
  if (len < min) return 'text-white/50';
  if (len <= max) return 'text-[#22C55E]';
  return 'text-[#C9A962]';
}

// SEO + status editor — Google-style live SERP preview, character counters,
// keywords, OG image, JSON-LD, robots and publish status.
export default function PageEditorSeo(props: Props) {
  const {
    seoTitle, seoDescription, seoKeywords, ogImage, jsonLd, robots, status, slug,
    fallbackTitle, fallbackDescription, jsonLdError, onChange, onOgFileChange,
  } = props;
  const ogFileRef = useRef<HTMLInputElement>(null);
  const [ogPicked, setOgPicked] = useState<File | null>(null);

  const serpTitle = seoTitle || fallbackTitle || 'Page title';
  const serpDescription = seoDescription || fallbackDescription || 'A meta description will appear here once you add one.';
  const serpUrl = `blvdpark.com/${slug || 'your-slug'}`;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="border border-white/10 rounded-xl p-5 space-y-4 bg-white/[0.02]">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <p className="text-[#C9A962] text-xs font-mono uppercase tracking-[0.2em]">SEO</p>
          <h3 className="text-white font-semibold text-lg mt-1">Search &amp; sharing</h3>
        </div>
        <div className="flex gap-4">
          <div>
            <label className="block text-white/50 text-xs mb-1">Status</label>
            <select
              value={status}
              className={inputCls + ' !py-2'}
              onChange={(e) => onChange({ status: e.target.value })}
            >
              <option value="draft" className="bg-[#1C1C1C]">Draft (hidden)</option>
              <option value="published" className="bg-[#1C1C1C]">Published (live)</option>
            </select>
          </div>
          <div>
            <label className="block text-white/50 text-xs mb-1">Robots</label>
            <select
              value={robots}
              className={inputCls + ' !py-2'}
              onChange={(e) => onChange({ robots: e.target.value })}
            >
              {ROBOTS_OPTIONS.map((r) => (
                <option key={r} value={r} className="bg-[#1C1C1C]">{r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-white/70 text-sm">SEO title</label>
          <span className={`text-xs font-mono ${serpCounterColor(seoTitle.length, 50, 60)}`}>
            {seoTitle.length} / 50–60
          </span>
        </div>
        <input
          value={seoTitle}
          className={inputCls}
          placeholder="SEO title (falls back to page title)"
          onChange={(e) => onChange({ seo_title: e.target.value })}
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-white/70 text-sm">Meta description</label>
          <span className={`text-xs font-mono ${serpCounterColor(seoDescription.length, 120, 160)}`}>
            {seoDescription.length} / 120–160
          </span>
        </div>
        <textarea
          value={seoDescription}
          rows={2}
          className={inputCls + ' resize-none'}
          placeholder="Meta description"
          onChange={(e) => onChange({ seo_description: e.target.value })}
        />
      </div>

      <div className="bg-white rounded-lg p-4">
        <p className="text-[#1a0dab] text-lg leading-tight truncate" style={{ fontFamily: 'arial, sans-serif' }}>
          {serpTitle}
        </p>
        <p className="text-[#006621] text-sm mt-0.5" style={{ fontFamily: 'arial, sans-serif' }}>{serpUrl}</p>
        <p className="text-[#545454] text-sm mt-1 line-clamp-2" style={{ fontFamily: 'arial, sans-serif' }}>
          {serpDescription}
        </p>
      </div>

      <input
        value={seoKeywords}
        className={inputCls}
        placeholder="Keywords, comma, separated"
        onChange={(e) => onChange({ seo_keywords: e.target.value })}
      />

      <div>
        <label className="block text-white/70 text-sm mb-2">OG image</label>
        {ogImage && !ogPicked && <img src={ogImage} alt="OG preview" className="w-24 h-24 object-cover rounded-lg mb-2" />}
        {ogPicked && <p className="text-[#22C55E] text-sm mb-2 truncate">Selected: {ogPicked.name}</p>}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            Choose from Library
          </button>
          <label className="px-4 py-2.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors cursor-pointer">
            Upload
            <input
              ref={ogFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setOgPicked(file);
                onOgFileChange(file);
                if (file) onChange({ og_image: '' });
              }}
            />
          </label>
          {(ogImage || ogPicked) && (
            <button
              type="button"
              onClick={() => { if (ogFileRef.current) ogFileRef.current.value = ''; setOgPicked(null); onOgFileChange(null); onChange({ og_image: '' }); }}
              className="text-white/50 hover:text-white text-sm"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-white/70 text-sm mb-2">JSON-LD (structured data)</label>
        <textarea
          value={jsonLd}
          rows={4}
          className={inputCls + ' font-mono text-xs resize-none'}
          placeholder='{"@context":"https://schema.org","@type":"WebPage","name":"..."}'
          onChange={(e) => onChange({ json_ld: e.target.value })}
        />
        {jsonLdError && <p className="text-red-400 text-xs mt-1">{jsonLdError}</p>}
      </div>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(url) => onChange({ og_image: url })}
        selectedUrl={ogImage}
      />
    </div>
  );
}
