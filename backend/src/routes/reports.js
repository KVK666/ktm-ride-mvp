const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const period = req.query.period || "month";
    const grain = period === "year" ? "year" : period === "day" ? "day" : "month";
    const requestedAnchor = req.query.date ? new Date(req.query.date) : new Date();
    const anchor = Number.isFinite(requestedAnchor.getTime()) ? requestedAnchor : new Date();

    const result = await db.query(
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
      [req.user.id, grain, anchor.toISOString()]
    );

    const routes = await db.query(
      `select start_label as "from", end_label as "to", distance_m as "distanceM",
              duration_s as "durationS", top_speed_kmh as "topSpeedKmh",
              started_at as "startedAt"
       from rides
       where user_id = $1
         and started_at >= date_trunc($2, $3::timestamptz)
         and started_at < date_trunc($2, $3::timestamptz) + ('1 ' || $2)::interval
       order by started_at asc`,
      [req.user.id, grain, anchor.toISOString()]
    );

    const row = result.rows[0];
    return res.json({
      period,
      generatedAt: new Date().toISOString(),
      summary: {
        rideCount: row.ride_count,
        distanceM: Number(row.distance_m),
        durationS: Number(row.duration_s),
        averageSpeedKmh: Number(row.avg_speed_kmh),
        topSpeedKmh: Number(row.top_speed_kmh)
      },
      routes: routes.rows
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
