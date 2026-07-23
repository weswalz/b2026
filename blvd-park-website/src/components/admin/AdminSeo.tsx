import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SeoIssue } from '../../lib/api';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  warning: 'bg-[#C9A962]/20 text-[#C9A962]',
  info: 'bg-white/10 text-white/60',
};

export default function AdminSeo() {
  const queryClient = useQueryClient();
  const [crawlError, setCrawlError] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['seo-summary'],
    queryFn: api.getSeoSummary,
    refetchInterval: 15000,
  });

  const { data: crawlStatus } = useQuery({
    queryKey: ['seo-crawl-status'],
    queryFn: api.getSeoCrawlStatus,
    refetchInterval: 5000,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ['seo-issues'],
    queryFn: () => api.getSeoIssues('open', 25),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['seo-runs'],
    queryFn: () => api.getSeoAuditRuns(5),
  });

  const { data: sitemapRuns = [] } = useQuery({
    queryKey: ['sitemap-validations'],
    queryFn: () => api.getSitemapValidations(3),
  });

  const runCrawlMutation = useMutation({
    mutationFn: () => api.runSeoCrawl(),
    onSuccess: () => {
      setCrawlError(null);
      queryClient.invalidateQueries({ queryKey: ['seo-crawl-status'] });
    },
    onError: (err: Error) => setCrawlError(err.message),
  });

  const validateSitemapMutation = useMutation({
    mutationFn: api.runSitemapValidation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sitemap-validations'] }),
  });

  const updateIssueMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateSeoIssue(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seo-issues'] }),
  });

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">SEO</h1>
          <p className="text-white/50 mt-1">Site health, crawl issues, and search indexing controls</p>
        </div>
        <div className="flex gap-3">
          <a href="/admin/seo/robots" className="px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">Robots.txt</a>
          <a href="/admin/seo/taxonomy" className="px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors">Entities &amp; Taxonomy</a>
          <button
            onClick={() => runCrawlMutation.mutate()}
            disabled={crawlStatus?.running || runCrawlMutation.isPending}
            className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-40"
          >
            {crawlStatus?.running ? 'Crawl Running…' : 'Run Site Audit'}
          </button>
        </div>
      </div>

      {crawlError && (
        <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{crawlError}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#1A5F36] rounded-xl p-5">
          <p className="text-3xl font-bold text-white">{summaryLoading ? '—' : summary?.resources ?? 0}</p>
          <p className="text-sm mt-1 text-white/70">Tracked Resources</p>
          <p className="text-xs mt-1 text-white/50">{summary?.indexable ?? 0} indexable</p>
        </div>
        <div className="bg-[#0F3D22] rounded-xl p-5">
          <p className="text-3xl font-bold text-white">{summaryLoading ? '—' : summary?.openIssues ?? 0}</p>
          <p className="text-sm mt-1 text-white/70">Open Issues</p>
          <p className="text-xs mt-1 text-white/50">{summary?.criticalIssues ?? 0} critical</p>
        </div>
        <div className="bg-[#1A5F36] rounded-xl p-5">
          <p className="text-3xl font-bold text-white">{crawlStatus?.running ? 'Running' : 'Idle'}</p>
          <p className="text-sm mt-1 text-white/70">Crawl Status</p>
        </div>
        <div className="bg-[#C9A962] rounded-xl p-5">
          <p className="text-3xl font-bold text-[#1C1C1C]">{runs[0]?.totalUrls ?? 0}</p>
          <p className="text-sm mt-1 text-[#1C1C1C]/70">Last Crawl URLs</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Open Issues</h2>
            <span className="text-white/50 text-sm">{issues.length} shown</span>
          </div>
          <div className="p-5">
            {issues.length === 0 ? (
              <p className="text-white/40 text-center py-8">No open issues</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {issues.map((issue: SeoIssue) => (
                  <div key={issue.id} className="flex items-start gap-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${SEVERITY_COLORS[issue.severity] || 'bg-white/10 text-white/60'}`}>
                      {issue.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{issue.title}</p>
                      <p className="text-white/40 text-xs font-mono truncate">{issue.code} · {issue.url}</p>
                    </div>
                    <button
                      onClick={() => updateIssueMutation.mutate({ id: issue.id, status: 'resolved' })}
                      className="text-xs px-2 py-1 bg-white/10 text-white/60 rounded hover:bg-white/20 flex-shrink-0"
                    >
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white/5 rounded-xl border border-white/10">
            <div className="p-5 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Recent Audit Runs</h2>
            </div>
            <div className="p-5">
              {runs.length === 0 ? (
                <p className="text-white/40 text-center py-8">No audits yet</p>
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${run.status === 'completed' ? 'bg-[#1A5F36]/30 text-[#22C55E]' : run.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/60'}`}>
                        {run.status}
                      </span>
                      <div className="flex-1 min-w-0 text-white/70 text-sm">
                        {new Date(run.startedAt + 'Z').toLocaleString('en-US')} · {run.totalUrls} URLs · {run.issueCount} issues
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl border border-white/10">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Sitemap Validation</h2>
              <button
                onClick={() => validateSitemapMutation.mutate()}
                disabled={validateSitemapMutation.isPending}
                className="text-xs px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-40"
              >
                {validateSitemapMutation.isPending ? 'Validating…' : 'Validate Now'}
              </button>
            </div>
            <div className="p-5">
              {sitemapRuns.length === 0 ? (
                <p className="text-white/40 text-center py-8">Not yet validated</p>
              ) : (
                <div className="space-y-3">
                  {sitemapRuns.map((run) => (
                    <div key={run.id} className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${run.overallValid ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-red-500/20 text-red-400'}`}>
                        {run.overallValid ? 'Valid' : 'Failed'}
                      </span>
                      <div className="flex-1 min-w-0 text-white/70 text-sm">
                        {new Date(run.checkedAt + 'Z').toLocaleString('en-US')} · {run.validFileCount}/{run.fileCount} files well-formed
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
