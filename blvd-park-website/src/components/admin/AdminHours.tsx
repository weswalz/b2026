import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type BusinessHours } from '../../lib/api';
import { formatMinutesToTime, parseTimeToMinutes } from '../../lib/time';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function AdminHours() {
  const queryClient = useQueryClient();
  const [editedHours, setEditedHours] = useState<BusinessHours[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: hours = [], isLoading } = useQuery({
    queryKey: ['hours'],
    queryFn: api.getHours,
  });

  useEffect(() => {
    if (hours.length > 0) {
      setEditedHours(hours);
    }
  }, [hours]);

  const updateMutation = useMutation({
    mutationFn: api.updateHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hours'] });
      setHasChanges(false);
    },
  });

  const handleChange = (dayOfWeek: number, field: keyof BusinessHours, value: string | boolean) => {
    setEditedHours(prev =>
      prev.map(h =>
        h.dayOfWeek === dayOfWeek
          ? { ...h, [field]: field === 'isClosed' ? (value ? 1 : 0) : value }
          : h
      )
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    updateMutation.mutate(editedHours);
  };

  const formatTime = (time: string | null) => {
    const minutes = parseTimeToMinutes(time);
    if (minutes === null) return '';
    return formatMinutesToTime(minutes, { uppercase: true, alwaysShowMinutes: true }).replace(/(AM|PM)$/u, ' $1');
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
          <h1 className="text-2xl font-semibold text-white">Business Hours</h1>
          <p className="text-white/50 mt-1">Manage your operating hours</p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-6 py-2.5 bg-[#1A5F36] text-white rounded-lg hover:bg-[#22C55E] transition-colors disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Hours Editor */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[180px_1fr_1fr_auto] gap-4 p-4 border-b border-white/10 text-white/50 text-sm font-medium">
          <div>Day</div>
          <div>Open</div>
          <div>Close</div>
          <div>Closed</div>
        </div>

        {editedHours.map((day) => (
          <div
            key={day.dayOfWeek}
            className={`grid grid-cols-[180px_1fr_1fr_auto] gap-4 p-4 items-center border-b border-white/5 ${
              day.isClosed ? 'opacity-50' : ''
            }`}
          >
            <div className="text-white font-medium">{DAYS[day.dayOfWeek]}</div>
            <div>
              <input
                type="time"
                value={day.openTime || ''}
                disabled={!!day.isClosed}
                onChange={(e) => handleChange(day.dayOfWeek, 'openTime', e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <input
                type="time"
                value={day.closeTime || ''}
                disabled={!!day.isClosed}
                onChange={(e) => handleChange(day.dayOfWeek, 'closeTime', e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#C9A962] focus:outline-none disabled:opacity-50"
              />
            </div>
            <div className="flex items-center justify-center">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!day.isClosed}
                  onChange={(e) => handleChange(day.dayOfWeek, 'isClosed', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
              </label>
            </div>
          </div>
        ))}
      </div>

      {/* Preview */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white mb-4">Preview</h2>
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="grid md:grid-cols-2 gap-4">
            {editedHours.map((day) => (
              <div key={day.dayOfWeek} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                <span className="text-white/70">{DAYS[day.dayOfWeek]}</span>
                <span className={day.isClosed ? 'text-red-400' : 'text-white'}>
                  {day.isClosed
                    ? 'Closed'
                    : `${formatTime(day.openTime)} - ${formatTime(day.closeTime)}`
                  }
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Special Hours Note */}
      <div className="mt-6 p-4 bg-[#C9A962]/10 border border-[#C9A962]/30 rounded-xl">
        <p className="text-[#C9A962] text-sm">
          <strong>Note:</strong> For special holiday hours or temporary changes, update the hours here and they'll be reflected on the website immediately.
        </p>
      </div>
    </div>
  );
}
