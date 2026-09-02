import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Editor } from '@tinymce/tinymce-react';
import { api, type ContentField, type ContentItem, type ContentSection } from '../../lib/api';
import MediaPicker from './MediaPicker';

type ContentMap = Record<string, string>;

const TINYMCE_SCRIPT = '/tinymce/tinymce.min.js';

const fieldInputClass =
  'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none';

function getDefaultValue(field: ContentField) {
  if (typeof field.default === 'boolean') return field.default ? 'true' : 'false';
  return field.default ?? '';
}

export default function AdminContent() {
  const queryClient = useQueryClient();
  const [contentMap, setContentMap] = useState<ContentMap>({});
  const [dirty, setDirty] = useState(false);
  // Tracks which image-type field key the picker is currently open for (null = closed).
  const [mediaPickerFieldKey, setMediaPickerFieldKey] = useState<string | null>(null);

  const { data: schemaData, isLoading: schemaLoading } = useQuery({
    queryKey: ['content-schema'],
    queryFn: api.getContentSchema,
  });

  const { data: contentItems = [], isLoading: contentLoading } = useQuery({
    queryKey: ['content-items'],
    queryFn: api.getContent,
  });

  const sections: ContentSection[] = schemaData?.schema || [];

  useEffect(() => {
    if (contentItems.length === 0) return;
    const nextMap: ContentMap = {};
    contentItems.forEach((item) => {
      nextMap[item.key] = item.value ?? '';
    });
    setContentMap(nextMap);
  }, [contentItems]);

  const mutation = useMutation({
    mutationFn: (items: ContentItem[]) => api.updateContent(items),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['content-items'] });
    },
  });

  const handleFieldChange = (key: string, value: string) => {
    setContentMap((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const buildItemsForSave = useMemo(() => {
    const items: ContentItem[] = [];
    sections.forEach((section) => {
      section.fields.forEach((field) => {
        const value = contentMap[field.key] ?? getDefaultValue(field);
        items.push({ key: field.key, value, type: field.type });
      });
    });
    return items;
  }, [contentMap, sections]);

  const handleSave = () => {
    mutation.mutate(buildItemsForSave);
  };

  if (schemaLoading || contentLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#C9A962] border-t-transparent"></div>
        <p className="text-white/60 mt-4">Loading content editor...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Site Content</h1>
          <p className="text-white/50 mt-1">Edit every public-facing area of the website.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || mutation.isPending}
          className="px-6 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>

      <div className="space-y-10">
        {sections.map((section) => (
          <div key={section.id} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <span className="text-xs text-white/40">{section.fields.length} fields</span>
            </div>
            <div className="p-6 space-y-6">
              {section.fields.map((field) => {
                const value = contentMap[field.key] ?? getDefaultValue(field);
                const isBoolean = field.type === 'boolean';
                return (
                  <div key={field.key} className="space-y-2">
                    <label className="block text-sm text-white/70" htmlFor={field.key}>
                      {field.label}
                      <span className="ml-2 text-xs text-white/30 font-mono">{field.key}</span>
                    </label>

                    {field.type === 'textarea' && (
                      <textarea
                        id={field.key}
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        rows={4}
                        className={`${fieldInputClass} resize-y`}
                      />
                    )}

                    {field.type === 'rich' && (
                      <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden">
                        <Editor
                          value={value}
                          tinymceScriptSrc={TINYMCE_SCRIPT}
                          init={{
                            height: 240,
                            menubar: false,
                            skin: 'oxide-dark',
                            content_css: 'dark',
                            plugins: 'link lists code',
                            toolbar:
                              'undo redo | styles | bold italic underline | alignleft aligncenter alignright | bullist numlist | link | code',
                          }}
                          onEditorChange={(content) => handleFieldChange(field.key, content)}
                        />
                      </div>
                    )}

                    {(field.type === 'text' || field.type === 'url' || field.type === 'number') && (
                      <input
                        id={field.key}
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className={fieldInputClass}
                      />
                    )}

                    {field.type === 'image' && (
                      <div className="flex items-center gap-3">
                        {value && (
                          <img src={value} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                        <input
                          id={field.key}
                          type="text"
                          value={value}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          className={fieldInputClass}
                        />
                        <button
                          type="button"
                          onClick={() => setMediaPickerFieldKey(field.key)}
                          className="px-4 py-3 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors flex-shrink-0 whitespace-nowrap"
                        >
                          Browse
                        </button>
                      </div>
                    )}

                    {isBoolean && (
                      <label className="inline-flex items-center gap-3 text-white/70">
                        <input
                          id={field.key}
                          type="checkbox"
                          checked={value === 'true'}
                          onChange={(e) => handleFieldChange(field.key, e.target.checked ? 'true' : 'false')}
                          className="w-4 h-4 rounded bg-white/10 border-white/20 text-[#1A5F36] focus:ring-[#C9A962]"
                        />
                        <span>{value === 'true' ? 'Enabled' : 'Disabled'}</span>
                      </label>
                    )}

                    {field.type === 'image' && (
                      <p className="text-xs text-white/30">
                        Tip: Click Browse to pick from the media library, or paste any hosted URL directly.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <MediaPicker
        open={mediaPickerFieldKey !== null}
        onOpenChange={(open) => { if (!open) setMediaPickerFieldKey(null); }}
        onSelect={(url) => { if (mediaPickerFieldKey) handleFieldChange(mediaPickerFieldKey, url); }}
        selectedUrl={mediaPickerFieldKey ? contentMap[mediaPickerFieldKey] : undefined}
      />
    </div>
  );
}
