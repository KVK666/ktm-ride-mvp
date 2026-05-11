import { Coordinate } from "../types";
import { decodePolyline, stripHtml } from "../utils/polyline";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

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
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?" +
    `address=${encodeURIComponent(destination)}&key=${GOOGLE_MAPS_API_KEY}`;
  const response = await fetch(url);
  const body = await response.json();

  if (body.status !== "OK" || !body.results?.[0]) {
    throw new Error("Destination was not found");
  }

  const location = body.results[0].geometry.location;
  return { latitude: location.lat, longitude: location.lng };
}

export async function fetchRoute(origin: Coordinate, destination: Coordinate): Promise<RouteDetails> {
  const url =
    "https://maps.googleapis.com/maps/api/directions/json?" +
    `origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}` +
    "&mode=driving" +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const response = await fetch(url);
  const body = await response.json();

  if (body.status !== "OK" || !body.routes?.[0]) {
    throw new Error("Route was not found");
  }

  const route = body.routes[0];
  const leg = route.legs[0];

  return {
    coordinates: decodePolyline(route.overview_polyline.points),
    distanceText: leg.distance.text,
    durationText: leg.duration.text,
    distanceM: leg.distance.value,
    durationS: leg.duration.value,
    steps: leg.steps.map((step: any) => ({
      instruction: stripHtml(step.html_instructions),
      distanceText: step.distance.text,
      durationText: step.duration.text,
      start: {
        latitude: step.start_location.lat,
        longitude: step.start_location.lng
      },
      end: {
        latitude: step.end_location.lat,
        longitude: step.end_location.lng
      }
    }))
  };
}
