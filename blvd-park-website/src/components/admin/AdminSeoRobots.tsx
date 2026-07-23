import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function AdminSeoRobots() {
  const [text, setText] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testAgent, setTestAgent] = useState('*');
  const [testPath, setTestPath] = useState('/');
  const [testResult, setTestResult] = useState<{ allowed: boolean; matchedRule: { directive: string; value: string } | null } | null>(null);

  const { data: liveText, isLoading } = useQuery({ queryKey: ['robots-text'], queryFn: api.getRobotsText });

  useEffect(() => {
    if (liveText !== undefined && text === '') setText(liveText);
  }, [liveText]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveRobotsText(text),
    onSuccess: () => setSaveStatus({ ok: true, message: 'Saved' }),
    onError: (err: Error) => setSaveStatus({ ok: false, message: err.message }),
  });

  const testMutation = useMutation({
    mutationFn: () => api.testRobotsPath(text, testAgent, testPath),
    onSuccess: (result) => setTestResult(result),
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">robots.txt</h1>
        <p className="text-white/50 mt-1">Edit and test the site's crawl policy</p>
        <a href="/robots.txt" target="_blank" rel="noreferrer" className="text-[#C9A962] text-sm hover:underline">View Live</a>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 p-6 mb-6">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={18}
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:border-[#C9A962] focus:outline-none resize-y"
        />
        <div className="flex gap-3 items-center mt-4">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-5 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save robots.txt'}
          </button>
          {saveStatus && (
            <span className={`text-sm ${saveStatus.ok ? 'text-[#22C55E]' : 'text-red-400'}`}>{saveStatus.message}</span>
          )}
        </div>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Path Tester</h2>
        <p className="text-white/50 text-sm mb-4">Check whether a given crawler is allowed to fetch a path, against the text currently in the editor above.</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-white/70 text-sm mb-2">User-Agent</label>
            <input
              value={testAgent}
              onChange={(e) => setTestAgent(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:border-[#C9A962] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-white/70 text-sm mb-2">Path</label>
            <input
              value={testPath}
              onChange={(e) => setTestPath(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:border-[#C9A962] focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={() => testMutation.mutate()}
          className="px-5 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
        >
          Test Path
        </button>
        {testResult && (
          <div className="mt-4 flex items-center gap-3">
            <span className={`px-3 py-1 text-xs rounded-full ${testResult.allowed ? 'bg-[#1A5F36]/30 text-[#22C55E]' : 'bg-red-500/20 text-red-400'}`}>
              {testResult.allowed ? 'Allowed' : 'Blocked'}
            </span>
            {testResult.matchedRule && (
              <span className="text-white/50 text-xs font-mono">matched: {testResult.matchedRule.directive}: {testResult.matchedRule.value}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
