const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

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

const apiBaseUrl = String(args.get("api") || "https://duke-ride-api.dukeride-kvk.workers.dev/api").replace(/\/$/, "");
const riderPrefix = String(args.get("rider") || "").trim().toUpperCase();
const apply = args.get("apply") === "true";

if (!/^[0-9A-F]{8}$/.test(riderPrefix)) {
  console.error("Missing or invalid --rider. Use the 8-character Rider ID from the app, e.g. --rider=FC19BC08.");
  process.exit(1);
}

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    const email = String(await rl.question("Email: ")).trim().toLowerCase();
    const password = await askHidden("Password: ");
    const auth = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    const token = auth.token;
    const user = auth.user;
    const actualRiderId = String(user?.id || "").slice(0, 8).toUpperCase();
    if (actualRiderId !== riderPrefix) {
      throw new Error(`Logged-in rider is ${actualRiderId}, not ${riderPrefix}. No rides were changed.`);
    }

    const ridesResponse = await apiRequest("/rides?period=all", {
      headers: authHeader(token)
    });
    const rides = Array.isArray(ridesResponse.rides) ? ridesResponse.rides : [];
    const groups = groupDuplicateRides(rides);
    const duplicateRows = groups.flatMap((group) => group);
    const deleteRows = groups.flatMap((group) => group.slice(1));

    console.log(`API: ${apiBaseUrl}`);
    console.log(`Rider: ${user.name} <${user.email}>`);
    console.log(`Rider ID: ${actualRiderId}`);
    console.log(`Total rides loaded: ${rides.length}`);
    console.log(`Duplicate groups found: ${groups.length}`);
    console.log(`Duplicate rides to remove: ${deleteRows.length}`);

    for (const ride of duplicateRows) {
      const marker = deleteRows.some((row) => row.id === ride.id) ? "DELETE" : "KEEP  ";
      console.log(
        `${marker} ${ride.id} started=${new Date(ride.startedAt).toISOString()} distance=${ride.distanceM}m duration=${ride.durationS}s created=${new Date(ride.createdAt).toISOString()}`
      );
    }

    if (!deleteRows.length) {
      console.log("Nothing to delete.");
      return;
    }

    if (!apply) {
      console.log("Dry run only. Re-run with --apply=true to delete the DELETE rows above.");
      return;
    }

    const confirmation = await rl.question(`Type DELETE to remove ${deleteRows.length} duplicate rides: `);
    if (confirmation !== "DELETE") {
      console.log("Cancelled.");
      return;
    }

    let deleted = 0;
    for (const ride of deleteRows) {
      await apiRequest(`/rides/${ride.id}`, {
        method: "DELETE",
        headers: authHeader(token),
        emptyOk: true
      });
      deleted += 1;
      console.log(`Deleted ${ride.id}`);
    }

    console.log(`Deleted ${deleted} duplicate rides through the Cloudflare Worker API.`);
  } finally {
    rl.close();
  }
}

function groupDuplicateRides(rides) {
  const byKey = new Map();
  for (const ride of rides) {
    const key = [
      ride.startedAt,
      ride.endedAt,
      Number(ride.distanceM),
      Number(ride.durationS),
      Number(ride.startLatitude),
      Number(ride.startLongitude),
      Number(ride.endLatitude),
      Number(ride.endLongitude)
    ].join("|");
    const group = byKey.get(key) || [];
    group.push(ride);
    byKey.set(key, group);
  }

  return [...byKey.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))
    )
    .sort((a, b) => new Date(b[0].startedAt).getTime() - new Date(a[0].startedAt).getTime());
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body
  });

  if (options.emptyOk && response.status === 204) {
    return null;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || `API request failed with status ${response.status}`);
  }
  return payload;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function askHidden(prompt) {
  return new Promise((resolve) => {
    const mutableOutput = output;
    const rl = readline.createInterface({ input, output: mutableOutput });
    const originalWrite = mutableOutput.write;

    mutableOutput.write = function maskedWrite(text, encoding, callback) {
      if (String(text).includes(prompt)) {
        return originalWrite.call(this, text, encoding, callback);
      }
      return true;
    };

    rl.question(prompt).then((answer) => {
      mutableOutput.write = originalWrite;
      rl.close();
      originalWrite.call(mutableOutput, "\n");
      resolve(answer);
    });
  });
}

function printHelp() {
  console.log(`
Remove exact duplicate rides through the Cloudflare Worker API.

Usage:
  node scripts/removeDuplicateRidesViaApi.js --rider=FC19BC08
  node scripts/removeDuplicateRidesViaApi.js --rider=FC19BC08 --apply=true

Default mode is dry-run. It keeps the earliest created ride in each exact duplicate group.
`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
