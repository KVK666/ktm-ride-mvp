const assert = require("assert");
const { buildHomeExperience, buildJournal, buildRideIntelligence, decorateRides } = require("../src/services/journalIntelligence");

const ride = {
  id: "ride-1",
  startLabel: "Indiranagar, Bengaluru",
  endLabel: "Nandi Hills",
  startLatitude: 12.9784,
  startLongitude: 77.6408,
  endLatitude: 13.3702,
  endLongitude: 77.6835,
  distanceM: 52000,
  durationS: 3600,
  topSpeedKmh: 92,
  avgSpeedKmh: 52,
  reviewedAt: null,
  startedAt: "2026-06-20T01:30:00.000Z",
  endedAt: "2026-06-20T02:30:00.000Z"
};

const points = [
  { latitude: 12.9784, longitude: 77.6408, recordedAt: "2026-06-20T01:30:00.000Z" },
  { latitude: 13.08, longitude: 77.65, recordedAt: "2026-06-20T01:40:00.000Z" },
  { latitude: "bad", longitude: 77.66, recordedAt: "bad" },
  { latitude: 13.3702, longitude: 77.6835, recordedAt: "2026-06-20T02:30:00.000Z" }
];

const intelligence = buildRideIntelligence(ride, points, {
  monthDistanceM: 120000,
  longestRideDistanceM: 52000
});

assert(intelligence.suggestedTitle.endsWith("to Nandi Hills"));
assert(intelligence.badges.includes("Personal best"));
assert(intelligence.badges.includes("Needs story"));
assert(intelligence.summaryText.includes("open-road"));
assert(intelligence.midpoint);
assert(intelligence.chapters.length >= 3);
assert.strictEqual(intelligence.comparisons.distanceVsLongestM, 0);

const malformed = buildRideIntelligence({ ...ride, distanceM: "oops" }, [{ latitude: 999, longitude: null }]);
assert.strictEqual(malformed.fastestSegment, null);
assert(malformed.chapters.length >= 2);

const journal = buildJournal({
  stats: {
    monthDistanceM: 120000,
    previousMonthDistanceM: 60000,
    totalRides: 5,
    unreviewedRides: 1,
    longestRideDistanceM: 52000
  },
  recentRides: [ride],
  monthRides: [ride]
});

assert.strictEqual(journal.latestRide.id, ride.id);
assert.strictEqual(journal.monthlyRecap.distanceDeltaPercent, 100);
assert(journal.highlights.length >= 3);
assert.strictEqual(journal.unreviewedCount, 1);

const home = buildHomeExperience({
  stats: {
    monthDistanceM: 120000,
    previousMonthDistanceM: 60000,
    totalRides: 5,
    unreviewedRides: 1,
    longestRideDistanceM: 52000
  },
  recentRides: [ride],
  monthRides: [ride]
});

assert.strictEqual(home.generatedFor, "home");
assert(home.pendingReviewSuggestions[0].prompt.includes("Morning ride") || home.pendingReviewSuggestions[0].prompt.includes("ride"));
assert(home.memorySeeds.length >= 2);
assert(home.latestRide.memoryReason);
assert(home.latestRide.albumHint);

const emptyHome = buildHomeExperience({ stats: {}, recentRides: [], monthRides: [] });
assert.strictEqual(emptyHome.latestRide, null);
assert.deepStrictEqual(emptyHome.pendingReviewSuggestions, []);

const decorated = decorateRides([ride], { longestRideDistanceM: 52000 });
assert(decorated[0].smartTitle.endsWith("to Nandi Hills"));
assert(Array.isArray(decorated[0].badges));

console.log("journalIntelligence tests passed");
