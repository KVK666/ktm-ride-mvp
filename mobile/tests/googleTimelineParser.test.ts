import assert from "node:assert/strict";
import test from "node:test";
import { groupTimelineCandidates, parseGoogleTimeline } from "../src/services/googleTimelineParser";

function semanticSegment({
  startTime,
  endTime,
  activityType = "MOTORCYCLING",
  distanceMeters = 1500,
  startLatitude = 18,
  startLongitude = 73
}: {
  startTime: string;
  endTime: string;
  activityType?: string;
  distanceMeters?: number;
  startLatitude?: number;
  startLongitude?: number;
}) {
  return {
    startTime,
    endTime,
    activity: {
      start: { latitude: startLatitude, longitude: startLongitude },
      end: { latitude: startLatitude + 0.02, longitude: startLongitude + 0.02 },
      distanceMeters,
      topCandidate: { type: activityType }
    },
    timelinePath: [
      { point: { latitude: startLatitude, longitude: startLongitude }, durationMinutesOffset: 0 },
      { point: { latitude: startLatitude + 0.01, longitude: startLongitude + 0.01 }, durationMinutesOffset: 5 },
      { point: { latitude: startLatitude + 0.02, longitude: startLongitude + 0.02 }, durationMinutesOffset: 10 }
    ]
  };
}

test("parses separate semantic timelinePath points with real offset timestamps", () => {
  const result = parseGoogleTimeline({
    semanticSegments: [semanticSegment({
      startTime: "2026-08-23T10:00:00.000Z",
      endTime: "2026-08-23T10:10:00.000Z"
    })]
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].points.length, 3);
  assert.deepEqual(result.candidates[0].points.map((point) => point.recordedAt), [
    "2026-08-23T10:00:00.000Z",
    "2026-08-23T10:05:00.000Z",
    "2026-08-23T10:10:00.000Z"
  ]);
  assert.equal(result.candidates[0].points[1].latitude, 18.01);
});

test("accepts the exact vehicle allow-list and enforces exported distance and duration", () => {
  const result = parseGoogleTimeline({
    semanticSegments: [
      semanticSegment({ startTime: "2026-08-23T10:00:00.000Z", endTime: "2026-08-23T10:10:00.000Z", activityType: "MOTORCYCLING" }),
      semanticSegment({ startTime: "2026-08-23T11:00:00.000Z", endTime: "2026-08-23T11:10:00.000Z", activityType: "IN_PASSENGER_VEHICLE", startLatitude: 19 }),
      semanticSegment({ startTime: "2026-08-23T12:00:00.000Z", endTime: "2026-08-23T12:10:00.000Z", activityType: "WALKING", startLatitude: 20 }),
      semanticSegment({ startTime: "2026-08-23T13:00:00.000Z", endTime: "2026-08-23T13:10:00.000Z", distanceMeters: 499, startLatitude: 21 }),
      semanticSegment({ startTime: "2026-08-23T14:00:00.000Z", endTime: "2026-08-23T14:01:59.000Z", startLatitude: 22 })
    ]
  });

  assert.deepEqual(result.candidates.map((candidate) => candidate.activityType), ["MOTORCYCLING", "IN_PASSENGER_VEHICLE"]);
});

test("requires a non-empty semanticSegments export", () => {
  assert.throws(
    () => parseGoogleTimeline({ timelineObjects: [] }),
    /Expected a non-empty semanticSegments array/
  );
  assert.throws(
    () => parseGoogleTimeline({ semanticSegments: [] }),
    /Expected a non-empty semanticSegments array/
  );
});

test("groups by exported local calendar date and enables albums only for multi-route dates", () => {
  const result = parseGoogleTimeline({
    semanticSegments: [
      semanticSegment({ startTime: "2026-08-23T00:01:00.000Z", endTime: "2026-08-23T00:11:00.000Z" }),
      semanticSegment({ startTime: "2026-08-23T22:00:00.000Z", endTime: "2026-08-23T22:10:00.000Z", startLatitude: 19 }),
      semanticSegment({ startTime: "2026-08-24T09:00:00.000Z", endTime: "2026-08-24T09:10:00.000Z", startLatitude: 20 })
    ]
  });

  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].candidates.length, 2);
  assert.equal(result.groups[0].albumEnabled, true);
  assert.equal(result.groups[1].candidates.length, 1);
  assert.equal(result.groups[1].albumEnabled, false);
});

test("does not merge candidates from different local dates even when they are close", () => {
  const candidates = parseGoogleTimeline({
    semanticSegments: [
      semanticSegment({ startTime: "2026-08-23T23:59:00.000Z", endTime: "2026-08-24T00:09:00.000Z" }),
      semanticSegment({ startTime: "2026-08-24T00:10:00.000Z", endTime: "2026-08-24T00:20:00.000Z", startLatitude: 19 })
    ]
  }).candidates;

  const groups = groupTimelineCandidates(candidates);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.candidates.length), [1, 1]);
});
