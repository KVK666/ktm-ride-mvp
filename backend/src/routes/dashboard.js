const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const statsResult = await db.query(
      `select
         coalesce(sum(distance_m) filter (where started_at >= date_trunc('day', now())), 0) as today_distance_m,
         coalesce(sum(distance_m) filter (where started_at >= date_trunc('month', now())), 0) as month_distance_m,
         coalesce(sum(distance_m) filter (where started_at >= date_trunc('year', now())), 0) as year_distance_m,
         count(*)::int as total_rides,
         coalesce(max(top_speed_kmh), 0) as best_top_speed_kmh,
         coalesce(avg(avg_speed_kmh), 0) as average_speed_kmh
       from rides
       where user_id = $1`,
      [req.user.id]
    );

    const recentResult = await db.query(
      `select id, start_label as "startLabel", end_label as "endLabel",
              distance_m as "distanceM", duration_s as "durationS",
              top_speed_kmh as "topSpeedKmh", avg_speed_kmh as "avgSpeedKmh",
              started_at as "startedAt"
       from rides
       where user_id = $1
       order by started_at desc
       limit 5`,
      [req.user.id]
    );

    const row = statsResult.rows[0];
    return res.json({
      stats: {
        todayDistanceM: Number(row.today_distance_m),
        monthDistanceM: Number(row.month_distance_m),
        yearDistanceM: Number(row.year_distance_m),
        totalRides: row.total_rides,
        bestTopSpeedKmh: Number(row.best_top_speed_kmh),
        averageSpeedKmh: Number(row.average_speed_kmh)
      },
      recentRides: recentResult.rows
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
