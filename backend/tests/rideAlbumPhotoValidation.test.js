const assert = require("assert");
const {
  MAX_RIDE_PHOTO_BYTES,
  normalizeRidePhotoPayload,
  photoResponse
} = require("../src/services/rideAlbumPhotoValidation");

function expectStatus(fn, status) {
  try {
    fn();
  } catch (error) {
    assert.strictEqual(error.status, status);
    return;
  }
  assert.fail(`Expected status ${status}`);
}

const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
const normalized = normalizeRidePhotoPayload({
  mimeType: "IMAGE/PNG",
  imageBase64: tinyPng,
  fileName: "ride-stop.png",
  createdAt: "2026-06-27T00:00:00.000Z",
  latitude: 11.3,
  longitude: 77.64
});

assert.strictEqual(normalized.mimeType, "image/png");
assert.deepStrictEqual([...normalized.data], [0x89, 0x50, 0x4e, 0x47]);
assert.strictEqual(normalized.fileName, "ride-stop.png");
assert.strictEqual(normalized.hasLocation, true);
assert.strictEqual(normalized.latitude, 11.3);
assert.strictEqual(normalized.longitude, 77.64);

expectStatus(() => normalizeRidePhotoPayload({ mimeType: "image/gif", imageBase64: tinyPng }), 400);
expectStatus(() => normalizeRidePhotoPayload({ mimeType: "image/jpeg", imageBase64: "not base64!" }), 400);
expectStatus(
  () => normalizeRidePhotoPayload({
    mimeType: "image/webp",
    imageBase64: Buffer.alloc(MAX_RIDE_PHOTO_BYTES + 1).toString("base64")
  }),
  413
);

assert.deepStrictEqual(
  photoResponse({
    id: "photo-id",
    ride_id: "ride-id",
    file_name: "photo.jpg",
    mime_type: "image/jpeg",
    image_data: Buffer.from([1, 2, 3]),
    created_at: "2026-06-27T00:00:00.000Z",
    imported_at: "2026-06-27T01:00:00.000Z",
    latitude: "11.3000000",
    longitude: "77.6400000",
    has_location: true
  }, true),
  {
    id: "photo-id",
    rideId: "ride-id",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    imageBase64: "AQID",
    createdAt: "2026-06-27T00:00:00.000Z",
    importedAt: "2026-06-27T01:00:00.000Z",
    latitude: 11.3,
    longitude: 77.64,
    hasLocation: true
  }
);

console.log("rideAlbumPhotoValidation tests passed");
