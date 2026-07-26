import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SeoIssue } from '../../lib/api';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400',
  warning: 'bg-[#C9A962]/20 text-[#C9A962]',
  info: 'bg-white/10 text-white/60',
};

const formatAdminTimestamp = (value: string) => {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? 'Timestamp unavailable' : date.toLocaleString('en-US');
};

export default function AdminSeo() {
  const queryClient = useQueryClient();
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ enabled: false, intervalMinutes: 1440, scopeType: 'all', scopePrefix: '', maxPages: 500, maxDurationMs: 600000 });
  const [indexNowUrl, setIndexNowUrl] = useState('');

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
  const { data: capabilityStatus } = useQuery({ queryKey: ['seo-capabilities'], queryFn: api.getSeoCapabilities });
  const { data: schedule } = useQuery({ queryKey: ['seo-schedule'], queryFn: api.getSeoSchedule });
  const { data: indexNowLog = [] } = useQuery({ queryKey: ['seo-indexnow-log'], queryFn: api.getIndexNowLog });
  const { data: indexNowQueue = [] } = useQuery({ queryKey: ['seo-indexnow-queue'], queryFn: api.getIndexNowQueue, refetchInterval: 5000 });

  useEffect(() => {
    if (!schedule) return;
    setScheduleForm({
      enabled: !!schedule.enabled,
      intervalMinutes: schedule.intervalMinutes,
      scopeType: schedule.scopeType,
      scopePrefix: schedule.scopePrefix || '',
      maxPages: schedule.maxPages,
      maxDurationMs: schedule.maxDurationMs,
    });
  }, [schedule]);

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
  const updateScheduleMutation = useMutation({
    mutationFn: () => api.updateSeoSchedule(scheduleForm as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seo-schedule'] }),
  });
  const indexNowMutation = useMutation({
    mutationFn: () => api.submitIndexNow(indexNowUrl),
    onSuccess: () => {
      setIndexNowUrl('');
      queryClient.invalidateQueries({ queryKey: ['seo-indexnow-log'] });
      queryClient.invalidateQueries({ queryKey: ['seo-indexnow-queue'] });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['seo-indexnow-log'] }),
  });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col justify-between gap-4 mb-8 xl:flex-row xl:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-white">SEO</h1>
          <p className="text-white/50 mt-1">Site health, crawl issues, and search indexing controls</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/admin/seo/resources" className="px-5 py-2.5 bg-[#C9A962] text-[#1C1C1C] rounded-lg hover:bg-[#d7bd7c] transition-colors">Resources &amp; Revisions</a>
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
                        {formatAdminTimestamp(run.startedAt)} · {run.totalUrls} URLs · {run.issueCount} issues
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
                        {formatAdminTimestamp(run.checkedAt)} · {run.validFileCount}/{run.fileCount} files well-formed
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Capability status</h2>
          <p className="mb-4 text-sm text-white/50">Live checks of this candidate's wired subsystems and required configuration.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {capabilityStatus?.capabilities.map((capability) => {
              const configured = capability.configured !== false;
              const partial = capability.status === 'partial';
              const ready = capability.available && configured && !partial;
              const state = ready
                ? 'Ready'
                : partial
                  ? configured ? 'Partial' : 'Partial, configuration required'
                  : capability.available ? 'Available, configuration required' : 'Unavailable';
              return (
                <div key={capability.key} className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${ready ? 'bg-[#22C55E]' : capability.available ? 'bg-[#C9A962]' : 'bg-red-400'}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-white">{capability.label}</p>
                    <p className="text-xs text-white/40">{state}</p>
                    {capability.note && <p className="mt-1 text-xs text-white/30">{capability.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Crawl schedule</h2>
          <p className="mb-4 text-sm text-white/50">Persistent schedule shared with the manual crawler lock.</p>
          {updateScheduleMutation.error && <p className="mb-3 text-sm text-red-300">{updateScheduleMutation.error.message}</p>}
          <form onSubmit={(event) => { event.preventDefault(); updateScheduleMutation.mutate(); }} className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={scheduleForm.enabled} onChange={(e) => setScheduleForm({ ...scheduleForm, enabled: e.target.checked })} /> Enable scheduled crawls</label>
            <label className="text-sm text-white/70">Every (minutes)<input type="number" min="15" max="10080" value={scheduleForm.intervalMinutes} onChange={(e) => setScheduleForm({ ...scheduleForm, intervalMinutes: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white" /></label>
            <label className="text-sm text-white/70">Scope<select value={scheduleForm.scopeType} onChange={(e) => setScheduleForm({ ...scheduleForm, scopeType: e.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white"><option className="bg-[#1C1C1C]" value="all">Entire site</option><option className="bg-[#1C1C1C]" value="prefix">Path prefix</option></select></label>
            <label className="text-sm text-white/70">Prefix<input disabled={scheduleForm.scopeType !== 'prefix'} value={scheduleForm.scopePrefix} onChange={(e) => setScheduleForm({ ...scheduleForm, scopePrefix: e.target.value })} placeholder="/events" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white disabled:opacity-40" /></label>
            <button disabled={updateScheduleMutation.isPending} className="rounded-lg bg-[#1A5F36] px-4 py-2.5 text-white sm:col-span-2">{updateScheduleMutation.isPending ? 'Saving…' : 'Save crawl schedule'}</button>
          </form>
          <p className="mt-3 text-xs text-white/40">Last scheduled start: {schedule?.lastScheduledRunAt ? new Date(schedule.lastScheduledRunAt).toLocaleString() : 'Never'}</p>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
          <h2 className="text-lg font-semibold text-white">IndexNow operations</h2>
          <p className="mb-4 text-sm text-white/50">Queue a venue URL for durable delivery. Pending work survives restarts and failed attempts retry automatically with bounded backoff.</p>
          <form onSubmit={(event) => { event.preventDefault(); indexNowMutation.mutate(); }} className="flex flex-col gap-3 sm:flex-row">
            <input required value={indexNowUrl} onChange={(e) => setIndexNowUrl(e.target.value)} placeholder="https://blvdpark.com/page-or-event" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white" />
            <button disabled={indexNowMutation.isPending} className="rounded-lg bg-[#1A5F36] px-5 py-2.5 text-white">{indexNowMutation.isPending ? 'Submitting…' : 'Submit URL'}</button>
          </form>
          {indexNowMutation.error && <p className="mt-3 text-sm text-red-300">{indexNowMutation.error.message}</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {['pending', 'processing', 'succeeded', 'failed'].map((status) => (
              <div key={status} className="rounded-lg border border-white/5 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-wide text-white/40">{status}</p>
                <p className="mt-1 text-xl text-white">{indexNowQueue.filter((item) => item.status === status).length}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 max-h-64 overflow-auto">
            {indexNowLog.length ? indexNowLog.map((row) => (
              <div key={row.id} className="grid gap-1 border-t border-white/5 py-2 text-xs sm:grid-cols-[8rem_1fr_10rem]">
                <span className={row.status === 'submitted' ? 'text-[#22C55E]' : row.status === 'failed' ? 'text-red-300' : 'text-[#C9A962]'}>{row.status}</span>
                <span className="truncate font-mono text-white/60">{row.url}</span>
                <span className="text-white/40">{new Date(row.submittedAt).toLocaleString()}</span>
              </div>
            )) : <p className="text-sm text-white/40">No IndexNow attempts recorded.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
