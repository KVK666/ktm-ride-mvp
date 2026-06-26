const MAX_PROFILE_PHOTO_BYTES = 768 * 1024;
const ALLOWED_PROFILE_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeProfilePhotoPayload(body) {
  const mimeType = String(body?.mimeType || "").trim().toLowerCase();
  const imageBase64 = String(body?.imageBase64 || "").trim();

  if (!ALLOWED_PROFILE_PHOTO_MIME_TYPES.has(mimeType)) {
    const error = new Error("Profile photo must be a JPEG, PNG, or WebP image");
    error.status = 400;
    throw error;
  }

  if (!imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    const error = new Error("Profile photo data is missing or invalid");
    error.status = 400;
    throw error;
  }

  const data = Buffer.from(imageBase64, "base64");
  if (!data.length || data.toString("base64").replace(/=+$/, "") !== imageBase64.replace(/=+$/, "")) {
    const error = new Error("Profile photo data is malformed");
    error.status = 400;
    throw error;
  }

  if (data.length > MAX_PROFILE_PHOTO_BYTES) {
    const error = new Error("Profile photo is too large. Choose a smaller image.");
    error.status = 413;
    throw error;
  }

  return { data, mimeType };
}

function photoMetadata(row) {
  return {
    hasProfilePhoto: Boolean(row?.profile_photo_data || row?.has_profile_photo),
    profilePhotoUpdatedAt: row?.profile_photo_updated_at || null
  };
}

module.exports = {
  ALLOWED_PROFILE_PHOTO_MIME_TYPES,
  MAX_PROFILE_PHOTO_BYTES,
  normalizeProfilePhotoPayload,
  photoMetadata
};
