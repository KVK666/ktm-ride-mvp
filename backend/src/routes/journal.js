const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { attachRoutePreviews } = require("../services/routePreviews");
const { buildJournal } = require("../services/journalIntelligence");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const statsResult = await db.query(
      `select
         coalesce(sum(distance_m) filter (where started_at >= date_trunc('day', now())), 0) as "todayDistanceM",
         coalesce(sum(distance_m) filter (where started_at >= date_trunc('month', now())), 0) as "monthDistanceM",
         coalesce(sum(distance_m) filter (where started_at >= date_trunc('year', now())), 0) as "yearDistanceM",
         coalesce(sum(distance_m) filter (
           where started_at >= date_trunc('month', now()) - interval '1 month'
             and started_at < date_trunc('month', now())
         ), 0) as "previousMonthDistanceM",
         coalesce(max(distance_m), 0) as "longestRideDistanceM",
         count(*)::int as "totalRides",
         count(*) filter (where reviewed_at is null)::int as "unreviewedRides",
         coalesce(max(top_speed_kmh), 0) as "bestTopSpeedKmh",
         coalesce(avg(avg_speed_kmh), 0) as "averageSpeedKmh"
       from rides
       where user_id = $1`,
      [req.user.id]
    );

    const recentResult = await db.query(
      `${rideSelect()} where r.user_id = $1 order by r.started_at desc limit 12`,
      [req.user.id]
    );

    const monthResult = await db.query(
      `${rideSelect()}
       where r.user_id = $1 and r.started_at >= date_trunc('month', now())
       order by r.distance_m desc
       limit 12`,
      [req.user.id]
    );

    const stats = normalizeStatsRow(statsResult.rows[0]);
    const recentRides = await attachRoutePreviews(db, recentResult.rows);
    const monthRides = await attachRoutePreviews(db, monthResult.rows);

    return res.json(buildJournal({ stats, recentRides, monthRides }));
  } catch (error) {
    return next(error);
  }
});

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

function normalizeStatsRow(row = {}) {
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    todayDistanceM: number(row.todayDistanceM),
    monthDistanceM: number(row.monthDistanceM),
    yearDistanceM: number(row.yearDistanceM),
    totalRides: number(row.totalRides),
    unreviewedRides: number(row.unreviewedRides),
    bestTopSpeedKmh: number(row.bestTopSpeedKmh),
    averageSpeedKmh: number(row.averageSpeedKmh),
    previousMonthDistanceM: number(row.previousMonthDistanceM),
    longestRideDistanceM: number(row.longestRideDistanceM)
  };
}

module.exports = router;
