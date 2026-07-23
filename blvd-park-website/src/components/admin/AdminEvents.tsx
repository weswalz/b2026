import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getImageUrl, type Event } from '../../lib/api';

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function AdminEvents() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugValue, setSlugValue] = useState('');
  const [titleValue, setTitleValue] = useState('');
  const [slugError, setSlugError] = useState('');
  const [isRecurringValue, setIsRecurringValue] = useState(false);
  const submittingRef = useRef(false);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', 'all', showDeleted],
    queryFn: () => api.getEvents(true, showDeleted),
  });

  const resetFormState = (event?: Event | null) => {
    setSlugTouched(!!event);
    setSlugValue(event?.slug || '');
    setTitleValue(event?.title || '');
    setSlugError('');
    setIsRecurringValue(event?.isRecurring === 1);
  };

  const createMutation = useMutation({
    mutationFn: api.createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowForm(false);
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormData }) => api.updateEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setEditingEvent(null);
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const restoreMutation = useMutation({
    mutationFn: api.restoreEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (slugValue && !SLUG_RE.test(slugValue)) {
      setSlugError('Slug must be lowercase letters, numbers, and single hyphens');
      return;
    }
    setSlugError('');
    submittingRef.current = true;
    const formData = new FormData(e.currentTarget);
    formData.set('slug', slugValue);
    if (!formData.get('isRecurring')) formData.delete('isRecurring');

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const submitError = createMutation.error || updateMutation.error;

  const categories = ['special', 'steak-night', 'watch-party', 'live-music', 'holiday'];
  const recurringPatterns = ['weekly', 'biweekly', 'monthly'];
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
          <h1 className="text-2xl font-semibold text-white">Events</h1>
          <p className="text-white/50 mt-1">{events.length} {showDeleted ? 'deleted' : 'total'} events</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className={`px-4 py-2.5 rounded-lg text-sm transition-colors ${
              showDeleted ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
            }`}
          >
            {showDeleted ? 'Showing Deleted' : 'Deleted'}
          </button>
          <button
            onClick={() => { createMutation.reset(); updateMutation.reset(); resetFormState(); setShowForm(true); setEditingEvent(null); }}
            className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Event
          </button>
        </div>
      </div>

      {/* Event Form Modal */}
      {(showForm || editingEvent) && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">
                {editingEvent ? 'Edit Event' : 'New Event'}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingEvent(null); }}
                className="text-white/50 hover:text-white"
              >
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
              <div>
                <label className="block text-white/70 text-sm mb-2">Title</label>
                <input
                  name="title"
                  type="text"
                  required
                  defaultValue={editingEvent?.title}
                  className={inputCls}
                  placeholder="Event title"
                  onChange={(e) => {
                    setTitleValue(e.target.value);
                    if (!slugTouched) setSlugValue(slugify(e.target.value));
                  }}
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Slug (URL: /events/slug)</label>
                <input
                  type="text"
                  value={slugValue}
                  className={inputCls}
                  placeholder={titleValue ? slugify(titleValue) : 'auto-generated-from-title'}
                  onChange={(e) => { setSlugTouched(true); setSlugValue(e.target.value); }}
                />
                {slugError && <p className="text-red-400 text-xs mt-1">{slugError}</p>}
                <p className="text-white/30 text-xs mt-1">Leave blank to auto-generate from title.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm mb-2">Date</label>
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={editingEvent?.date}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-sm mb-2">Time</label>
                  <input
                    name="time"
                    type="time"
                    required
                    defaultValue={editingEvent?.time}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Category</label>
                <select
                  name="category"
                  defaultValue={editingEvent?.category || 'special'}
                  className={inputCls}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat} className="bg-[#1C1C1C]">
                      {cat.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingEvent?.description}
                  className={inputCls + ' resize-none'}
                  placeholder="Event description"
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Ticket URL (optional)</label>
                <input
                  name="ticketUrl"
                  type="url"
                  defaultValue={editingEvent?.ticketUrl || ''}
                  className={inputCls}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-white/70 text-sm mb-2">Image</label>
                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  className={inputCls + ' file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#1A5F36] file:text-white file:cursor-pointer'}
                />
              </div>
              {editingEvent && (
                <div>
                  <label className="block text-white/70 text-sm mb-2">Status</label>
                  <select
                    name="status"
                    defaultValue={editingEvent.status}
                    className={inputCls}
                  >
                    <option value="active" className="bg-[#1C1C1C]">Active</option>
                    <option value="cancelled" className="bg-[#1C1C1C]">Cancelled</option>
                    <option value="completed" className="bg-[#1C1C1C]">Completed</option>
                  </select>
                </div>
              )}

              <div className="border border-white/10 rounded-lg p-4 space-y-4">
                <p className="text-white/70 text-sm font-medium">Recurring</p>
                <label className="flex items-center gap-2 text-white/70">
                  <input
                    name="isRecurring"
                    type="checkbox"
                    checked={isRecurringValue}
                    onChange={(e) => setIsRecurringValue(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-[#1A5F36] focus:ring-[#C9A962]"
                  />
                  This event recurs
                </label>
                {isRecurringValue && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/70 text-sm mb-2">Pattern</label>
                      <select
                        name="recurringPattern"
                        defaultValue={editingEvent?.recurringPattern || 'weekly'}
                        className={inputCls}
                      >
                        {recurringPatterns.map((p) => (
                          <option key={p} value={p} className="bg-[#1C1C1C] capitalize">{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-white/70 text-sm mb-2">End Date (optional)</label>
                      <input
                        name="recurringEndDate"
                        type="date"
                        defaultValue={editingEvent?.recurringEndDate || ''}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-white/10 rounded-lg p-4 space-y-4">
                <p className="text-white/70 text-sm font-medium">SEO</p>
                <input
                  name="seoTitle"
                  defaultValue={editingEvent?.seoTitle || ''}
                  className={inputCls}
                  placeholder="SEO title (falls back to event title)"
                />
                <textarea
                  name="seoDescription"
                  defaultValue={editingEvent?.seoDescription || ''}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  placeholder="Meta description"
                />
                <input
                  name="seoKeywords"
                  defaultValue={editingEvent?.seoKeywords || ''}
                  className={inputCls}
                  placeholder="Keywords, comma, separated"
                />
                <input
                  name="ogTitle"
                  defaultValue={editingEvent?.ogTitle || ''}
                  className={inputCls}
                  placeholder="OG title (falls back to SEO/event title)"
                />
                <textarea
                  name="ogDescription"
                  defaultValue={editingEvent?.ogDescription || ''}
                  rows={2}
                  className={inputCls + ' resize-none'}
                  placeholder="OG description"
                />
                <div>
                  <label className="block text-white/70 text-sm mb-2">OG Image URL</label>
                  {editingEvent?.ogImage && (
                    <img src={getImageUrl(editingEvent.ogImage)} alt="OG preview" className="w-24 h-24 object-cover rounded-lg mb-2" />
                  )}
                  <input
                    name="ogImage"
                    defaultValue={editingEvent?.ogImage || ''}
                    className={inputCls}
                    placeholder="/uploads/... or full URL (falls back to event image)"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingEvent(null); }}
                  className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-white/5 rounded-xl border border-white/10 p-5 flex items-center gap-5"
          >
            {event.image && (
              <img
                src={getImageUrl(event.image)}
                alt={event.title}
                className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-white font-medium truncate">{event.title}</h3>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  event.status === 'active' ? 'bg-[#1A5F36]/30 text-[#22C55E]' :
                  event.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                  'bg-white/10 text-white/50'
                }`}>
                  {event.status}
                </span>
                {event.isRecurring === 1 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[#C9A962]/20 text-[#C9A962]">recurring</span>
                )}
                {event.deleted_at && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">deleted</span>
                )}
              </div>
              <p className="text-white/50 text-sm">
                {new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at {event.time}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[#C9A962] text-xs inline-block capitalize">
                  {event.category.replace('-', ' ')}
                </span>
                {event.slug && <span className="text-white/30 text-xs font-mono">/events/{event.slug}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {event.deleted_at ? (
                <button
                  onClick={() => restoreMutation.mutate(event.id)}
                  className="px-3 py-1.5 text-sm bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors"
                >
                  Restore
                </button>
              ) : (
                <>
                  <button
                    onClick={() => { createMutation.reset(); updateMutation.reset(); resetFormState(event); setEditingEvent(event); }}
                    className="p-2 text-white/50 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this event? It can be restored later from the Deleted filter.')) {
                        deleteMutation.mutate(event.id);
                      }
                    }}
                    className="p-2 text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <p className="text-white/40">{showDeleted ? 'No deleted events' : 'No events yet'}</p>
          {!showDeleted && (
            <button
              onClick={() => { resetFormState(); setShowForm(true); }}
              className="mt-4 text-[#C9A962] hover:underline"
            >
              Create your first event
            </button>
          )}
        </div>
      )}
    </div>
  );
}
