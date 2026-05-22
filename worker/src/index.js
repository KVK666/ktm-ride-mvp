import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Jwt } from "hono/utils/jwt";
import { summarizeRide } from "./rideMath.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  })
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    ready: hasRequiredConfig(c.env),
    service: "duke-ride-worker",
    config: {
      databaseUrl: Boolean(c.env.DATABASE_URL),
      jwtSecret: Boolean(c.env.JWT_SECRET)
    }
  })
);

app.post("/api/auth/register", async (c) => {
  const sql = db(c.env);
  const body = await readJson(c);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || password.length < 8) {
    return c.json({ error: "Email and 8+ character password are required" }, 400);
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql(
      `insert into users (email, password_hash, name, bike_model)
       values ($1, $2, $3, $4)
       returning id, email, name, bike_model`,
      [email, passwordHash, body.name || "Rider", body.bikeModel || "KTM Duke 250 Gen 3"]
    );

    const user = safeUser(rows[0]);
    return c.json({ token: await signToken(c.env, user), user }, 201);
  } catch (error) {
    if (error?.code === "23505" || String(error?.message || "").includes("duplicate key")) {
      return c.json({ error: "Email is already registered" }, 409);
    }
    throw error;
  }
});

app.post("/api/auth/login", async (c) => {
  const sql = db(c.env);
  const body = await readJson(c);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const rows = await sql(
    "select id, email, password_hash, name, bike_model from users where email = $1",
    [email]
  );

  const row = rows[0];
  const valid = row ? await bcrypt.compare(password, row.password_hash) : false;
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const user = safeUser(row);
  return c.json({ token: await signToken(c.env, user), user });
});

app.get("/api/auth/me", authRequired, async (c) => {
  const rows = await db(c.env)(
    "select id, email, name, bike_model from users where id = $1",
    [c.get("user").id]
  );

  if (!rows[0]) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: safeUser(rows[0]) });
});

app.get("/api/rides", authRequired, async (c) => {
  const period = c.req.query("period") || "all";
  const filters = ["r.user_id = $1"];
  const params = [c.get("user").id];

  if (period === "today") {
    filters.push("r.started_at >= date_trunc('day', now())");
  } else if (period === "month") {
    filters.push("r.started_at >= date_trunc('month', now())");
  } else if (period === "year") {
    filters.push("r.started_at >= date_trunc('year', now())");
  }

  const rows = await db(c.env)(
    `${rideSelect()} where ${filters.join(" and ")} order by r.started_at desc limit 100`,
    params
  );

  return c.json({ rides: rows });
});

app.get("/api/rides/:id/duplicates", authRequired, async (c) => {
  const sql = db(c.env);
  const rows = await sql(
    `with source_ride as (
       select *
       from rides
       where id = $2 and user_id = $1
     )
     ${rideSelect()}
     join source_ride source on
       r.user_id = source.user_id
       and r.id <> source.id
       and r.started_at = source.started_at
       and r.ended_at = source.ended_at
       and r.distance_m = source.distance_m
       and r.duration_s = source.duration_s
       and r.start_latitude = source.start_latitude
       and r.start_longitude = source.start_longitude
       and r.end_latitude = source.end_latitude
       and r.end_longitude = source.end_longitude
     order by r.created_at asc, r.id asc`,
    [c.get("user").id, c.req.param("id")]
  );

  const sourceRows = await sql(
    "select id from rides where id = $1 and user_id = $2",
    [c.req.param("id"), c.get("user").id]
  );
  if (!sourceRows[0]) {
    return c.json({ error: "Ride not found" }, 404);
  }

  return c.json({ duplicates: rows });
});

app.get("/api/rides/:id", authRequired, async (c) => {
  const sql = db(c.env);
  const rideRows = await sql(
    `${rideSelect()} where r.user_id = $1 and r.id = $2`,
    [c.get("user").id, c.req.param("id")]
  );
  const ride = rideRows[0];

  if (!ride) {
    return c.json({ error: "Ride not found" }, 404);
  }

  const points = await sql(
    `select latitude, longitude, altitude_m as "altitudeM", accuracy_m as "accuracyM", speed_kmh as "speedKmh",
            recorded_at as "recordedAt"
     from ride_points
     where ride_id = $1
     order by recorded_at asc`,
    [ride.id]
  );

  return c.json({ ride: { ...ride, points } });
});

app.patch("/api/rides/:id", authRequired, async (c) => {
  const body = await readJson(c);
  const title = normalizeOptionalText(body.title, 120);
  const notes = normalizeOptionalText(body.notes, 2000);
  const markReviewed = Boolean(body.markReviewed);

  const rows = await db(c.env)(
    `update rides
     set title = $3,
         notes = $4,
         reviewed_at = case
           when $5 then coalesce(reviewed_at, now())
           else reviewed_at
         end
     where id = $2 and user_id = $1
     returning id, title, notes, reviewed_at as "reviewedAt"`,
    [c.get("user").id, c.req.param("id"), title, notes, markReviewed]
  );

  if (!rows[0]) {
    return c.json({ error: "Ride not found" }, 404);
  }

  return c.json({ ride: rows[0] });
});

app.post("/api/rides", authRequired, async (c) => {
  const body = await readJson(c);
  const { startLabel, endLabel, clientRideId, startedAt, endedAt, points = [] } = body;
  const rideClientId = clientRideId || c.req.header("Idempotency-Key") || null;

  if (!startedAt || !endedAt || !Array.isArray(points) || points.length < 2) {
    return c.json({ error: "Ride requires start time, end time, and at least 2 points" }, 400);
  }

  const normalizedPoints = points.map((point) => ({
    latitude: Number(point.latitude),
    longitude: Number(point.longitude),
    altitudeM: point.altitudeM == null ? null : Number(point.altitudeM),
    accuracyM: point.accuracyM == null ? null : Number(point.accuracyM),
    speedKmh: point.speedKmh == null ? null : Number(point.speedKmh),
    recordedAt: point.recordedAt
  }));

  if (normalizedPoints.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) {
    return c.json({ error: "Ride points must include valid latitude and longitude" }, 400);
  }

  const summary = summarizeRide(normalizedPoints, startedAt, endedAt);
  const start = normalizedPoints[0];
  const end = normalizedPoints[normalizedPoints.length - 1];
  const sql = db(c.env);
  const params = [
    c.get("user").id,
    startLabel || "Start point",
    endLabel || "End point",
    start.latitude,
    start.longitude,
    end.latitude,
    end.longitude,
    summary.distanceM,
    summary.durationS,
    summary.topSpeedKmh,
    summary.avgSpeedKmh,
    rideClientId,
    startedAt,
    endedAt,
    JSON.stringify(
      normalizedPoints.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        altitude_m: point.altitudeM,
        accuracy_m: point.accuracyM,
        speed_kmh: point.speedKmh,
        recorded_at: point.recordedAt
      }))
    )
  ];
  const rows = await sql(
    `with existing_ride as (
       select id, distance_m, duration_s, top_speed_kmh, avg_speed_kmh
       from rides
       where user_id = $1 and client_ride_id = $12
     ),
     new_ride as (
       insert into rides (
         user_id, start_label, end_label, start_latitude, start_longitude,
         end_latitude, end_longitude, distance_m, duration_s,
         top_speed_kmh, avg_speed_kmh, client_ride_id, started_at, ended_at
       )
       select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
       where not exists (select 1 from existing_ride)
       on conflict (user_id, client_ride_id) where client_ride_id is not null do nothing
       returning id, distance_m, duration_s, top_speed_kmh, avg_speed_kmh
     ),
     inserted_points as (
       insert into ride_points (ride_id, latitude, longitude, altitude_m, accuracy_m, speed_kmh, recorded_at)
       select new_ride.id, point.latitude, point.longitude, point.altitude_m, point.accuracy_m, point.speed_kmh, point.recorded_at
       from new_ride,
       jsonb_to_recordset($15::jsonb) as point(
         latitude numeric,
         longitude numeric,
         altitude_m numeric,
         accuracy_m numeric,
         speed_kmh numeric,
         recorded_at timestamptz
       )
     )
     select id, false as duplicate, distance_m, duration_s, top_speed_kmh, avg_speed_kmh from new_ride
     union all
     select id, true as duplicate, distance_m, duration_s, top_speed_kmh, avg_speed_kmh from existing_ride
     limit 1`,
    params
  );

  if (!rows[0] && rideClientId) {
    const existingRows = await sql(
      `select id, distance_m, duration_s, top_speed_kmh, avg_speed_kmh
       from rides
       where user_id = $1 and client_ride_id = $2`,
      [c.get("user").id, rideClientId]
    );
    if (existingRows[0]) {
      return c.json(rideResponse(existingRows[0], true));
    }
  }

  if (!rows[0]) {
    throw new Error("Ride insert did not return a row");
  }

  return c.json(rideResponse(rows[0], rows[0].duplicate), rows[0].duplicate ? 200 : 201);
});

app.delete("/api/rides/:id", authRequired, async (c) => {
  const rows = await db(c.env)(
    "delete from rides where id = $1 and user_id = $2 returning id",
    [c.req.param("id"), c.get("user").id]
  );

  if (!rows[0]) {
    return c.json({ error: "Ride not found" }, 404);
  }

  return c.body(null, 204);
});

app.get("/api/dashboard", authRequired, async (c) => {
  const sql = db(c.env);
  const statsRows = await sql(
    `select
       coalesce(sum(distance_m) filter (where started_at >= date_trunc('day', now())), 0) as today_distance_m,
       coalesce(sum(distance_m) filter (where started_at >= date_trunc('month', now())), 0) as month_distance_m,
       coalesce(sum(distance_m) filter (where started_at >= date_trunc('year', now())), 0) as year_distance_m,
       count(*)::int as total_rides,
       count(*) filter (where reviewed_at is null)::int as unreviewed_rides,
       coalesce(max(top_speed_kmh), 0) as best_top_speed_kmh,
       coalesce(avg(avg_speed_kmh), 0) as average_speed_kmh
     from rides
     where user_id = $1`,
    [c.get("user").id]
  );

  const recentRides = await sql(
    `select id, start_label as "startLabel", end_label as "endLabel",
            title, notes, reviewed_at as "reviewedAt",
            distance_m as "distanceM", duration_s as "durationS",
            top_speed_kmh as "topSpeedKmh", avg_speed_kmh as "avgSpeedKmh",
            started_at as "startedAt", ended_at as "endedAt", created_at as "createdAt"
     from rides
     where user_id = $1
     order by started_at desc
     limit 5`,
    [c.get("user").id]
  );

  const row = statsRows[0];
  return c.json({
    stats: {
      todayDistanceM: Number(row.today_distance_m),
      monthDistanceM: Number(row.month_distance_m),
      yearDistanceM: Number(row.year_distance_m),
      totalRides: row.total_rides,
      unreviewedRides: row.unreviewed_rides,
      bestTopSpeedKmh: Number(row.best_top_speed_kmh),
      averageSpeedKmh: Number(row.average_speed_kmh)
    },
    recentRides
  });
});

app.get("/api/analytics/distance", authRequired, async (c) => {
  const buckets = { daily: "day", monthly: "month", yearly: "year" };
  const bucket = buckets[c.req.query("bucket")] || "day";
  const rows = await db(c.env)(
    `select *
     from (
       select date_trunc($2, started_at) as bucket,
              coalesce(sum(distance_m), 0) as distance_m,
              count(*)::int as ride_count,
              coalesce(sum(duration_s), 0) as duration_s,
              coalesce(max(top_speed_kmh), 0) as top_speed_kmh,
              coalesce(avg(nullif(avg_speed_kmh, 0)), 0) as avg_speed_kmh
       from rides
       where user_id = $1
       group by 1
       order by 1 desc
       limit 60
     ) recent
     order by bucket asc`,
    [c.get("user").id, bucket]
  );

  return c.json({
    points: rows.map((row) => ({
      bucket: row.bucket,
      distanceM: Number(row.distance_m),
      rideCount: row.ride_count,
      durationS: Number(row.duration_s),
      topSpeedKmh: Number(row.top_speed_kmh),
      avgSpeedKmh: Number(row.avg_speed_kmh)
    }))
  });
});

app.get("/api/analytics/speed/:rideId", authRequired, async (c) => {
  const sql = db(c.env);
  const rideRows = await sql(
    "select id from rides where id = $1 and user_id = $2",
    [c.req.param("rideId"), c.get("user").id]
  );
  if (!rideRows[0]) {
    return c.json({ error: "Ride not found" }, 404);
  }

  const points = await sql(
    `select speed_kmh as "speedKmh", recorded_at as "recordedAt"
     from ride_points
     where ride_id = $1
     order by recorded_at asc`,
    [c.req.param("rideId")]
  );

  return c.json({ points });
});

app.get("/api/reports", authRequired, async (c) => {
  const period = c.req.query("period") || "month";
  const grain = period === "year" ? "year" : period === "day" ? "day" : "month";
  const rawDate = c.req.query("date");
  const anchor = rawDate ? new Date(rawDate) : new Date();
  const anchorIso = Number.isNaN(anchor.getTime()) ? new Date().toISOString() : anchor.toISOString();
  const sql = db(c.env);

  const rows = await sql(
    `select
       count(*)::int as ride_count,
       coalesce(sum(distance_m), 0) as distance_m,
       coalesce(sum(duration_s), 0) as duration_s,
       coalesce(avg(avg_speed_kmh), 0) as avg_speed_kmh,
       coalesce(max(top_speed_kmh), 0) as top_speed_kmh
     from rides
     where user_id = $1
       and started_at >= date_trunc($2, $3::timestamptz)
       and started_at < date_trunc($2, $3::timestamptz) + ('1 ' || $2)::interval`,
    [c.get("user").id, grain, anchorIso]
  );

  const routes = await sql(
    `select start_label as "from", end_label as "to", distance_m as "distanceM",
            duration_s as "durationS", top_speed_kmh as "topSpeedKmh",
            started_at as "startedAt"
     from rides
     where user_id = $1
       and started_at >= date_trunc($2, $3::timestamptz)
       and started_at < date_trunc($2, $3::timestamptz) + ('1 ' || $2)::interval
     order by started_at asc`,
    [c.get("user").id, grain, anchorIso]
  );

  const row = rows[0];
  return c.json({
    period,
    generatedAt: new Date().toISOString(),
    summary: {
      rideCount: row.ride_count,
      distanceM: Number(row.distance_m),
      durationS: Number(row.duration_s),
      averageSpeedKmh: Number(row.avg_speed_kmh),
      topSpeedKmh: Number(row.top_speed_kmh)
    },
    routes
  });
});

app.notFound((c) => c.json({ error: `Route not found: ${c.req.method} ${new URL(c.req.url).pathname}` }, 404));

app.onError((error, c) => {
  const requestId = crypto.randomUUID();
  const path = new URL(c.req.url).pathname;
  console.error({
    requestId,
    method: c.req.method,
    path,
    message: error?.message || String(error),
    stack: error?.stack
  });
  if (error instanceof ConfigError) {
    return c.json({ error: error.message }, 503);
  }
  return c.json(
    {
      error: `Server error on ${c.req.method} ${path}`,
      requestId
    },
    500
  );
});

function db(env) {
  if (!env.DATABASE_URL) {
    throw new ConfigError("DATABASE_URL is not configured");
  }
  return neon(env.DATABASE_URL);
}

function hasRequiredConfig(env) {
  return Boolean(env.DATABASE_URL && env.JWT_SECRET);
}

function jwtSecret(env) {
  if (!env.JWT_SECRET) {
    throw new ConfigError("JWT_SECRET is not configured");
  }
  return env.JWT_SECRET;
}

class ConfigError extends Error {}

function normalizeOptionalText(value, maxLength) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

async function authRequired(c, next) {
  const header = c.req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return c.json({ error: "Missing authorization token" }, 401);
  }

  try {
    c.set("user", await Jwt.verify(token, jwtSecret(c.env), "HS256"));
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  return next();
}

async function signToken(env, user) {
  const now = Math.floor(Date.now() / 1000);
  const expiresInSeconds = Number(env.JWT_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 30);
  return Jwt.sign(
    {
      id: user.id,
      email: user.email,
      iat: now,
      exp: now + expiresInSeconds
    },
    jwtSecret(env),
    "HS256"
  );
}

function safeUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    bikeModel: row.bike_model
  };
}

function rideResponse(row, duplicate) {
  return {
    rideId: row.id,
    duplicate,
    summary: {
      distanceM: Number(row.distance_m),
      durationS: Number(row.duration_s),
      topSpeedKmh: Number(row.top_speed_kmh),
      avgSpeedKmh: Number(row.avg_speed_kmh)
    }
  };
}

function rideSelect() {
  return `
    select
      r.id,
      r.start_label as "startLabel",
      r.end_label as "endLabel",
      r.start_latitude as "startLatitude",
      r.start_longitude as "startLongitude",
      r.end_latitude as "endLatitude",
      r.end_longitude as "endLongitude",
      r.distance_m as "distanceM",
      r.duration_s as "durationS",
      r.top_speed_kmh as "topSpeedKmh",
      r.avg_speed_kmh as "avgSpeedKmh",
      r.title,
      r.notes,
      r.reviewed_at as "reviewedAt",
      r.started_at as "startedAt",
      r.ended_at as "endedAt",
      r.created_at as "createdAt"
    from rides r
  `;
}

export default app;
