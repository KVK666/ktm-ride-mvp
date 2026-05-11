const assert = require("assert");
const { distanceMeters, summarizeRide } = require("../src/services/rideMath");

const bangaloreA = { latitude: 12.9716, longitude: 77.5946, recordedAt: "2026-05-10T10:00:00.000Z" };
const bangaloreB = { latitude: 12.9726, longitude: 77.5946, recordedAt: "2026-05-10T10:01:00.000Z" };

const distance = distanceMeters(bangaloreA, bangaloreB);
assert(distance > 100 && distance < 120, `expected roughly 111m, got ${distance}`);

const summary = summarizeRide(
  [
    { ...bangaloreA, speedKmh: 0 },
    { ...bangaloreB, speedKmh: 30 }
  ],
  bangaloreA.recordedAt,
  bangaloreB.recordedAt
);

assert(summary.distanceM > 100);
assert.strictEqual(summary.durationS, 60);
assert.strictEqual(summary.topSpeedKmh, 30);

console.log("rideMath tests passed");
