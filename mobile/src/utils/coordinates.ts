import { Coordinate } from "../types";

type CoordinateInput = {
  latitude?: unknown;
  longitude?: unknown;
};

export type RouteDrawing = {
  path: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type RouteViewport = {
  left: number;
  bottom: number;
  width: number;
  height: number;
};

export function hasFiniteCoordinateValues(value?: CoordinateInput | null) {
  return coordinateNumber(value?.latitude) != null && coordinateNumber(value?.longitude) != null;
}

export function hasBoundedCoordinateValues(value?: CoordinateInput | null) {
  const latitude = coordinateNumber(value?.latitude);
  const longitude = coordinateNumber(value?.longitude);
  return latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

export function normalizeFiniteCoordinate(value?: CoordinateInput | null): Coordinate | null {
  const latitude = coordinateNumber(value?.latitude);
  const longitude = coordinateNumber(value?.longitude);
  return latitude == null || longitude == null ? null : { latitude, longitude };
}

export function normalizeFiniteCoordinates(values: readonly CoordinateInput[]) {
  return values
    .map(normalizeFiniteCoordinate)
    .filter((coordinate): coordinate is Coordinate => coordinate != null);
}

export function normalizeBoundedCoordinate(value?: CoordinateInput | null): Coordinate | null {
  const latitude = coordinateNumber(value?.latitude);
  const longitude = coordinateNumber(value?.longitude);
  if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

export function normalizeBoundedCoordinates(values: readonly CoordinateInput[]) {
  return values
    .map(normalizeBoundedCoordinate)
    .filter((coordinate): coordinate is Coordinate => coordinate != null);
}

export function sampleEvenly<T>(values: readonly T[], maxItems: number) {
  if (maxItems <= 1) {
    return values.slice(0, 1);
  }
  if (values.length <= maxItems) {
    return values.slice();
  }

  const sampled: T[] = [];
  const step = (values.length - 1) / (maxItems - 1);
  for (let index = 0; index < maxItems; index += 1) {
    sampled.push(values[Math.round(index * step)]);
  }
  return sampled;
}

export function buildRouteDrawing(route: readonly Coordinate[], viewport: RouteViewport): RouteDrawing {
  const latitudes = route.map((point) => point.latitude);
  const longitudes = route.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeSpan = Math.max(maxLatitude - minLatitude, 0.00001);
  const longitudeSpan = Math.max(maxLongitude - minLongitude, 0.00001);
  const points = route.map((point) => ({
    x: viewport.left + ((point.longitude - minLongitude) / longitudeSpan) * viewport.width,
    y: viewport.bottom - ((point.latitude - minLatitude) / latitudeSpan) * viewport.height
  }));

  return {
    path: points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
    start: points[0],
    end: points[points.length - 1]
  };
}

function coordinateNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
