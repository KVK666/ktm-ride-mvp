const assert = require("assert");
const {
  MAX_PROFILE_PHOTO_BYTES,
  normalizeProfilePhotoPayload,
  photoMetadata
} = require("../src/services/profilePhotoValidation");

function expectStatus(fn, status) {
  try {
    fn();
  } catch (error) {
    assert.strictEqual(error.status, status);
    return;
  }
  assert.fail(`Expected status ${status}`);
}

const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64");
const normalized = normalizeProfilePhotoPayload({ mimeType: "IMAGE/JPEG", imageBase64: tinyJpeg });
assert.strictEqual(normalized.mimeType, "image/jpeg");
assert.deepStrictEqual([...normalized.data], [0xff, 0xd8, 0xff, 0xdb]);

expectStatus(() => normalizeProfilePhotoPayload({ mimeType: "image/gif", imageBase64: tinyJpeg }), 400);
expectStatus(() => normalizeProfilePhotoPayload({ mimeType: "image/png", imageBase64: "not base64!" }), 400);
expectStatus(
  () => normalizeProfilePhotoPayload({
    mimeType: "image/png",
    imageBase64: Buffer.alloc(MAX_PROFILE_PHOTO_BYTES + 1).toString("base64")
  }),
  413
);

assert.deepStrictEqual(photoMetadata({ has_profile_photo: true, profile_photo_updated_at: "2026-06-27T00:00:00.000Z" }), {
  hasProfilePhoto: true,
  profilePhotoUpdatedAt: "2026-06-27T00:00:00.000Z"
});

console.log("profilePhotoValidation tests passed");
