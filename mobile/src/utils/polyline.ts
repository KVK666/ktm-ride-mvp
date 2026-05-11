import { Coordinate } from "../types";

export function decodePolyline(encoded: string): Coordinate[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: Coordinate[] = [];

  while (index < encoded.length) {
    const latResult = decodeChunk(encoded, index);
    index = latResult.index;
    lat += latResult.value;

    const lngResult = decodeChunk(encoded, index);
    index = lngResult.index;
    lng += lngResult.value;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5
    });
  }

  return coordinates;
}

function decodeChunk(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;

  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    index
  };
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
}
