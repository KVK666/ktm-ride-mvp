const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { summarizeRide } = require("../services/rideMath");
const { attachRoutePreviews } = require("../services/routePreviews");

const router = express.Router();
router.use(requireAuth);

const MAX_RIDE_POINTS = 12000;

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

router.get("/", async (req, res, next) => {
  try {
    const period = req.query.period || "all";
    const filters = ["r.user_id = $1"];
    const params = [req.user.id];

    if (period === "today") {
      filters.push("r.started_at >= date_trunc('day', now())");
    } else if (period === "month") {
      filters.push("r.started_at >= date_trunc('month', now())");
    } else if (period === "year") {
      filters.push("r.started_at >= date_trunc('year', now())");
    }

    const result = await db.query(
      `${rideSelect()} where ${filters.join(" and ")} order by r.started_at desc limit 100`,
      params
    );

    return res.json({ rides: await attachRoutePreviews(db, result.rows) });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/duplicates", async (req, res, next) => {
  try {
    const sourceResult = await db.query(
      "select id from rides where id = $1 and user_id = $2",
      [req.params.id, req.user.id]
    );
    if (!sourceResult.rows[0]) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const result = await db.query(
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
      [req.user.id, req.params.id]
    );

    return res.json({ duplicates: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const rideResult = await db.query(
      `${rideSelect()} where r.user_id = $1 and r.id = $2`,
      [req.user.id, req.params.id]
    );
    const ride = rideResult.rows[0];

    if (!ride) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const pointResult = await db.query(
      `select latitude, longitude, altitude_m as "altitudeM", accuracy_m as "accuracyM", speed_kmh as "speedKmh",
              recorded_at as "recordedAt"
       from ride_points
       where ride_id = $1
       order by recorded_at asc`,
      [ride.id]
    );

    return res.json({ ride: { ...ride, points: pointResult.rows } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const title = normalizeOptionalText(req.body.title, 120);
    const notes = normalizeOptionalText(req.body.notes, 2000);
    const markReviewed = Boolean(req.body.markReviewed);

    const result = await db.query(
      `update rides
       set title = $3,
           notes = $4,
           reviewed_at = case
             when $5 then coalesce(reviewed_at, now())
             else reviewed_at
           end
       where id = $2 and user_id = $1
       returning id, title, notes, reviewed_at as "reviewedAt"`,
      [req.user.id, req.params.id, title, notes, markReviewed]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Ride not found" });
    }

    return res.json({ ride: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const client = await db.getClient();

  try {
    const {
      startLabel,
      endLabel,
      clientRideId,
      startedAt,
      endedAt,
      points = []
    } = req.body;
    const rideClientId = normalizeOptionalText(clientRideId || req.get("Idempotency-Key"), 300);

    if (!isValidDate(startedAt) || !isValidDate(endedAt) || !Array.isArray(points) || points.length < 2) {
      return res.status(400).json({ error: "Ride requires start time, end time, and at least 2 points" });
    }

    if (points.length > MAX_RIDE_POINTS) {
      return res.status(413).json({ error: `Ride cannot contain more than ${MAX_RIDE_POINTS} points` });
    }

    const normalizedPoints = points.map(normalizeRidePoint);
    if (normalizedPoints.some((point) => !point)) {
      return res.status(400).json({ error: "Ride points must include valid coordinates and timestamps" });
    }

    const summary = summarizeRide(normalizedPoints, startedAt, endedAt);
    const start = normalizedPoints[0];
    const end = normalizedPoints[normalizedPoints.length - 1];

    await client.query("begin");
    if (rideClientId) {
      const existing = await client.query(
        `select id, distance_m, duration_s, top_speed_kmh, avg_speed_kmh
         from rides
         where user_id = $1 and client_ride_id = $2`,
        [req.user.id, rideClientId]
      );
      if (existing.rows[0]) {
        await client.query("commit");
        const row = existing.rows[0];
        return res.json({
          rideId: row.id,
          duplicate: true,
          summary: {
            distanceM: Number(row.distance_m),
            durationS: Number(row.duration_s),
            topSpeedKmh: Number(row.top_speed_kmh),
            avgSpeedKmh: Number(row.avg_speed_kmh)
          }
        });
      }
    }

    const rideResult = await client.query(
      `insert into rides (
         user_id, start_label, end_label, start_latitude, start_longitude,
         end_latitude, end_longitude, distance_m, duration_s,
         top_speed_kmh, avg_speed_kmh, client_ride_id, started_at, ended_at
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id`,
      [
        req.user.id,
        normalizeOptionalText(startLabel, 180) || "Start point",
        normalizeOptionalText(endLabel, 180) || "End point",
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
        endedAt
      ]
    );

    const rideId = rideResult.rows[0].id;
    for (const point of normalizedPoints) {
      await client.query(
        `insert into ride_points (ride_id, latitude, longitude, altitude_m, accuracy_m, speed_kmh, recorded_at)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [rideId, point.latitude, point.longitude, point.altitudeM, point.accuracyM, point.speedKmh, point.recordedAt]
      );
    }

    await client.query("commit");
    return res.status(201).json({ rideId, summary });
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505" && (req.body.clientRideId || req.get("Idempotency-Key"))) {
      try {
        const existing = await db.query(
          `select id, distance_m, duration_s, top_speed_kmh, avg_speed_kmh
           from rides
           where user_id = $1 and client_ride_id = $2`,
          [req.user.id, req.body.clientRideId || req.get("Idempotency-Key")]
        );
        const row = existing.rows[0];
        if (row) {
          return res.json({
            rideId: row.id,
            duplicate: true,
            summary: {
              distanceM: Number(row.distance_m),
              durationS: Number(row.duration_s),
              topSpeedKmh: Number(row.top_speed_kmh),
              avgSpeedKmh: Number(row.avg_speed_kmh)
            }
          });
        }
      } catch {
        // Fall through to normal error handling below.
      }
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await db.query(
      "delete from rides where id = $1 and user_id = $2 returning id",
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Ride not found" });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

function normalizeOptionalText(value, maxLength) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeRidePoint(point) {
  const latitude = Number(point?.latitude);
  const longitude = Number(point?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }

  if (!isValidDate(point?.recordedAt)) {
    return null;
  }

  return {
    latitude,
    longitude,
    altitudeM: optionalNumber(point.altitudeM),
    accuracyM: optionalNumber(point.accuracyM),
    speedKmh: optionalNumber(point.speedKmh),
    recordedAt: point.recordedAt
  };
}

function optionalNumber(value) {
  if (value == null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isValidDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

module.exports = router;
