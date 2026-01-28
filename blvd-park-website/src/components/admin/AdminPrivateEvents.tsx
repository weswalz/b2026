import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type PrivateEvent } from '../../lib/api';

export default function AdminPrivateEvents() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<PrivateEvent | null>(null);
  const [notes, setNotes] = useState('');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['private-events', filterStatus],
    queryFn: () => api.getPrivateEvents(filterStatus || undefined),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PrivateEvent> }) =>
      api.updatePrivateEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private-events'] });
      setSelectedEvent(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deletePrivateEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['private-events'] }),
  });

  const statusOptions = ['new', 'contacted', 'quoted', 'booked', 'declined'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-[#C9A962]/20 text-[#C9A962]';
      case 'contacted': return 'bg-blue-500/20 text-blue-400';
      case 'quoted': return 'bg-purple-500/20 text-purple-400';
      case 'booked': return 'bg-[#1A5F36]/30 text-[#22C55E]';
      case 'declined': return 'bg-red-500/20 text-red-400';
      default: return 'bg-white/10 text-white/50';
    }
  };

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
          <h1 className="text-2xl font-semibold text-white">Private Events</h1>
          <p className="text-white/50 mt-1">{events.length} inquiries</p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            !filterStatus ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          All
        </button>
        {statusOptions.map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${
              filterStatus === status ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Event Inquiry Details</h2>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-white/50 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-white/50 text-sm">Contact</p>
                  <p className="text-white font-medium">{selectedEvent.name}</p>
                  <p className="text-white/70">{selectedEvent.email}</p>
                  <p className="text-white/70">{selectedEvent.phone}</p>
                  {selectedEvent.company && (
                    <p className="text-[#C9A962] mt-1">{selectedEvent.company}</p>
                  )}
                </div>
                <div>
                  <p className="text-white/50 text-sm">Event Details</p>
                  <p className="text-white font-medium capitalize">{selectedEvent.eventType}</p>
                  {selectedEvent.preferredDate && (
                    <p className="text-white/70">
                      {new Date(selectedEvent.preferredDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {selectedEvent.guestCount && (
                    <p className="text-white/70">{selectedEvent.guestCount} guests</p>
                  )}
                  {selectedEvent.budget && (
                    <p className="text-[#C9A962]">Budget: {selectedEvent.budget}</p>
                  )}
                </div>
              </div>
              {selectedEvent.details && (
                <div>
                  <p className="text-white/50 text-sm mb-2">Additional Details</p>
                  <p className="text-white/70 bg-white/5 rounded-lg p-4">{selectedEvent.details}</p>
                </div>
              )}
              <div>
                <p className="text-white/50 text-sm mb-2">Status</p>
                <select
                  value={selectedEvent.status}
                  onChange={(e) => updateMutation.mutate({ id: selectedEvent.id, data: { status: e.target.value } })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
                >
                  {statusOptions.map(s => (
                    <option key={s} value={s} className="bg-[#1C1C1C] capitalize">{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <p className="text-white/50 text-sm mb-2">Internal Notes</p>
                <textarea
                  value={notes || selectedEvent.notes || ''}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none resize-none"
                  placeholder="Add notes about this inquiry..."
                />
              </div>
              <div className="flex gap-3">
                <a
                  href={`mailto:${selectedEvent.email}`}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors text-center"
                >
                  Email Client
                </a>
                <button
                  onClick={() => updateMutation.mutate({ id: selectedEvent.id, data: { notes } })}
                  disabled={updateMutation.isPending}
                  className="flex-1 px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                >
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Events List */}
      <div className="space-y-4">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-white/5 rounded-xl border border-white/10 p-5 hover:bg-white/[0.07] transition-colors cursor-pointer"
            onClick={() => { setSelectedEvent(event); setNotes(event.notes || ''); }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-white font-medium">{event.name}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${getStatusColor(event.status)}`}>
                    {event.status}
                  </span>
                </div>
                <p className="text-white/50 text-sm">{event.email} • {event.phone}</p>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-[#C9A962] capitalize">{event.eventType}</span>
                  {event.preferredDate && (
                    <span className="text-white/50">
                      {new Date(event.preferredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {event.guestCount && (
                    <span className="text-white/50">{event.guestCount} guests</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`mailto:${event.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 text-[#C9A962] hover:bg-[#C9A962]/20 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this inquiry?')) {
                      deleteMutation.mutate(event.id);
                    }
                  }}
                  className="p-2 text-red-400/70 hover:text-red-400 hover:bg-red-400/20 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
          <p className="text-white/40">No private event inquiries</p>
        </div>
      )}
    </div>
  );
}
