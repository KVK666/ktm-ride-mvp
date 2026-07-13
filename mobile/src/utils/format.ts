import { finiteNumberOrZero } from "./normalize";

export function km(meters: number) {
  const safeMeters = finiteNumberOrZero(meters);
  return `${(safeMeters / 1000).toFixed(safeMeters >= 10000 ? 0 : 1)} km`;
}

export function kmh(value: number) {
  return `${Math.round(finiteNumberOrZero(value))} km/h`;
}

export function duration(seconds: number) {
  const safeSeconds = Math.max(0, finiteNumberOrZero(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function shortDate(value: string) {
  const date = safeDate(value);
  if (!date) {
    return "--";
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short"
  });
}

export function time(value: string) {
  const date = safeDate(value);
  if (!date) {
    return "--";
  }

  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}
