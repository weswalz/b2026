import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

// Pages list — creation/editing happens in the full-page builder at
// /admin/pages/new and /admin/pages/:id (see pageEditor/).
export default function AdminPages() {
  const queryClient = useQueryClient();
  const { data: pages = [], isLoading } = useQuery({ queryKey: ['pages'], queryFn: api.getPages });

  const deleteMutation = useMutation({
    mutationFn: api.deletePage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pages'] }),
  });

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
          <h1 className="text-2xl font-semibold text-white">Pages</h1>
          <p className="text-white/50 mt-1">{pages.length} pages — build each one with the page builder</p>
        </div>
        <a
          href="/admin/pages/new"
          className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          New Page
        </a>
      </div>

      <div className="space-y-4">
        {pages.map((page) => (
          <div key={page.id} className="bg-white/5 rounded-xl border border-white/10 p-5 flex items-center gap-5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-white font-medium truncate">{page.title}</h3>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  page.status === 'published' ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-white/10 text-white/50'
                }`}>
                  {page.status}
                </span>
                {page.robots.includes('noindex') && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[#C9A962]/20 text-[#C9A962]">noindex</span>
                )}
              </div>
              <p className="text-white/50 text-sm truncate">
                /{page.slug} — updated {new Date(page.updated_at + 'Z').toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              {page.status === 'published' && (
                <a
                  href={`/${page.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-white/50 hover:text-white text-sm"
                >
                  View
                </a>
              )}
              <button
                onClick={() => { window.location.href = `/admin/pages/${page.id}`; }}
                className="p-2 text-white/50 hover:text-white"
                title="Edit in Page Builder"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
              </button>
              <button
                onClick={() => { if (confirm('Delete this page?')) deleteMutation.mutate(page.id); }}
                className="p-2 text-red-400/70 hover:text-red-400"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {pages.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/40">No pages yet</p>
          <a href="/admin/pages/new" className="mt-4 inline-block text-[#C9A962] hover:underline">
            Create your first page
          </a>
        </div>
      )}
    </div>
  );
}
