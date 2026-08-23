import assert from "node:assert/strict";
import test from "node:test";
import { shouldInvalidateAuthentication } from "../src/utils/authPolicy";
import { buildRideListQuery, mergeRidePages } from "../src/utils/journalQuery";
import { evaluateManualRideAutoStop } from "../src/utils/manualRideAutoStopPolicy";
import { rideDisplayTitle } from "../src/utils/rideTitle";
import { RidePoint } from "../src/types";

test("canonical ride titles follow the shared precedence", () => {
  const base = { startedAt: "2026-07-19T08:00:00.000Z" };
  assert.equal(rideDisplayTitle({ ...base, title: "  Manual title ", aiTitle: "AI", smartTitle: "Smart" }), "Manual title");
  assert.equal(rideDisplayTitle({ ...base, aiTitle: "AI title", smartTitle: "Smart" }), "AI title");
  assert.equal(rideDisplayTitle({ ...base, smartTitle: "Smart title" }), "Smart title");
  assert.equal(rideDisplayTitle({ ...base, startLabel: "Pune", endLabel: "Lonavala" }), "Pune to Lonavala");
  assert.match(rideDisplayTitle(base), / ride$/);
});

test("authentication is cleared only for confirmed protected 401 or 403 responses", () => {
  assert.equal(shouldInvalidateAuthentication(true, 401, "/rides"), true);
  assert.equal(shouldInvalidateAuthentication(true, 403, "/profile"), true);
  assert.equal(shouldInvalidateAuthentication(true, 500, "/rides"), false);
  assert.equal(shouldInvalidateAuthentication(true, undefined, "/rides"), false);
  assert.equal(shouldInvalidateAuthentication(false, 401, "/rides"), false);
  assert.equal(shouldInvalidateAuthentication(true, 401, "/auth/login"), false);
});

test("Journal query state keeps filters, sort, search, and cursor independent", () => {
  const query = buildRideListQuery({
    filter: "cleanup",
    sort: "longest",
    query: "  hill ride  ",
    cursor: "opaque+cursor"
  });
  assert.equal(query, "period=all&limit=100&sort=longest&q=hill%20ride&reviewStatus=cleanup&cursor=opaque%2Bcursor");
  assert.equal(buildRideListQuery({ filter: "month", sort: "newest" }), "period=month&limit=100&sort=newest");
});

test("Journal calendar filters request the complete selected local month", () => {
  const query = buildRideListQuery({ filter: "all", sort: "newest", calendarYear: 2025, calendarMonth: 6 });
  const params = new URLSearchParams(query);
  assert.equal(params.get("startedFrom"), new Date(2025, 6, 1).toISOString());
  assert.equal(params.get("startedBefore"), new Date(2025, 7, 1).toISOString());
});

test("Journal page merging removes duplicate ride ids without reordering prior rides", () => {
  assert.deepEqual(
    mergeRidePages([{ id: "a" }, { id: "b", value: 1 }], [{ id: "b", value: 2 }, { id: "c" }]),
    [{ id: "a" }, { id: "b", value: 2 }, { id: "c" }]
  );
});

test("manual rides auto-stop after five minutes at or below 5 km/h and trim the parked tail", () => {
  const points = [
    ridePoint(0, 0, 18),
    ridePoint(1, 0.001, 32),
    ridePoint(5.983, 0.001, 5)
  ];
  assert.equal(evaluateManualRideAutoStop(points, points[0].recordedAt).shouldStop, false);

  const decision = evaluateManualRideAutoStop(
    [...points, ridePoint(6, 0.001, 5)],
    points[0].recordedAt
  );
  assert.equal(decision.shouldStop, true);
  if (decision.shouldStop) {
    assert.equal(decision.endedAt, points[1].recordedAt);
    assert.deepEqual(decision.points, points.slice(0, 2));
  }
});

test("manual auto-stop timer resets when reported movement resumes", () => {
  const points = [
    ridePoint(0, 0, 20),
    ridePoint(1, 0.001, 30),
    ridePoint(4, 0.001, 0),
    ridePoint(4.5, 0.0015, 12),
    ridePoint(9.483, 0.0015, 0)
  ];
  assert.equal(evaluateManualRideAutoStop(points, points[0].recordedAt).shouldStop, false);

  const decision = evaluateManualRideAutoStop(
    [...points, ridePoint(9.5, 0.0015, 0)],
    points[0].recordedAt
  );
  assert.equal(decision.shouldStop, true);
  if (decision.shouldStop) {
    assert.equal(decision.endedAt, points[3].recordedAt);
  }
});

test("inferred GPS movement resets manual auto-stop when reported speed is missing", () => {
  const points = [
    ridePoint(0, 0, 18),
    ridePoint(1, 0.001, 30),
    ridePoint(5.5, 0.001, 0),
    ridePoint(5.516, 0.0011, null),
    ridePoint(10.5, 0.0011, 0)
  ];
  assert.equal(evaluateManualRideAutoStop(points, points[0].recordedAt).shouldStop, false);
});

test("poor-accuracy reported speed does not keep a parked manual ride active", () => {
  const points = [
    ridePoint(0, 0, 18),
    ridePoint(1, 0.001, 30),
    { ...ridePoint(4, 0.001, 90), accuracyM: 100 },
    ridePoint(6, 0.001, 0)
  ];
  const decision = evaluateManualRideAutoStop(points, points[0].recordedAt);
  assert.equal(decision.shouldStop, true);
  if (decision.shouldStop) {
    assert.equal(decision.endedAt, points[1].recordedAt);
  }
});

function ridePoint(minutes: number, latitude: number, speedKmh: number | null): RidePoint {
  return {
    latitude,
    longitude: 73.8567,
    accuracyM: 8,
    speedKmh,
    recordedAt: new Date(Date.parse("2026-08-23T10:00:00.000Z") + minutes * 60 * 1000).toISOString()
  };
}
