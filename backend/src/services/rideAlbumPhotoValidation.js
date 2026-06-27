const ALLOWED_RIDE_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RIDE_PHOTO_BYTES = 3 * 1024 * 1024;

function normalizeRidePhotoPayload(body = {}) {
  const mimeType = String(body?.mimeType || "").trim().toLowerCase();
  const imageBase64 = String(body?.imageBase64 || "").trim();

  if (!ALLOWED_RIDE_PHOTO_MIME_TYPES.has(mimeType)) {
    const error = new Error("Ride photo must be a JPEG, PNG, or WEBP image");
    error.status = 400;
    throw error;
  }

  if (!imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    const error = new Error("Ride photo must include valid base64 image data");
    error.status = 400;
    throw error;
  }

  const data = Buffer.from(imageBase64, "base64");
  if (!data.length || data.toString("base64").replace(/=+$/, "") !== imageBase64.replace(/=+$/, "")) {
    const error = new Error("Ride photo must include valid base64 image data");
    error.status = 400;
    throw error;
  }

  if (data.length > MAX_RIDE_PHOTO_BYTES) {
    const error = new Error("Ride photo is too large. Choose an image under 3 MB.");
    error.status = 413;
    throw error;
  }

  const latitude = optionalCoordinate(body?.latitude, 90);
  const longitude = optionalCoordinate(body?.longitude, 180);
  const hasLocation = latitude != null && longitude != null;

  return {
    data,
    mimeType,
    fileName: normalizeOptionalText(body?.fileName, 180),
    createdAt: normalizeDate(body?.createdAt) || new Date().toISOString(),
    importedAt: new Date().toISOString(),
    latitude: hasLocation ? latitude : null,
    longitude: hasLocation ? longitude : null,
    hasLocation
  };
}

function photoResponse(row, includeData = false) {
  const response = {
    id: row.id,
    rideId: row.ride_id || row.rideId,
    fileName: row.file_name || row.fileName || null,
    mimeType: row.mime_type || row.mimeType,
    createdAt: row.created_at || row.createdAt,
    importedAt: row.imported_at || row.importedAt,
    latitude: row.latitude == null ? 0 : Number(row.latitude),
    longitude: row.longitude == null ? 0 : Number(row.longitude),
    hasLocation: Boolean(row.has_location || row.hasLocation)
  };

  if (includeData) {
    response.imageBase64 = Buffer.from(row.image_data || row.imageData || []).toString("base64");
  }

  return response;
}

function normalizeOptionalText(value, maxLength) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeDate(value) {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function optionalCoordinate(value, limit) {
  if (value == null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

module.exports = {
  ALLOWED_RIDE_PHOTO_MIME_TYPES,
  MAX_RIDE_PHOTO_BYTES,
  normalizeRidePhotoPayload,
  photoResponse
};
