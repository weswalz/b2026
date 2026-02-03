export type TimeFormatOptions = {
  uppercase?: boolean;
  alwaysShowMinutes?: boolean;
};

export const parseTimeToMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const [hoursRaw, minutesRaw] = value.split(':');
  if (hoursRaw === undefined || minutesRaw === undefined) return null;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return (hours * 60) + minutes;
};

export const formatMinutesToTime = (
  totalMinutes: number,
  { uppercase = false, alwaysShowMinutes = false }: TimeFormatOptions = {}
): string => {
  const normalized = totalMinutes === 1440 ? 0 : totalMinutes;
  if (normalized === 0) {
    const suffix = uppercase ? 'AM' : 'am';
    const minuteLabel = alwaysShowMinutes ? ':00' : '';
    return `12${minuteLabel}${suffix}`;
  }
  const hour24 = Math.floor(normalized / 60) % 24;
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? (uppercase ? 'PM' : 'pm') : (uppercase ? 'AM' : 'am');
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const showMinutes = alwaysShowMinutes || minute !== 0;
  const minuteLabel = showMinutes ? `:${minute.toString().padStart(2, '0')}` : '';
  return `${hour12}${minuteLabel}${suffix}`;
};

export const formatTimeString = (
  value?: string | null,
  options: TimeFormatOptions = {}
): string => {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return '';
  return formatMinutesToTime(minutes, options);
};
