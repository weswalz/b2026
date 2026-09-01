import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PageHero } from '../../../lib/api';

interface Props {
  hero: PageHero;
  onChange: (hero: PageHero) => void;
  onVideoFileChange: (file: File | null) => void;
}

const inputCls = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';

// Hero module editor — title/subtitle/eyebrow, background image (uploads straight
// to the media library) or video file (attached to the page on save), logo overlay
// toggle, and up to two styled CTAs. Mirrors HEIGHTSASTRO's hero section of the
// page editor.
export default function PageEditorHero({ hero, onChange, onVideoFileChange }: Props) {
  const queryClient = useQueryClient();
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [videoPicked, setVideoPicked] = useState<File | null>(null);

  const set = (patch: Partial<PageHero>) => onChange({ ...hero, ...patch });

  const setCta = (i: number, patch: Partial<PageHero['ctas'][number]>) =>
    set({ ctas: hero.ctas.map((cta, idx) => (idx === i ? { ...cta, ...patch } : cta)) });

  const imageUpload = useMutation({
    mutationFn: (data: FormData) => api.uploadImage(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
      set({ image: created.url });
    },
  });

  const uploadImageFile = (file: File) => {
    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const formData = new FormData();
    formData.append('image', file);
    formData.append('alt', name || 'Hero image');
    formData.append('category', 'venue');
    formData.append('galleryType', 'main');
    imageUpload.mutate(formData);
  };

  return (
    <div className="border border-white/10 rounded-xl p-5 space-y-5 bg-white/[0.02]">
      <div>
        <p className="text-[#C9A962] text-xs font-mono uppercase tracking-[0.2em]">Hero</p>
        <h3 className="text-white font-semibold text-lg mt-1">Header band</h3>
        <p className="text-white/40 text-sm">The big dark band at the top of the page — background, headline, and buttons.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-white/70 text-sm mb-2">Eyebrow (small text above title)</label>
          <input value={hero.eyebrow} className={inputCls} placeholder="BLVD PARK" onChange={(e) => set({ eyebrow: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-white/70 text-sm mb-2">Hero title</label>
          <input value={hero.title} className={inputCls} placeholder="Defaults to the page title" onChange={(e) => set({ title: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="block text-white/70 text-sm mb-2">Subtitle</label>
        <input value={hero.subtitle} className={inputCls} placeholder="Short supporting line" onChange={(e) => set({ subtitle: e.target.value })} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-white/70 text-sm mb-2">Background image</label>
          {hero.image && <img src={hero.image} alt="Hero preview" className="w-24 h-24 object-cover rounded-lg mb-2" />}
          <div className="flex items-center gap-3">
            <label className="px-4 py-2.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors cursor-pointer">
              {imageUpload.isPending ? 'Uploading…' : 'Upload Image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadImageFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {hero.image && (
              <button type="button" onClick={() => set({ image: '' })} className="text-white/50 hover:text-white text-sm">Remove</button>
            )}
          </div>
          {imageUpload.error && <p className="text-red-400 text-xs mt-2">{imageUpload.error.message}</p>}
        </div>

        <div>
          <label className="block text-white/70 text-sm mb-2">Background video (mp4/webm)</label>
          {hero.video && !videoPicked && <p className="text-white/50 text-sm mb-2 truncate">Current: {hero.video}</p>}
          {videoPicked && <p className="text-[#22C55E] text-sm mb-2 truncate">Selected: {videoPicked.name}</p>}
          <div className="flex items-center gap-3">
            <label className="px-4 py-2.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors cursor-pointer">
              Choose Video
              <input
                ref={videoFileRef}
                type="file"
                accept="video/mp4,video/webm"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setVideoPicked(file);
                  onVideoFileChange(file);
                  if (file && hero.video) set({ video: '' });
                }}
              />
            </label>
            {(hero.video || videoPicked) && (
              <button
                type="button"
                onClick={() => { if (videoFileRef.current) videoFileRef.current.value = ''; setVideoPicked(null); onVideoFileChange(null); set({ video: '' }); }}
                className="text-white/50 hover:text-white text-sm"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-white/30 text-xs mt-2">Max 45MB. Replaces the background image on the page.</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        <div>
          <p className="text-white text-sm font-medium">Show BLVD logo overlay</p>
          <p className="text-white/40 text-xs">Display the white BLVD Park mark above the hero title.</p>
        </div>
        <button
          type="button"
          onClick={() => set({ showLogo: !hero.showLogo })}
          className={`relative w-12 h-6 rounded-full transition-colors ${hero.showLogo ? 'bg-[#22C55E]' : 'bg-white/10'}`}
          aria-pressed={hero.showLogo}
        >
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all ${hero.showLogo ? 'left-7' : ''}`}></span>
        </button>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-white/70 text-sm font-medium">Hero buttons (up to 2)</p>
          {hero.ctas.length < 2 && (
            <button
              type="button"
              onClick={() => set({ ctas: [...hero.ctas, { label: '', href: '', style: 'primary' }] })}
              className="px-3 py-1.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20"
            >
              + Button
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hero.ctas.map((cta, i) => (
            <div key={i} className="border border-white/10 rounded-lg p-4 space-y-3 bg-black/20">
              <div className="flex justify-between items-center">
                <p className="text-white/50 text-xs uppercase tracking-wider">{i === 0 ? 'Primary' : 'Secondary'}</p>
                <button type="button" onClick={() => set({ ctas: hero.ctas.filter((_, idx) => idx !== i) })} className="text-red-400/70 hover:text-red-400 text-xs">Remove</button>
              </div>
              <input value={cta.label} className={inputCls} placeholder="Label (e.g. Book Now)" onChange={(e) => setCta(i, { label: e.target.value })} />
              <input value={cta.href} className={inputCls} placeholder="/book" onChange={(e) => setCta(i, { href: e.target.value })} />
              <select value={cta.style} className={inputCls} onChange={(e) => setCta(i, { style: e.target.value as 'primary' | 'secondary' })}>
                <option value="primary" className="bg-[#1C1C1C]">Green filled</option>
                <option value="secondary" className="bg-[#1C1C1C]">Glass outline</option>
              </select>
            </div>
          ))}
          {hero.ctas.length === 0 && <p className="text-white/30 text-sm">No hero buttons yet.</p>}
        </div>
      </div>
    </div>
  );
}
