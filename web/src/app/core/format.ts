export function numberValue(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

export function km(meters: unknown) {
  const value = numberValue(meters) / 1000;
  return value >= 100 ? `${value.toFixed(0)} km` : `${value.toFixed(1)} km`;
}

export function kmh(value: unknown) {
  return `${Math.round(numberValue(value))} km/h`;
}

export function duration(seconds: unknown) {
  const totalMinutes = Math.max(0, Math.round(numberValue(seconds) / 60));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function dateLabel(value?: string) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    return 'Unknown date';
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function bucketLabel(value: string, bucket: 'daily' | 'monthly' | 'yearly') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '--';
  }
  if (bucket === 'yearly') {
    return String(date.getFullYear());
  }
  if (bucket === 'monthly') {
    return date.toLocaleDateString(undefined, { month: 'short' });
  }
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
