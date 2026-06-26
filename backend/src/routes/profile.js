const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { normalizeProfilePhotoPayload, photoMetadata } = require("../services/profilePhotoValidation");

const router = express.Router();

router.get("/photo", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      "select profile_photo_data, profile_photo_mime, profile_photo_updated_at from users where id = $1",
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!user.profile_photo_data || !user.profile_photo_mime) {
      return res.status(404).json({ error: "Profile photo not found" });
    }

    const updatedAt = user.profile_photo_updated_at
      ? new Date(user.profile_photo_updated_at).toUTCString()
      : new Date().toUTCString();

    if (String(req.headers.accept || "").includes("application/json")) {
      return res.json({
        imageBase64: Buffer.from(user.profile_photo_data).toString("base64"),
        mimeType: user.profile_photo_mime,
        updatedAt: user.profile_photo_updated_at
      });
    }

    res.setHeader("Content-Type", user.profile_photo_mime);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Last-Modified", updatedAt);
    return res.send(user.profile_photo_data);
  } catch (error) {
    return next(error);
  }
});

router.put("/photo", requireAuth, async (req, res, next) => {
  try {
    const photo = normalizeProfilePhotoPayload(req.body);
    const result = await db.query(
      `update users
       set profile_photo_data = $1,
           profile_photo_mime = $2,
           profile_photo_updated_at = now()
       where id = $3
       returning profile_photo_data is not null as has_profile_photo, profile_photo_updated_at`,
      [photo.data, photo.mimeType, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(photoMetadata(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.delete("/photo", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `update users
       set profile_photo_data = null,
           profile_photo_mime = null,
           profile_photo_updated_at = null
       where id = $1
       returning profile_photo_data is not null as has_profile_photo, profile_photo_updated_at`,
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(photoMetadata(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
