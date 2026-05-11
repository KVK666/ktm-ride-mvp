export function km(meters: number) {
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
}

export function kmh(value: number) {
  return `${Math.round(value)} km/h`;
}

export function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function shortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short"
  });
}

export function time(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}
