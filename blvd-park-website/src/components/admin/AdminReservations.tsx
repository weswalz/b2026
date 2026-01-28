import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Reservation } from '../../lib/api';

export default function AdminReservations() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('');

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', filterStatus],
    queryFn: () => api.getReservations(filterStatus || undefined),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Reservation> }) =>
      api.updateReservation(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteReservation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations'] }),
  });

  const statusOptions = ['pending', 'confirmed', 'cancelled', 'completed'];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-[#C9A962]/20 text-[#C9A962]';
      case 'confirmed': return 'bg-[#1A5F36]/30 text-[#22C55E]';
      case 'cancelled': return 'bg-red-500/20 text-red-400';
      case 'completed': return 'bg-white/10 text-white/50';
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
          <h1 className="text-2xl font-semibold text-white">Reservations</h1>
          <p className="text-white/50 mt-1">{reservations.length} reservations</p>
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

      {/* Reservations Table */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left text-white/50 text-sm font-medium p-4">Guest</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Date & Time</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Party</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Status</th>
                <th className="text-left text-white/50 text-sm font-medium p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((res) => (
                <tr key={res.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-4">
                    <div>
                      <p className="text-white font-medium">{res.name}</p>
                      <p className="text-white/50 text-sm">{res.email}</p>
                      <p className="text-white/50 text-sm">{res.phone}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="text-white">
                      {new Date(res.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-white/50 text-sm">{res.time}</p>
                  </td>
                  <td className="p-4">
                    <span className="text-white">{res.partySize} guests</span>
                    {res.tablePreference && (
                      <p className="text-white/50 text-sm">{res.tablePreference}</p>
                    )}
                  </td>
                  <td className="p-4">
                    <select
                      value={res.status}
                      onChange={(e) => updateMutation.mutate({ id: res.id, data: { status: e.target.value } })}
                      className={`px-3 py-1.5 rounded-lg text-sm border-0 cursor-pointer ${getStatusColor(res.status)}`}
                    >
                      {statusOptions.map(s => (
                        <option key={s} value={s} className="bg-[#1C1C1C] text-white capitalize">{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <a
                        href={`mailto:${res.email}`}
                        className="p-2 text-[#C9A962] hover:bg-[#C9A962]/20 rounded-lg transition-colors"
                        title="Email guest"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                      </a>
                      <a
                        href={`tel:${res.phone}`}
                        className="p-2 text-[#22C55E] hover:bg-[#22C55E]/20 rounded-lg transition-colors"
                        title="Call guest"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                        </svg>
                      </a>
                      <button
                        onClick={() => {
                          if (confirm('Delete this reservation?')) {
                            deleteMutation.mutate(res.id);
                          }
                        }}
                        className="p-2 text-red-400/70 hover:text-red-400 hover:bg-red-400/20 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reservations.length === 0 && (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto text-white/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <p className="text-white/40">No reservations found</p>
        </div>
      )}
    </div>
  );
}
