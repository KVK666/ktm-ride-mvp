import AsyncStorage from "@react-native-async-storage/async-storage";

const DIAGNOSTICS_KEY = "duke_ride_diagnostics";
const MAX_EVENTS = 60;

export type DiagnosticEvent = {
  id: string;
  level: "info" | "warn" | "error";
  area: string;
  message: string;
  createdAt: string;
  details?: string;
};

export async function logDiagnostic(
  event: Omit<DiagnosticEvent, "id" | "createdAt">
) {
  try {
    const events = await getDiagnostics();
    const next: DiagnosticEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      details: event.details ? event.details.slice(0, 1200) : undefined
    };
    await AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify([next, ...events].slice(0, MAX_EVENTS)));
  } catch {
    // Diagnostics should never break the app flow.
  }
}

export async function getDiagnostics(): Promise<DiagnosticEvent[]> {
  try {
    const stored = await AsyncStorage.getItem(DIAGNOSTICS_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter(isDiagnosticEvent) : [];
  } catch {
    try {
      await AsyncStorage.removeItem(DIAGNOSTICS_KEY);
    } catch {
      // Ignore cleanup failures.
    }
    return [];
  }
}

export async function clearDiagnostics() {
  try {
    await AsyncStorage.removeItem(DIAGNOSTICS_KEY);
  } catch {
    // Diagnostics cleanup should never break the app flow.
  }
}

export function diagnosticDetails(error: unknown) {
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join("\n");
  }
  return String(error || "");
}

export function formatDiagnostics(events: DiagnosticEvent[]) {
  if (!events.length) {
    return "No diagnostics recorded.";
  }

  return events
    .map((event) =>
      [
        `[${event.createdAt}] ${event.level.toUpperCase()} ${event.area}`,
        event.message,
        event.details
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n---\n\n");
}

function isDiagnosticEvent(event: any): event is DiagnosticEvent {
  return (
    event &&
    (event.level === "info" || event.level === "warn" || event.level === "error") &&
    typeof event.area === "string" &&
    typeof event.message === "string" &&
    typeof event.createdAt === "string"
  );
}
