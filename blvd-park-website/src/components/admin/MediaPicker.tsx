import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl, type MediaItem } from '../../lib/api';

interface MediaPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  selectedUrl?: string;
}

export default function MediaPicker({ open, onOpenChange, onSelect, selectedUrl }: MediaPickerProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'browse' | 'upload'>('browse');
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['media-list'],
    queryFn: api.getMediaList,
    enabled: open,
  });

  const uploadMutation = useMutation({
    mutationFn: (data: FormData) => api.uploadImage(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['media-list'] });
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
      onSelect(created.url);
      onOpenChange(false);
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.filename.toLowerCase().includes(q));
  }, [items, search]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const formData = new FormData();
    formData.append('image', file);
    formData.append('alt', name);
    formData.append('category', 'venue');
    formData.append('galleryType', 'main');
    try {
      await uploadMutation.mutateAsync(formData);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
      <div className="bg-[#1C1C1C] rounded-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Select Media</h2>
          <button onClick={() => onOpenChange(false)} className="text-white/50 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex gap-2 px-6 pt-4">
          <button
            onClick={() => setTab('browse')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'browse' ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'}`}
          >
            Browse
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'upload' ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'}`}
          >
            Upload New
          </button>
        </div>

        {tab === 'browse' ? (
          <>
            <div className="px-6 pt-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search filenames..."
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="text-center py-16">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#C9A962] border-t-transparent"></div>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-white/40 text-center py-16">No media found</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {filtered.map((item: MediaItem) => (
                    <button
                      key={item.url}
                      onClick={() => { onSelect(item.url); onOpenChange(false); }}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedUrl === item.url ? 'border-[#C9A962]' : 'border-transparent hover:border-white/30'
                      }`}
                      title={item.filename}
                    >
                      <img src={getImageUrl(item.url)} alt={item.filename} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleUpload(f); }}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-white/20 hover:border-white/40 rounded-xl p-10 text-center transition-colors"
            >
              <input
                id="media-picker-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#C9A962] border-t-transparent"></div>
                  <p className="text-white/70">Uploading...</p>
                </div>
              ) : (
                <div>
                  <p className="text-white/50">Drop an image here to upload</p>
                  <label
                    htmlFor="media-picker-upload"
                    className="inline-flex items-center justify-center mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    Select file
                  </label>
                </div>
              )}
              {uploadMutation.error && (
                <p className="text-red-400 text-sm mt-4">{uploadMutation.error.message}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
