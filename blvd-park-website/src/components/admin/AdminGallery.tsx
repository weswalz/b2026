import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, getImageUrl, type GalleryImage } from '../../lib/api';

function SortableImage({
  image,
  onDelete,
  onToggleType
}: {
  image: GalleryImage;
  onDelete: (id: number) => void;
  onToggleType: (id: number, type: 'home' | 'main') => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group bg-[#1C1C1C] rounded-xl overflow-hidden border border-white/10"
    >
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="p-2 bg-black/60 rounded-lg text-white/70 hover:text-white cursor-grab active:cursor-grabbing backdrop-blur-sm"
          title="Drag to reorder"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
          </svg>
        </button>
        <span className="text-xs bg-black/60 text-white/70 px-2 py-1 rounded-lg backdrop-blur-sm">
          #{image.position}
        </span>
      </div>

      <img
        src={getImageUrl(image.url)}
        alt={image.alt}
        className="w-full h-48 object-cover"
      />

      <div className="absolute top-3 right-3 flex gap-2">
        <button
          onClick={() => onToggleType(image.id, image.galleryType === 'home' ? 'main' : 'home')}
          className={`p-2 rounded-lg backdrop-blur-sm ${
            image.galleryType === 'home'
              ? 'bg-[#C9A962] text-[#1C1C1C]'
              : 'bg-black/60 text-white/70 hover:text-[#C9A962]'
          }`}
          title={image.galleryType === 'home' ? 'Remove from homepage' : 'Add to homepage'}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
          </svg>
        </button>
        <button
          onClick={() => onDelete(image.id)}
          className="p-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg backdrop-blur-sm"
          title="Delete image"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className="p-4 bg-black/40">
        <p className="text-white text-sm truncate">{image.alt}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full mt-2 inline-block ${
          image.galleryType === 'home'
            ? 'bg-[#C9A962]/20 text-[#C9A962]'
            : 'bg-white/10 text-white/60'
        }`}>
          {image.galleryType === 'home' ? 'Homepage' : 'Gallery'}
        </span>
      </div>
    </div>
  );
}

export default function AdminGallery() {
  const queryClient = useQueryClient();
  const [draggedOrder, setDraggedOrder] = useState<GalleryImage[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['gallery', 'admin'],
    queryFn: () => api.getGallery(),
  });

  const uploadMutation = useMutation({
    mutationFn: (data: FormData) => api.uploadImage(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<GalleryImage> }) =>
      api.updateImage(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: api.reorderGallery,
    onSuccess: () => {
      setDraggedOrder(null);
      queryClient.invalidateQueries({ queryKey: ['gallery'] });
    },
  });

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));

    if (files.length === 0) return;
    setUploading(true);

    for (const file of files) {
      const name = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const formData = new FormData();
      formData.append('image', file);
      formData.append('alt', name);
      formData.append('category', 'venue');
      formData.append('galleryType', 'main');
      await uploadMutation.mutateAsync(formData);
    }
    setUploading(false);
  }, [uploadMutation]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentImages = draggedOrder || images;
    const oldIndex = currentImages.findIndex(img => img.id === active.id);
    const newIndex = currentImages.findIndex(img => img.id === over.id);

    const newOrder = arrayMove(currentImages, oldIndex, newIndex);
    setDraggedOrder(newOrder);
  };

  const saveOrder = () => {
    if (!draggedOrder) return;
    const updates = draggedOrder.map((img, idx) => ({ id: img.id, position: idx + 1 }));
    reorderMutation.mutate(updates);
  };

  const displayImages = draggedOrder || images;

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#C9A962] border-t-transparent"></div>
        <p className="text-white/60 mt-4">Loading gallery...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Gallery</h1>
          <p className="text-white/50 mt-1">{displayImages.length} images</p>
        </div>
        {draggedOrder && (
          <button
            onClick={saveOrder}
            disabled={reorderMutation.isPending}
            className="px-6 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] disabled:opacity-50 font-medium transition-colors"
          >
            {reorderMutation.isPending ? 'Saving...' : 'Save Order'}
          </button>
        )}
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-10 mb-6 text-center transition-all ${
          isDragOver ? 'border-[#C9A962] bg-[#C9A962]/10' : 'border-white/20 hover:border-white/40'
        }`}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#C9A962] border-t-transparent"></div>
            <p className="text-white/70">Uploading...</p>
          </div>
        ) : (
          <div>
            <svg className="w-12 h-12 mx-auto text-white/30 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            <p className="text-white/50">Drop images here to upload</p>
            <p className="text-white/30 text-sm mt-1">Supports JPG, PNG, WebP</p>
          </div>
        )}
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={displayImages.map(img => img.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayImages.map((image) => (
              <SortableImage
                key={image.id}
                image={image}
                onDelete={(id) => {
                  if (confirm('Delete this image?')) {
                    deleteMutation.mutate(id);
                  }
                }}
                onToggleType={(id, type) => updateMutation.mutate({ id, data: { galleryType: type } })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {displayImages.length === 0 && (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <p className="text-white/40">No images yet</p>
          <p className="text-white/30 text-sm mt-1">Drop some images above to get started</p>
        </div>
      )}
    </div>
  );
}
