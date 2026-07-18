import assert from "node:assert/strict";
import test from "node:test";
import { shouldInvalidateAuthentication } from "../src/utils/authPolicy";
import { buildRideListQuery, mergeRidePages } from "../src/utils/journalQuery";
import { rideDisplayTitle } from "../src/utils/rideTitle";

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

test("Journal page merging removes duplicate ride ids without reordering prior rides", () => {
  assert.deepEqual(
    mergeRidePages([{ id: "a" }, { id: "b", value: 1 }], [{ id: "b", value: 2 }, { id: "c" }]),
    [{ id: "a" }, { id: "b", value: 2 }, { id: "c" }]
  );
});
