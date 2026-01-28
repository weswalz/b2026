import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => api.getEvents(),
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', 'pending'],
    queryFn: () => api.getReservations('pending'),
  });

  const statCards = [
    { label: 'Active Events', value: stats?.activeEvents || 0, href: '/admin/events', color: 'bg-[#1A5F36]' },
    { label: 'Gallery Images', value: stats?.galleryImages || 0, href: '/admin/gallery', color: 'bg-[#0F3D22]' },
    { label: 'Menu Items', value: stats?.menuItems || 0, href: '/admin/menu', color: 'bg-[#1A5F36]' },
    { label: 'Pending Reservations', value: stats?.pendingReservations || 0, href: '/admin/reservations', color: 'bg-[#C9A962]', textDark: true },
    { label: 'New Event Inquiries', value: stats?.newPrivateEvents || 0, href: '/admin/private-events', color: 'bg-[#C9A962]', textDark: true },
    { label: 'Unread Messages', value: stats?.unreadMessages || 0, href: '/admin/contact', color: 'bg-[#0F3D22]' },
  ];

  const upcomingEvents = events.slice(0, 5);
  const pendingReservations = reservations.slice(0, 5);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-white/50 mt-1">Welcome to BLVD Park admin panel</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((stat) => (
          <a
            key={stat.label}
            href={stat.href}
            className={`${stat.color} rounded-xl p-5 transition-transform hover:scale-105`}
          >
            <p className={`text-3xl font-bold ${stat.textDark ? 'text-[#1C1C1C]' : 'text-white'}`}>
              {statsLoading ? '—' : stat.value}
            </p>
            <p className={`text-sm mt-1 ${stat.textDark ? 'text-[#1C1C1C]/70' : 'text-white/70'}`}>
              {stat.label}
            </p>
          </a>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming Events */}
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Upcoming Events</h2>
            <a href="/admin/events" className="text-[#C9A962] text-sm hover:underline">View all</a>
          </div>
          <div className="p-5">
            {upcomingEvents.length === 0 ? (
              <p className="text-white/40 text-center py-8">No upcoming events</p>
            ) : (
              <div className="space-y-4">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-[#1A5F36]/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#22C55E] font-bold text-sm">
                        {new Date(event.date).getDate()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{event.title}</p>
                      <p className="text-white/50 text-sm">
                        {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {event.time}
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 capitalize">
                      {event.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending Reservations */}
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Pending Reservations</h2>
            <a href="/admin/reservations" className="text-[#C9A962] text-sm hover:underline">View all</a>
          </div>
          <div className="p-5">
            {pendingReservations.length === 0 ? (
              <p className="text-white/40 text-center py-8">No pending reservations</p>
            ) : (
              <div className="space-y-4">
                {pendingReservations.map((res) => (
                  <div key={res.id} className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#C9A962]/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#C9A962] font-bold text-sm">
                        {res.partySize}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{res.name}</p>
                      <p className="text-white/50 text-sm">
                        {new Date(res.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {res.time}
                      </p>
                    </div>
                    <a
                      href={`mailto:${res.email}`}
                      className="px-3 py-1.5 text-xs rounded-lg bg-[#1A5F36] text-white hover:bg-[#22C55E] transition-colors"
                    >
                      Contact
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/events"
            className="px-5 py-3 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
            </svg>
            Add Event
          </a>
          <a
            href="/admin/gallery"
            className="px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            Upload Photos
          </a>
          <a
            href="/admin/menu"
            className="px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            Edit Menu
          </a>
          <a
            href="/admin/hours"
            className="px-5 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Update Hours
          </a>
        </div>
      </div>
    </div>
  );
}
