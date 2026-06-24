async function attachRoutePreviews(db, rides) {
  if (!Array.isArray(rides) || !rides.length) return rides || [];
  const ids = rides.map((ride) => ride.id).filter(Boolean);
  if (!ids.length) return rides;

  const result = await db.query(
    `with numbered as (
       select ride_id, latitude, longitude,
              row_number() over (partition by ride_id order by recorded_at) as point_number,
              count(*) over (partition by ride_id) as point_count
       from ride_points
       where ride_id = any($1::uuid[])
     )
     select ride_id as "rideId", latitude, longitude
     from numbered
     where point_number = 1
        or point_number = point_count
        or mod(point_number - 1, greatest(1, ceil(point_count / 46.0)::int)) = 0
     order by ride_id, point_number`,
    [ids]
  );

  const previews = new Map();
  for (const point of result.rows) {
    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const preview = previews.get(point.rideId) || [];
    if (preview.length < 48) preview.push({ latitude, longitude });
    previews.set(point.rideId, preview);
  }

  return rides.map((ride) => ({ ...ride, routePreview: previews.get(ride.id) || [] }));
}

module.exports = { attachRoutePreviews };
