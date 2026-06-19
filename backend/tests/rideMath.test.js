const assert = require("assert");
const { distanceMeters, summarizeRide } = require("../src/services/rideMath");

const bangaloreA = { latitude: 12.9716, longitude: 77.5946, recordedAt: "2026-05-10T10:00:00.000Z" };
const bangaloreB = { latitude: 12.9726, longitude: 77.5946, recordedAt: "2026-05-10T10:01:00.000Z" };

const distance = distanceMeters(bangaloreA, bangaloreB);
assert(distance > 100 && distance < 120, `expected roughly 111m, got ${distance}`);

const summary = summarizeRide(
  [
    { ...bangaloreA, speedKmh: 0 },
    { ...bangaloreB, speedKmh: 30 },
    { latitude: 12.9736, longitude: 77.5946, recordedAt: "2026-05-10T10:01:08.000Z", speedKmh: 32 }
  ],
  bangaloreA.recordedAt,
  "2026-05-10T10:01:08.000Z"
);

assert(summary.distanceM > 100);
assert.strictEqual(summary.durationS, 68);
assert.strictEqual(summary.topSpeedKmh, 32);

const spikeSummary = summarizeRide(
  [
    { ...bangaloreA, speedKmh: 40, accuracyM: 8 },
    { ...bangaloreB, speedKmh: 180, accuracyM: 8 },
    { latitude: 12.9736, longitude: 77.5946, recordedAt: "2026-05-10T10:01:08.000Z", speedKmh: 42, accuracyM: 8 },
    { latitude: 12.9746, longitude: 77.5946, recordedAt: "2026-05-10T10:01:16.000Z", speedKmh: 43, accuracyM: 8 }
  ],
  bangaloreA.recordedAt,
  "2026-05-10T10:01:16.000Z"
);
assert.strictEqual(spikeSummary.topSpeedKmh, 43);

const poorAccuracySummary = summarizeRide(
  [
    { ...bangaloreA, speedKmh: 40, accuracyM: 8 },
    { ...bangaloreB, speedKmh: 120, accuracyM: 80 },
    { latitude: 12.9736, longitude: 77.5946, recordedAt: "2026-05-10T10:01:08.000Z", speedKmh: 44, accuracyM: 8 }
  ],
  bangaloreA.recordedAt,
  "2026-05-10T10:01:08.000Z"
);
assert.strictEqual(poorAccuracySummary.topSpeedKmh, 44);

const cappedSummary = summarizeRide(
  [
    { ...bangaloreA, speedKmh: 50, accuracyM: 8 },
    { ...bangaloreB, speedKmh: 260, accuracyM: 8 },
    { latitude: 12.9736, longitude: 77.5946, recordedAt: "2026-05-10T10:01:08.000Z", speedKmh: 52, accuracyM: 8 }
  ],
  bangaloreA.recordedAt,
  "2026-05-10T10:01:08.000Z"
);
assert.strictEqual(cappedSummary.topSpeedKmh, 52);

assert.strictEqual(distanceMeters({ latitude: "bad", longitude: 77 }, bangaloreA), 0);

const invalidInputSummary = summarizeRide(
  [
    { latitude: Number.NaN, longitude: 77.5946, recordedAt: "not-a-date", speedKmh: Number.NaN },
    { latitude: 12.9736, longitude: 77.5946, recordedAt: "also-bad", speedKmh: 30 }
  ],
  "not-a-date",
  "also-bad"
);
assert.deepStrictEqual(invalidInputSummary, {
  distanceM: 0,
  durationS: 0,
  topSpeedKmh: 0,
  avgSpeedKmh: 0
});

console.log("rideMath tests passed");
