import { useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaPicker from '../MediaPicker';
import type { BuilderSection, FaqItem } from '../../../lib/api';
import { COMPONENT_DEFS, SECTION_TYPE_LABELS, emptyComponentSection, emptyContentSection, newSection } from './defs';
import { TINYMCE_AVAILABLE, TINYMCE_SCRIPT, TINYMCE_INIT } from './tinymceConfig';

interface Props {
  sections: BuilderSection[];
  onChange: (sections: BuilderSection[]) => void;
  faqItems: FaqItem[];
  onFaqChange: (items: FaqItem[]) => void;
}

const inputCls = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';

// Sections + FAQ builder — HEIGHTS parity: module picker (Content Section / HTML /
// Component), per-type field editors with TinyMCE rich text and media library image
// pickers, drag-to-reorder, and an FAQ builder.
export default function PageEditorSections({ sections, onChange, faqItems, onFaqChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const replaceAt = (i: number, next: BuilderSection) =>
    onChange(sections.map((s, idx) => (idx === i ? next : s)));

  const removeAt = (i: number) => {
    if (confirm('Remove this section?')) onChange(sections.filter((_, idx) => idx !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = Number(active.id);
    const to = Number(over.id);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    onChange(arrayMove(sections, from, to));
  };

  const addSection = (kind: 'content-section' | 'html' | 'text' | 'component', componentName?: string) => {
    if (kind === 'component') {
      onChange([...sections, emptyComponentSection(componentName || COMPONENT_DEFS[0].name)]);
    } else if (kind === 'content-section') {
      onChange([...sections, emptyContentSection()]);
    } else {
      onChange([...sections, newSection(kind)]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-white/10 rounded-xl p-5 space-y-4 bg-white/[0.02]">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="text-[#C9A962] text-xs font-mono uppercase tracking-[0.2em]">Page Body</p>
            <h3 className="text-white font-semibold text-lg mt-1">Modules</h3>
            <p className="text-white/40 text-sm">Build the page from visual modules. Drag the grip to reorder.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => addSection('content-section')} className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20">
              + Content Section
            </button>
            <button type="button" onClick={() => addSection('html')} className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20">
              + HTML Block
            </button>
            <button type="button" onClick={() => addSection('text')} className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20">
              + Text
            </button>
            <select
              value=""
              onChange={(e) => { if (e.target.value) { addSection('component', e.target.value); e.target.value = ''; } }}
              className="px-4 py-2 text-sm bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors cursor-pointer"
            >
              <option value="" className="bg-[#1C1C1C]">+ Component ▾</option>
              {COMPONENT_DEFS.map((c) => (
                <option key={c.name} value={c.name} className="bg-[#1C1C1C]">{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {sections.length === 0 && (
          <p className="text-white/30 text-sm py-8 text-center">No modules yet — add one above.</p>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map((_, idx) => idx)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {sections.map((section, i) => (
                <SortableSectionCard
                  key={i}
                  id={i}
                  section={section}
                  index={i}
                  total={sections.length}
                  onChange={(next) => replaceAt(i, next)}
                  onRemove={() => removeAt(i)}
                  onMove={(dir) => move(i, dir)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="border border-white/10 rounded-xl p-5 space-y-4 bg-white/[0.02]">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[#C9A962] text-xs font-mono uppercase tracking-[0.2em]">FAQ</p>
            <h3 className="text-white font-semibold text-lg mt-1">FAQ Items</h3>
            <p className="text-white/40 text-sm">Renders an FAQ section + FAQPage schema automatically.</p>
          </div>
          <button
            type="button"
            onClick={() => onFaqChange([...faqItems, { question: '', answer: '' }])}
            className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20"
          >
            + FAQ Item
          </button>
        </div>
        {faqItems.map((item, i) => (
          <div key={i} className="bg-white/5 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-white/50">
              <span className="uppercase tracking-wider">FAQ #{i + 1}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => { const next = [...faqItems]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onFaqChange(next); }} disabled={i === 0} className="px-2 py-1 hover:text-white disabled:opacity-30">↑</button>
                <button type="button" onClick={() => { const next = [...faqItems]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; onFaqChange(next); }} disabled={i === faqItems.length - 1} className="px-2 py-1 hover:text-white disabled:opacity-30">↓</button>
                <button
                  type="button"
                  onClick={() => { if (confirm('Remove this FAQ item?')) onFaqChange(faqItems.filter((_, idx) => idx !== i)); }}
                  className="px-2 py-1 text-red-400/70 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            </div>
            <input value={item.question} className={inputCls} placeholder="Question" onChange={(e) => onFaqChange(faqItems.map((f, idx) => (idx === i ? { ...f, question: e.target.value } : f)))} />
            {TINYMCE_AVAILABLE ? (
              <div className="bg-black/40 rounded-lg border border-white/10 overflow-hidden">
                <Editor
                  value={item.answer}
                  tinymceScriptSrc={TINYMCE_SCRIPT}
                  init={{ ...TINYMCE_INIT, height: 160 }}
                  onEditorChange={(content) => onFaqChange(faqItems.map((f, idx) => (idx === i ? { ...f, answer: content } : f)))}
                />
              </div>
            ) : (
              <textarea value={item.answer} rows={3} className={inputCls} placeholder="Answer" onChange={(e) => onFaqChange(faqItems.map((f, idx) => (idx === i ? { ...f, answer: e.target.value } : f)))} />
            )}
          </div>
        ))}
        {faqItems.length === 0 && <p className="text-white/30 text-sm">No FAQ items yet.</p>}
      </div>
    </div>
  );
}

// Sortable wrapper — index-based ids (dnd-kit Identifiers must be string|number).
// Reordering calls arrayMove on the sections array; field edits create new section
// objects in place.
function SortableSectionCard({ id, section, index, total, onChange, onRemove, onMove }: {
  id: number;
  section: BuilderSection;
  index: number;
  total: number;
  onChange: (next: BuilderSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-white/5 rounded-xl border ${isDragging ? 'border-[#C9A962]' : 'border-white/10'} overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="px-1.5 py-1 text-white/40 hover:text-white cursor-grab active:cursor-grabbing touch-none"
            title="Drag to reorder"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 4a1 1 0 110-2 1 1 0 010 2zM13 4a1 1 0 110-2 1 1 0 010 2zM7 10a1 1 0 110-2 1 1 0 010 2zM13 10a1 1 0 110-2 1 1 0 010 2zM7 16a1 1 0 110-2 1 1 0 010 2zM13 16a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#1A5F36]/40 text-[#22C55E] uppercase tracking-wider">
            {SECTION_TYPE_LABELS[section.type]}{section.type === 'component' ? ` · ${(section as { name?: string }).name}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="px-2 py-1 text-white/50 hover:text-white disabled:opacity-30 text-sm">↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="px-2 py-1 text-white/50 hover:text-white disabled:opacity-30 text-sm">↓</button>
          <button type="button" onClick={onRemove} className="px-2 py-1 text-red-400/70 hover:text-red-400 text-sm">Remove</button>
        </div>
      </div>
      <div className="p-4">
        <SectionFields section={section} onChange={onChange} />
      </div>
    </div>
  );
}

function SectionFields({ section, onChange }: {
  section: BuilderSection;
  onChange: (next: BuilderSection) => void;
}) {
  if (section.type === 'text' || section.type === 'html') {
    return (
      TINYMCE_AVAILABLE ? (
        <div className="bg-black/40 rounded-lg border border-white/10 overflow-hidden">
          <Editor
            value={section.body}
            tinymceScriptSrc={TINYMCE_SCRIPT}
            init={TINYMCE_INIT}
            onEditorChange={(content) => onChange({ ...section, body: content })}
          />
        </div>
      ) : (
        <textarea
          value={section.body}
          rows={section.type === 'html' ? 6 : 3}
          className={inputCls + (section.type === 'html' ? ' font-mono text-xs' : '')}
          placeholder={section.type === 'html' ? '<h2>Heading</h2><p>Rich content…</p> (scripts are stripped on save)' : 'Plain text paragraph'}
          onChange={(e) => onChange({ ...section, body: e.target.value })}
        />
      )
    );
  }

  if (section.type === 'content-section') {
    const set = (patch: Partial<typeof section>) => onChange({ ...section, ...patch });
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white/70 text-sm mb-2">Title</label>
            <input value={section.title} className={inputCls} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <label className="block text-white/70 text-sm mb-2">Subtitle</label>
            <input value={section.subtitle} className={inputCls} onChange={(e) => set({ subtitle: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="block text-white/70 text-sm mb-2">Content</label>
          {TINYMCE_AVAILABLE ? (
            <div className="bg-black/40 rounded-lg border border-white/10 overflow-hidden">
              <Editor value={section.contentHtml} tinymceScriptSrc={TINYMCE_SCRIPT} init={TINYMCE_INIT} onEditorChange={(content) => set({ contentHtml: content })} />
            </div>
          ) : (
            <textarea value={section.contentHtml} rows={5} className={inputCls + ' font-mono text-xs'} onChange={(e) => set({ contentHtml: e.target.value })} />
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-white/70 text-sm mb-2">Image</label>
            <SectionImagePicker value={section.imageSrc} alt={section.imageAlt} onChange={(url, alt) => set({ imageSrc: url, imageAlt: alt || section.imageAlt })} />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-white/70 text-sm mb-2">Image alt</label>
              <input value={section.imageAlt} className={inputCls} onChange={(e) => set({ imageAlt: e.target.value })} />
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Image position</label>
              <select value={section.imagePosition} className={inputCls} onChange={(e) => set({ imagePosition: e.target.value as 'left' | 'right' })}>
                <option value="left" className="bg-[#1C1C1C]">Left</option>
                <option value="right" className="bg-[#1C1C1C]">Right</option>
              </select>
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Heading level</label>
              <select value={section.headingLevel} className={inputCls} onChange={(e) => set({ headingLevel: e.target.value as 'h2' | 'h3' })}>
                <option value="h2" className="bg-[#1C1C1C]">H2</option>
                <option value="h3" className="bg-[#1C1C1C]">H3</option>
              </select>
            </div>
            <div>
              <label className="block text-white/70 text-sm mb-2">Section anchor (optional)</label>
              <input value={section.id} className={inputCls} placeholder="my-anchor" onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // component
  const def = COMPONENT_DEFS.find((c) => c.name === section.name);
  const setProp = (key: string, value: string | number | boolean) =>
    onChange({ ...section, props: { ...section.props, [key]: value } });

  return (
    <div className="space-y-4">
      <p className="text-white/50 text-sm">{def?.description || 'Unknown component — this module will not render.'}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(def?.props || []).map((prop) => {
          const value = section.props[prop.key];
          return (
            <div key={prop.key}>
              <label className="block text-white/70 text-sm mb-2">{prop.label}</label>
              {prop.type === 'text' && (
                <input value={typeof value === 'string' ? value : ''} className={inputCls} onChange={(e) => setProp(prop.key, e.target.value)} />
              )}
              {prop.type === 'number' && (
                <input
                  type="number"
                  value={typeof value === 'number' ? value : ''}
                  className={inputCls}
                  onChange={(e) => setProp(prop.key, e.target.value === '' ? '' : Math.trunc(Number(e.target.value)))}
                />
              )}
              {prop.type === 'select' && (
                <select value={typeof value === 'string' ? value : ''} className={inputCls} onChange={(e) => setProp(prop.key, e.target.value)}>
                  {(prop.options || []).map((opt) => (
                    <option key={opt} value={opt} className="bg-[#1C1C1C]">{opt || '— None —'}</option>
                  ))}
                </select>
              )}
              {prop.type === 'checkbox' && (
                <button
                  type="button"
                  onClick={() => setProp(prop.key, !value)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-[#22C55E]' : 'bg-white/10'}`}
                  aria-pressed={!!value}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-7' : ''}`}></span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionImagePicker({ value, alt, onChange }: {
  value: string;
  alt: string;
  onChange: (url: string, alt?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const formData = new FormData();
      formData.append('image', file);
      formData.append('alt', alt || name || 'Section image');
      formData.append('category', 'venue');
      formData.append('galleryType', 'main');
      const created = await api.uploadImage(formData);
      onChange(created.url);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {value && <img src={value} alt="Section preview" className="w-24 h-24 object-cover rounded-lg" />}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => setOpen(true)} className="px-4 py-2.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">
          Choose from Library
        </button>
        <label className="px-4 py-2.5 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors cursor-pointer">
          {uploading ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
          />
        </label>
        {value && (
          <button type="button" onClick={() => onChange('')} className="text-white/50 hover:text-white text-sm">Remove</button>
        )}
      </div>
      <MediaPicker open={open} onOpenChange={setOpen} onSelect={(url) => onChange(url)} selectedUrl={value} />
    </div>
  );
}
