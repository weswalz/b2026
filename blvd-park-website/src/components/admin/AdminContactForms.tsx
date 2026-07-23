import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ContactSubmission } from '../../lib/api';

export default function AdminContactForms() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedMessage, setSelectedMessage] = useState<ContactSubmission | null>(null);

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['contact', filterStatus],
    queryFn: () => api.getContactSubmissions(filterStatus || undefined),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ContactSubmission> }) =>
      api.updateContactSubmission(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contact'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteContactSubmission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact'] });
      setSelectedMessage(null);
    },
  });

  const statusOptions = ['unread', 'read', 'replied', 'archived'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unread': return 'bg-[#C9A962]/20 text-[#C9A962]';
      case 'read': return 'bg-blue-500/20 text-blue-400';
      case 'replied': return 'bg-[#1A5F36]/30 text-[#22C55E]';
      case 'archived': return 'bg-white/10 text-white/50';
      default: return 'bg-white/10 text-white/50';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
          <h1 className="text-2xl font-semibold text-white">Messages</h1>
          <p className="text-white/50 mt-1">
            {submissions.filter(s => s.status === 'unread').length} unread of {submissions.length} total
          </p>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6">
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

      {/* Message Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1C1C] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white">Message Details</h2>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-white/50 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-medium text-lg">{selectedMessage.name}</h3>
                  <p className="text-white/50">{selectedMessage.email}</p>
                  {selectedMessage.phone && (
                    <p className="text-white/50">{selectedMessage.phone}</p>
                  )}
                </div>
                <span className={`px-3 py-1 text-sm rounded-full capitalize ${getStatusColor(selectedMessage.status)}`}>
                  {selectedMessage.status}
                </span>
              </div>

              {selectedMessage.subject && (
                <div>
                  <p className="text-white/50 text-sm mb-1">Subject</p>
                  <p className="text-white font-medium">{selectedMessage.subject}</p>
                </div>
              )}

              <div>
                <p className="text-white/50 text-sm mb-2">Message</p>
                <div className="bg-white/5 rounded-lg p-4 text-white/80 whitespace-pre-wrap">
                  {selectedMessage.message}
                </div>
              </div>

              <div>
                <p className="text-white/50 text-sm mb-2">Update Status</p>
                <select
                  value={selectedMessage.status}
                  onChange={(e) => {
                    updateMutation.mutate({ id: selectedMessage.id, data: { status: e.target.value } });
                    setSelectedMessage({ ...selectedMessage, status: e.target.value });
                  }}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none"
                >
                  {statusOptions.map(s => (
                    <option key={s} value={s} className="bg-[#1C1C1C] capitalize">{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <a
                  href={`mailto:${selectedMessage.email}?subject=Re: ${selectedMessage.subject || 'Your message to BLVD Park'}`}
                  className="flex-1 px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors text-center flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-9m0 0l9 9m-9-9v18"/>
                  </svg>
                  Reply
                </a>
                <button
                  onClick={() => {
                    if (confirm('Delete this message?')) {
                      deleteMutation.mutate(selectedMessage.id);
                    }
                  }}
                  className="px-5 py-3 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages List */}
      <div className="space-y-2">
        {submissions.map((submission) => (
          <div
            key={submission.id}
            className={`bg-white/5 rounded-xl border border-white/10 p-5 hover:bg-white/[0.07] transition-colors cursor-pointer ${
              submission.status === 'unread' ? 'border-l-4 border-l-[#C9A962]' : ''
            }`}
            onClick={() => {
              setSelectedMessage(submission);
              if (submission.status === 'unread') {
                updateMutation.mutate({ id: submission.id, data: { status: 'read' } });
              }
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className={`font-medium ${submission.status === 'unread' ? 'text-white' : 'text-white/70'}`}>
                    {submission.name}
                  </h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${getStatusColor(submission.status)}`}>
                    {submission.status}
                  </span>
                </div>
                {submission.subject && (
                  <p className="text-white/80 text-sm mb-1">{submission.subject}</p>
                )}
                <p className="text-white/50 text-sm line-clamp-1">{submission.message}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-white/40 text-sm">{formatDate(submission.createdAt)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {submissions.length === 0 && (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <p className="text-white/40">No messages yet</p>
        </div>
      )}
    </div>
  );
}
