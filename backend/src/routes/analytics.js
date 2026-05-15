const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const buckets = {
  daily: "day",
  monthly: "month",
  yearly: "year"
};

router.get("/distance", async (req, res, next) => {
  try {
    const bucket = buckets[req.query.bucket] || "day";
    const result = await db.query(
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
      [req.user.id, bucket]
    );

    return res.json({
      points: result.rows.map((row) => ({
        bucket: row.bucket,
        distanceM: Number(row.distance_m),
        rideCount: row.ride_count,
        durationS: Number(row.duration_s),
        topSpeedKmh: Number(row.top_speed_kmh),
        avgSpeedKmh: Number(row.avg_speed_kmh)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/speed/:rideId", async (req, res, next) => {
  try {
    const rideResult = await db.query(
      "select id from rides where id = $1 and user_id = $2",
      [req.params.rideId, req.user.id]
    );
    if (!rideResult.rows[0]) {
      return res.status(404).json({ error: "Ride not found" });
    }

    const result = await db.query(
      `select speed_kmh as "speedKmh", recorded_at as "recordedAt"
       from ride_points
       where ride_id = $1
       order by recorded_at asc`,
      [req.params.rideId]
    );

    return res.json({ points: result.rows });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
