import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRouteReplayModel,
  buildReplayFacts,
  estimateTimedLegPeakSpeedKmh,
  getReplayPosition,
  replayDurationMs,
  replaySpeedFactLabel,
  replayTimingLabel
} from "../src/utils/routeReplay";

test("recorded rides replay against their actual point timestamps", () => {
  const model = buildRouteReplayModel({
    source: "manual",
    startedAt: "2026-08-23T10:00:00.000Z",
    endedAt: "2026-08-23T10:00:10.000Z",
    points: [
      { latitude: 18, longitude: 73, recordedAt: "2026-08-23T10:00:00.000Z" },
      { latitude: 18.01, longitude: 73.01, recordedAt: "2026-08-23T10:00:05.000Z" },
      { latitude: 18.02, longitude: 73.02, recordedAt: "2026-08-23T10:00:10.000Z" }
    ]
  });

  assert.equal(model.source, "recorded");
  assert.equal(model.timing, "recorded");
  assert.equal(model.durationS, 10);
  assert.equal(replayTimingLabel(model), "Recorded GPS time");

  const position = getReplayPosition(model, 0.5);
  assert.equal(position.elapsedS, 5);
  assert.equal(position.coordinate?.latitude, 18.01);
  assert.equal(position.traveledCoordinates.length, 2);
  assert.equal(position.untraveledCoordinates.length, 2);
  assert.equal(position.actualAtMs, Date.parse("2026-08-23T10:00:05.000Z"));
});

test("imported routes can use estimated timing without changing the shared ride type", () => {
  const model = buildRouteReplayModel({
    source: "gpx",
    durationS: 120,
    route: [
      [73, 18],
      [73.01, 18.01],
      [73.02, 18.02]
    ]
  });

  assert.equal(model.source, "imported");
  assert.equal(model.timing, "estimated");
  assert.equal(model.durationS, 120);
  assert.equal(model.canReplay, true);
  assert.equal(replayTimingLabel(model), "Estimated from imported route");
  assert.equal(getReplayPosition(model, 0.5).elapsedS, 60);
  assert.equal(getReplayPosition(model, 0.5).actualAtMs, null);
});

test("imported rides keep their source label even when imported points have timestamps", () => {
  const model = buildRouteReplayModel({
    importSource: "google_timeline",
    points: [
      { latitude: 18, longitude: 73, recordedAt: "2026-08-23T10:00:00.000Z" },
      { latitude: 18.01, longitude: 73.01, recordedAt: "2026-08-23T10:02:00.000Z" }
    ]
  });

  assert.equal(model.source, "imported");
  assert.equal(model.timing, "recorded");
  assert.equal(replayTimingLabel(model), "Imported timestamps");
});

test("routes without enough timing data stay static and explain why", () => {
  const model = buildRouteReplayModel({
    source: "imported",
    routePreview: [
      { latitude: 18, longitude: 73 },
      { latitude: 18.01, longitude: 73.01 }
    ]
  });

  assert.equal(model.timing, "unavailable");
  assert.equal(model.canReplay, false);
  assert.equal(replayTimingLabel(model), "Time unavailable");
  assert.deepEqual(getReplayPosition(model, 0.5).traveledCoordinates, []);
});

test("normalized playback speeds change replay wall time, not route timing", () => {
  assert.equal(replayDurationMs(0.5), replayDurationMs(1) * 2);
  assert.equal(replayDurationMs(2), replayDurationMs(1) / 2);
});

test("recorded ride facts keep normal speed labels", () => {
  const model = buildRouteReplayModel({
    source: "manual",
    distanceM: 10000,
    avgSpeedKmh: 36,
    topSpeedKmh: 82,
    sourceActivityType: "motorcycle",
    startedAt: "2026-08-23T10:00:00.000Z",
    endedAt: "2026-08-23T10:10:00.000Z",
    points: [
      { latitude: 18, longitude: 73, recordedAt: "2026-08-23T10:00:00.000Z" },
      { latitude: 18.01, longitude: 73.01, recordedAt: "2026-08-23T10:10:00.000Z" }
    ]
  });
  const facts = buildReplayFacts({ source: "manual", distanceM: 10000, avgSpeedKmh: 36, topSpeedKmh: 82, sourceActivityType: "motorcycle" }, model);
  assert.equal(facts.activityLabel, "Motorcycle");
  assert.equal(facts.sourceLabel, "RidePulse recording");
  assert.equal(facts.pointCount, 2);
  assert.equal(replaySpeedFactLabel(facts, "average"), "AVG SPEED");
  assert.equal(replaySpeedFactLabel(facts, "peak"), "PEAK SPEED");
});

test("imported derived speeds are labeled estimated and never present zero as peak speed", () => {
  const model = buildRouteReplayModel({
    source: "google_timeline",
    distanceM: 1000,
    durationS: 120,
    avgSpeedKmh: 0,
    topSpeedKmh: 0,
    speedDataQuality: "derived",
    sourceActivityType: "IN_VEHICLE",
    route: [
      [73, 18],
      [73.01, 18.01]
    ]
  });
  const facts = buildReplayFacts({
    source: "google_timeline",
    distanceM: 1000,
    durationS: 120,
    avgSpeedKmh: 0,
    topSpeedKmh: 0,
    speedDataQuality: "derived",
    sourceActivityType: "IN_VEHICLE",
    route: [[73, 18], [73.01, 18.01]]
  }, model);
  assert.equal(facts.activityLabel, "In Vehicle");
  assert.equal(facts.sourceLabel, "Google Timeline");
  assert.equal(facts.averageSpeedKmh, 30);
  assert.equal(facts.peakSpeedKmh, null);
  assert.equal(replaySpeedFactLabel(facts, "average"), "AVG SPEED · Estimated");
  assert.equal(replaySpeedFactLabel(facts, "peak"), "PEAK SPEED · Unavailable");
});

test("imported peak speed uses multiple timed legs, filters outliers, and avoids a raw maximum", () => {
  const points = [
    { latitude: 0, longitude: 0, recordedAt: "2026-08-23T10:00:00.000Z" },
    { latitude: 0, longitude: 0.0001, recordedAt: "2026-08-23T10:00:01.000Z" },
    { latitude: 0, longitude: 0.0003, recordedAt: "2026-08-23T10:00:02.000Z" },
    { latitude: 0, longitude: 0.0004, recordedAt: "2026-08-23T10:00:03.000Z" },
    { latitude: 0, longitude: 0.01, recordedAt: "2026-08-23T10:00:03.100Z" }
  ];
  const model = buildRouteReplayModel({ source: "google_timeline", points });
  const facts = buildReplayFacts({
    source: "google_timeline",
    speedDataQuality: "derived",
    topSpeedKmh: 0,
    points
  }, model);

  assert.equal(model.timing, "recorded");
  assert.ok(facts.peakSpeedKmh != null);
  assert.ok(facts.peakSpeedKmh > 60 && facts.peakSpeedKmh < 75);
  assert.equal(facts.peakSpeedKmh, estimateTimedLegPeakSpeedKmh(points));
  assert.equal(replaySpeedFactLabel(facts, "peak"), "PEAK SPEED · Estimated");
});

test("recorded rides with no usable speed data keep average and peak unavailable", () => {
  const points = [
    { latitude: 18, longitude: 73, recordedAt: "2026-08-23T10:00:00.000Z" },
    { latitude: 18, longitude: 73, recordedAt: "2026-08-23T10:01:00.000Z" }
  ];
  const model = buildRouteReplayModel({ source: "manual", points });
  const facts = buildReplayFacts({ source: "manual", distanceM: 0, avgSpeedKmh: 0, topSpeedKmh: 0, points }, model);

  assert.equal(facts.averageSpeedKmh, null);
  assert.equal(facts.peakSpeedKmh, null);
  assert.equal(replaySpeedFactLabel(facts, "average"), "AVG SPEED · Unavailable");
  assert.equal(replaySpeedFactLabel(facts, "peak"), "PEAK SPEED · Unavailable");
});
