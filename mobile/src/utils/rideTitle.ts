import type { Ride } from "../types";
import { shortDate } from "./format";

export function rideDisplayTitle(ride?: Partial<Ride> | null) {
  if (!ride) return "Ride";
  const candidates = [ride.title, ride.aiTitle, ride.smartTitle, meaningfulRouteLabel(ride)];
  const selected = candidates.find((value) => typeof value === "string" && value.trim());
  return selected?.trim() || `${shortDate(ride.startedAt || new Date().toISOString())} ride`;
}

function meaningfulRouteLabel(ride: Partial<Ride>) {
  const start = cleanPlace(ride.startLabel);
  const end = cleanPlace(ride.endLabel);
  if (start && end && start.toLowerCase() !== end.toLowerCase()) return `${start} to ${end}`;
  return start || end || "";
}

function cleanPlace(value?: string | null) {
  const label = value?.trim() || "";
  if (!label || /^(start|end|start point|end point|unknown|current location)$/i.test(label)) return "";
  if (/^-?\d{1,3}\.\d{3,},\s*-?\d{1,3}\.\d{3,}/.test(label)) return "";
  return label;
}
