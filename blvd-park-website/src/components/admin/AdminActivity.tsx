import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type ActivityLogItem, type AccessLogItem } from '../../lib/api';

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-[#1A5F36]/30 text-[#22C55E]',
  update: 'bg-blue-500/20 text-blue-400',
  delete: 'bg-red-500/20 text-red-400',
  restore: 'bg-[#C9A962]/20 text-[#C9A962]',
  reorder: 'bg-white/10 text-white/60',
  access: 'bg-white/10 text-white/60',
};

const getActionColor = (action: string) => ACTION_COLORS[action] || 'bg-white/10 text-white/60';

const formatDetails = (details: string | null) => {
  if (!details) return '';
  try {
    const parsed = JSON.parse(details);
    return Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join(', ');
  } catch (_e) {
    return details;
  }
};

export default function AdminActivity() {
  const [tab, setTab] = useState<'activity' | 'access'>('activity');

  const { data: activity = [], isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: api.getActivity,
    enabled: tab === 'activity',
  });

  const { data: accessLog = [], isLoading: accessLoading } = useQuery({
    queryKey: ['access-log'],
    queryFn: api.getAccessLog,
    enabled: tab === 'access',
  });

  const rows: (ActivityLogItem | AccessLogItem)[] = tab === 'activity' ? activity : accessLog;
  const isLoading = tab === 'activity' ? activityLoading : accessLoading;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Activity</h1>
          <p className="text-white/50 mt-1">Audit trail of admin actions and auth events</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('activity')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            tab === 'activity' ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          Activity Log
        </button>
        <button
          onClick={() => setTab('access')}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${
            tab === 'access' ? 'bg-[#C9A962] text-[#1C1C1C]' : 'bg-white/10 text-white/70 hover:text-white'
          }`}
        >
          Access Log
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#C9A962] border-t-transparent"></div>
        </div>
      ) : (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-white/50 text-sm font-medium p-4">Time</th>
                  <th className="text-left text-white/50 text-sm font-medium p-4">User</th>
                  <th className="text-left text-white/50 text-sm font-medium p-4">Action</th>
                  <th className="text-left text-white/50 text-sm font-medium p-4">Resource</th>
                  {tab === 'access' && <th className="text-left text-white/50 text-sm font-medium p-4">Route</th>}
                  <th className="text-left text-white/50 text-sm font-medium p-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-4 text-white/70 text-sm whitespace-nowrap">
                      {new Date(row.createdAt + 'Z').toLocaleString()}
                    </td>
                    <td className="p-4 text-white text-sm">{row.username || 'system'}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${getActionColor(row.action)}`}>
                        {row.action}
                      </span>
                    </td>
                    <td className="p-4 text-white/70 text-sm">
                      {row.resourceType}
                      {row.resourceId ? ` #${row.resourceId}` : ''}
                    </td>
                    {tab === 'access' && (
                      <td className="p-4 text-white/50 text-sm font-mono">
                        {(row as AccessLogItem).method} {(row as AccessLogItem).route}
                        {(row as AccessLogItem).statusCode ? ` (${(row as AccessLogItem).statusCode})` : ''}
                      </td>
                    )}
                    <td className="p-4 text-white/40 text-xs max-w-xs truncate" title={formatDetails(row.details)}>
                      {formatDetails(row.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/40">No {tab === 'activity' ? 'activity' : 'access'} recorded yet</p>
        </div>
      )}
    </div>
  );
}
