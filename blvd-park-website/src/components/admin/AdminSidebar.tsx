import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type User } from '../../lib/api';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

export default function AdminSidebar({ currentPath }: { currentPath: string }) {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 30000,
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem('blvd-user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    } catch (_e) {}
  }, []);

  const navItems: NavItem[] = [
    {
      name: 'Dashboard',
      href: '/admin',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
        </svg>
      ),
    },
    {
      name: 'Content',
      href: '/admin/content',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m-6-8h6M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>
        </svg>
      ),
    },
    {
      name: 'Pages',
      href: '/admin/pages',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/>
        </svg>
      ),
    },
    {
      name: 'Events',
      href: '/admin/events',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      ),
      badge: stats?.activeEvents,
    },
    {
      name: 'Gallery',
      href: '/admin/gallery',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      ),
      badge: stats?.galleryImages,
    },
    {
      name: 'Menu',
      href: '/admin/menu',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      ),
      badge: stats?.menuItems,
    },
    {
      name: 'Reservations',
      href: '/admin/reservations',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
      ),
      badge: stats?.pendingReservations,
    },
    {
      name: 'Messages',
      href: '/admin/contact',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
      ),
      badge: stats?.unreadMessages,
    },
    {
      name: 'Hours',
      href: '/admin/hours',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      ),
    },
    {
      name: 'Activity',
      href: '/admin/activity',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      ),
    },
    {
      name: 'Redirects',
      href: '/admin/redirects',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 5H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2m-4-6l4-4m0 0l4 4m-4-4v12"/>
        </svg>
      ),
    },
    // Users nav is super_admin only — role comes from localStorage blvd-user, set at
    // login/SSO. Hidden entirely for admin/editor rather than shown-then-403'd.
    ...(currentUser?.role === 'super_admin'
      ? [
          {
            name: 'Users',
            href: '/admin/users',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
              </svg>
            ),
          } as NavItem,
        ]
      : []),
  ];

  const isActive = (href: string) => {
    if (href === '/admin') return currentPath === '/admin' || currentPath === '/admin/';
    return currentPath.startsWith(href);
  };

  return (
    <aside className="w-64 min-h-screen bg-[#0a0a0a] border-r border-white/5 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-white/5">
        <a href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1A5F36] flex items-center justify-center">
            <span className="text-white font-bold text-lg">B</span>
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg tracking-tight">BLVD Park</h1>
            <p className="text-[#C9A962] text-xs font-medium tracking-wider">ADMIN</p>
          </div>
        </a>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <a
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              isActive(item.href)
                ? 'bg-[#1A5F36] text-white'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.icon}
            <span className="flex-1 font-medium">{item.name}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                isActive(item.href)
                  ? 'bg-white/20 text-white'
                  : 'bg-[#C9A962]/20 text-[#C9A962]'
              }`}>
                {item.badge}
              </span>
            )}
          </a>
        ))}
      </nav>

      {/* User Info & Footer */}
      <div className="p-4 border-t border-white/5">
        {currentUser && (
          <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-white/5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-[#1A5F36] flex items-center justify-center">
              <span className="text-white font-medium text-sm">{currentUser.username.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{currentUser.username}</p>
              <p className="text-white/40 text-xs truncate">{currentUser.role.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <a
          href="/"
          className="flex items-center gap-3 px-4 py-3 text-white/40 hover:text-white/60 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          <span className="text-sm">View Site</span>
        </a>
        <button
          onClick={async () => {
            try {
              await api.logout();
            } catch (_e) {}
            localStorage.removeItem('blvd-auth-token');
            localStorage.removeItem('blvd-user');
            window.location.href = import.meta.env.PUBLIC_ADMIN_HUB_URL || 'https://admin.clegroup.com';
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400/70 hover:text-red-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
}
