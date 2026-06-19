import { Coordinate } from "../types";
import { decodePolyline, stripHtml } from "../utils/polyline";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const MAPS_REQUEST_TIMEOUT_MS = 12000;

export type DirectionStep = {
  instruction: string;
  distanceText: string;
  durationText: string;
  start: Coordinate;
  end: Coordinate;
};

export type RouteDetails = {
  coordinates: Coordinate[];
  steps: DirectionStep[];
  distanceText: string;
  durationText: string;
  distanceM: number;
  durationS: number;
};

export async function geocodeDestination(destination: string): Promise<Coordinate> {
  assertMapsConfigured();
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" +
    `address=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}`;
  const body = await fetchMapsJson(url);

  if (body.status !== "OK" || !body.results?.[0]) {
    throw new Error(mapsError(body, "Destination was not found"));
  }

  const location = body.results[0].geometry.location;
  if (!isCoordinate(location.lat, location.lng)) {
    throw new Error("Destination returned invalid coordinates");
  }

  return { latitude: location.lat, longitude: location.lng };
}

export async function fetchRoute(origin: Coordinate, destination: Coordinate): Promise<RouteDetails> {
  assertMapsConfigured();
  if (!isCoordinate(origin.latitude, origin.longitude) || !isCoordinate(destination.latitude, destination.longitude)) {
    throw new Error("Route requires valid start and destination coordinates");
  }

  const url =
    "https://maps.googleapis.com/maps/api/directions/json?" +
    `origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    "&mode=driving" +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const body = await fetchMapsJson(url);

  if (body.status !== "OK" || !body.routes?.[0]) {
    throw new Error(mapsError(body, "Route was not found"));
  }

  const route = body.routes[0];
  const leg = route.legs[0];
  if (!leg || !route.overview_polyline?.points) {
    throw new Error("Route response was incomplete");
  }

  return {
    coordinates: decodePolyline(String(route.overview_polyline.points)),
    distanceText: String(leg.distance?.text || ""),
    durationText: String(leg.duration?.text || ""),
    distanceM: safeNumber(leg.distance?.value),
    durationS: safeNumber(leg.duration?.value),
    steps: Array.isArray(leg.steps) ? leg.steps.map((step: any) => ({
      instruction: stripHtml(String(step.html_instructions || "")),
      distanceText: String(step.distance?.text || ""),
      durationText: String(step.duration?.text || ""),
      start: {
        latitude: safeNumber(step.start_location?.lat),
        longitude: safeNumber(step.start_location?.lng)
      },
      end: {
        latitude: safeNumber(step.end_location?.lat),
        longitude: safeNumber(step.end_location?.lng)
      }
    })) : []
  };
}

function assertMapsConfigured() {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key is not configured");
  }
}

async function fetchMapsJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAPS_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Maps returned an unreadable response");
    }

    if (!response.ok) {
      throw new Error(mapsError(body, "Maps request failed"));
    }

    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Maps request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mapsError(body: any, fallback: string) {
  return String(body?.error_message || body?.status || fallback);
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isCoordinate(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
