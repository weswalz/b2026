import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl, type MenuItem } from '../../lib/api';

export default function AdminMenu() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['menu', 'all'],
    queryFn: () => api.getMenu(undefined, true),
  });

  const createMutation = useMutation({
    mutationFn: api.createMenuItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => api.updateMenuItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setEditingItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteMenuItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu'] }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const categories = ['food', 'drinks', 'appetizers', 'entrees', 'desserts', 'cocktails', 'beer', 'wine'];
  const uniqueCategories = [...new Set(items.map(i => i.category))];

  const filteredItems = filterCategory
    ? items.filter(i => i.category === filterCategory)
    : items;

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
          <h1 className="text-2xl font-semibold text-white">Menu</h1>
          <p className="text-white/50 mt-1">{items.length} items</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingItem(null); }}
          className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Add Item
        </button>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilterCategory('')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            !filterCategory ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          All
        </button>
        {uniqueCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
              filterCategory === cat ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Form Modal */}
      {(showForm || editingItem) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">
                {editingItem ? 'Edit Menu Item' : 'New Menu Item'}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingItem(null); }}
                className="text-white/50 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-white/70 text-sm mb-2">Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingItem?.name}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Price</label>
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={editingItem?.price}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Category</label>
                  <select
                    name="category"
                    required
                    defaultValue={editingItem?.category || 'food'}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat} className="bg-[#1C1C1C] capitalize">{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Subcategory (optional)</label>
                <input
                  name="subcategory"
                  type="text"
                  defaultValue={editingItem?.subcategory || ''}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
                  placeholder="e.g., Starters, Mains, Signature"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingItem?.description}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Image</label>
                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#1A5F36] file:text-white file:cursor-pointer"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-white/70">
                  <input
                    name="isLunchOnly"
                    type="checkbox"
                    defaultChecked={editingItem?.isLunchOnly === 1}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-[#1A5F36] focus:ring-[#C9A962]"
                  />
                  Lunch Only
                </label>
                {editingItem && (
                  <label className="flex items-center gap-2 text-white/70">
                    <input
                      name="isAvailable"
                      type="checkbox"
                      defaultChecked={editingItem.isAvailable === 1}
                      className="w-4 h-4 rounded bg-white/10 border-white/20 text-[#1A5F36] focus:ring-[#C9A962]"
                    />
                    Available
                  </label>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingItem(null); }}
                  className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu Items Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className={`bg-white/5 rounded-xl border border-white/10 overflow-hidden ${
              !item.isAvailable ? 'opacity-50' : ''
            }`}
          >
            {item.image && (
              <img
                src={getImageUrl(item.image)}
                alt={item.name}
                className="w-full h-40 object-cover"
              />
            )}
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-white font-medium">{item.name}</h3>
                <span className="text-[#C9A962] font-semibold">${item.price.toFixed(2)}</span>
              </div>
              {item.description && (
                <p className="text-white/50 text-sm mb-3 line-clamp-2">{item.description}</p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60 capitalize">
                    {item.category}
                  </span>
                  {item.isLunchOnly === 1 && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[#C9A962]/20 text-[#C9A962]">
                      Lunch
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingItem(item)}
                    className="p-1.5 text-white/50 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this menu item?')) {
                        deleteMutation.mutate(item.id);
                      }
                    }}
                    className="p-1.5 text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/40">No menu items found</p>
        </div>
      )}
    </div>
  );
}
