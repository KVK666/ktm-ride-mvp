const { Pool } = require("pg");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const [key, value] = arg.slice(2).split("=");
    args.set(key, value || "true");
  }
}

if (args.has("help")) {
  printHelp();
  process.exit(0);
}

const riderPrefix = String(args.get("rider") || "").trim().toLowerCase();
const apply = args.get("apply") === "true";

if (!riderPrefix || !/^[0-9a-f]{8}$/i.test(riderPrefix)) {
  console.error("Missing or invalid --rider. Use the 8-character Rider ID from the app, e.g. --rider=FC19BC08.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Set it to the Neon PostgreSQL connection string before running this script.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require") ? undefined : { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const userResult = await client.query(
      `select id, email, name
       from users
       where lower(id::text) like $1
       order by created_at asc`,
      [`${riderPrefix}%`]
    );

    if (userResult.rows.length !== 1) {
      throw new Error(`Expected exactly 1 rider for prefix ${riderPrefix.toUpperCase()}, found ${userResult.rows.length}.`);
    }

    const user = userResult.rows[0];
    const duplicateResult = await client.query(
      `with ranked as (
         select
           r.id,
           r.started_at,
           r.ended_at,
           r.distance_m,
           r.duration_s,
           r.top_speed_kmh,
           r.avg_speed_kmh,
           r.created_at,
           count(*) over (
             partition by
               r.user_id,
               r.started_at,
               r.ended_at,
               r.distance_m,
               r.duration_s,
               r.start_latitude,
               r.start_longitude,
               r.end_latitude,
               r.end_longitude
           ) as duplicate_count,
           row_number() over (
             partition by
               r.user_id,
               r.started_at,
               r.ended_at,
               r.distance_m,
               r.duration_s,
               r.start_latitude,
               r.start_longitude,
               r.end_latitude,
               r.end_longitude
             order by r.created_at asc, r.id asc
           ) as duplicate_rank
         from rides r
         where r.user_id = $1
       )
       select *
       from ranked
       where duplicate_count > 1
       order by started_at desc, duplicate_rank asc`,
      [user.id]
    );

    const rows = duplicateResult.rows;
    const deleteIds = rows.filter((row) => Number(row.duplicate_rank) > 1).map((row) => row.id);

    console.log(`Rider: ${user.name} <${user.email}>`);
    console.log(`Rider UUID: ${user.id}`);
    console.log(`Duplicate groups found: ${new Set(rows.map((row) => duplicateKey(row))).size}`);
    console.log(`Duplicate rides to remove: ${deleteIds.length}`);

    for (const row of rows) {
      const marker = Number(row.duplicate_rank) === 1 ? "KEEP  " : "DELETE";
      console.log(
        `${marker} ${row.id} started=${row.started_at.toISOString()} distance=${row.distance_m}m duration=${row.duration_s}s created=${row.created_at.toISOString()}`
      );
    }

    if (!deleteIds.length) {
      console.log("Nothing to delete.");
      return;
    }

    if (!apply) {
      console.log("Dry run only. Re-run with --apply=true to delete the DELETE rows above.");
      return;
    }

    await client.query("begin");
    const deleteResult = await client.query(
      `delete from rides
       where user_id = $1
         and id = any($2::uuid[])
       returning id`,
      [user.id, deleteIds]
    );
    await client.query("commit");

    console.log(`Deleted ${deleteResult.rowCount} duplicate rides. ride_points were removed by cascade.`);
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Ignore rollback failures when no transaction was started.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function duplicateKey(row) {
  return [
    row.started_at.toISOString(),
    row.ended_at.toISOString(),
    row.distance_m,
    row.duration_s
  ].join("|");
}

function printHelp() {
  console.log(`
Remove exact duplicate rides for one rider.

Usage:
  DATABASE_URL="postgresql://..." node scripts/removeDuplicateRides.js --rider=FC19BC08
  DATABASE_URL="postgresql://..." node scripts/removeDuplicateRides.js --rider=FC19BC08 --apply=true

Default mode is dry-run. It keeps the earliest created ride in each exact duplicate group.
`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
