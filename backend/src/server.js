require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const db = require("./config/db");

const authRoutes = require("./routes/auth");
const rideRoutes = require("./routes/rides");
const dashboardRoutes = require("./routes/dashboard");
const analyticsRoutes = require("./routes/analytics");
const reportRoutes = require("./routes/reports");
const journalRoutes = require("./routes/journal");
const profileRoutes = require("./routes/profile");
const homeRoutes = require("./routes/home");
const { passwordResetConfigStatus } = require("./services/passwordReset");

const app = express();
const port = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: corsOrigin() }));
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ktm-ride-backend",
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "local",
    config: {
      passwordReset: passwordResetConfigStatus()
    }
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/profile", profileRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message || "Request failed" });
  }
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body must be valid JSON" });
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large" });
  }

  console.error(error);
  return res.status(500).json({ error: "Unexpected server error" });
});

async function start() {
  await ensureAdditiveSchema();
  app.listen(port, () => {
    console.log(`RidePulse backend listening on port ${port}`);
  });
}

async function ensureAdditiveSchema() {
  await db.query("alter table users add column if not exists profile_photo_data bytea");
  await db.query("alter table users add column if not exists profile_photo_mime text");
  await db.query("alter table users add column if not exists profile_photo_updated_at timestamptz");
  await db.query(`
    create table if not exists password_reset_tokens (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await db.query("create index if not exists password_reset_tokens_user_idx on password_reset_tokens(user_id, created_at desc)");
  await db.query("create index if not exists password_reset_tokens_expires_idx on password_reset_tokens(expires_at)");
  await db.query(`
    create table if not exists ride_album_photos (
      id uuid primary key default uuid_generate_v4(),
      ride_id uuid not null references rides(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      image_data bytea not null,
      mime_type text not null,
      file_name text,
      created_at timestamptz not null default now(),
      imported_at timestamptz not null default now(),
      latitude numeric(10, 7),
      longitude numeric(10, 7),
      has_location boolean not null default false
    )
  `);
  await db.query("create index if not exists ride_album_photos_ride_imported_idx on ride_album_photos(ride_id, imported_at desc)");
  await db.query("create index if not exists ride_album_photos_user_idx on ride_album_photos(user_id, imported_at desc)");
}

start().catch((error) => {
  console.error("RidePulse backend failed to start", error);
  process.exit(1);
});

function corsOrigin() {
  const value = process.env.CORS_ORIGIN || "*";
  if (value === "*") {
    return "*";
  }
  const allowed = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  return (origin, callback) => {
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  };
}
