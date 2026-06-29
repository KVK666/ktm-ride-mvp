const bcrypt = require("bcryptjs");
const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const {
  completePasswordReset,
  requestPasswordReset
} = require("../services/passwordReset");
const { photoMetadata } = require("../services/profilePhotoValidation");

const router = express.Router();

function signToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
}

function safeUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    bikeModel: row.bike_model,
    ...photoMetadata(row)
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const bikeModel = String(body.bikeModel || "").trim();

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "Email and 8+ character password are required" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `insert into users (email, password_hash, name, bike_model)
       values ($1, $2, $3, $4)
       returning id, email, name, bike_model, profile_photo_data is not null as has_profile_photo, profile_photo_updated_at`,
      [email, passwordHash, name || "Rider", bikeModel || "Motorcycle"]
    );

    const user = result.rows[0];
    return res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Email is already registered" });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const result = await db.query(
      "select id, email, password_hash, name, bike_model, profile_photo_data is not null as has_profile_photo, profile_photo_updated_at from users where email = $1",
      [email]
    );

    const user = result.rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({ token: signToken(user), user: safeUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const result = await requestPasswordReset({
      db,
      email: req.body?.email
    });
    return res.json(result);
  } catch (error) {
    if (error.configMessage) {
      console.warn("Password reset configuration issue", {
        message: error.configMessage,
        smtpHost: Boolean(process.env.SMTP_HOST),
        smtpFrom: Boolean(process.env.SMTP_FROM),
        resetUrl: Boolean(process.env.PASSWORD_RESET_URL_BASE)
      });
    }
    return next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const result = await completePasswordReset({
      db,
      token: req.body?.token,
      password: req.body?.password,
      hashPassword: (password) => bcrypt.hash(password, 12)
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      "select id, email, name, bike_model, profile_photo_data is not null as has_profile_photo, profile_photo_updated_at from users where id = $1",
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: safeUser(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
