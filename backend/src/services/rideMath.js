const EARTH_RADIUS_M = 6371000;
const MAX_REASONABLE_SPEED_KMH = 250;
const MAX_SPEED_ACCURACY_M = 35;
const SPEED_SUPPORT_WINDOW_MS = 12 * 1000;
const MIN_SUPPORTED_SPEED_RATIO = 0.75;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  if (!isCoordinate(a) || !isCoordinate(b)) {
    return 0;
  }

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function summarizeRide(points, startedAt, endedAt) {
  const ordered = (Array.isArray(points) ? points : [])
    .filter((point) => isCoordinate(point) && Number.isFinite(timestampMs(point.recordedAt)))
    .sort((a, b) => timestampMs(a.recordedAt) - timestampMs(b.recordedAt));

  let distanceM = 0;
  const speedSamples = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    distanceM += distanceMeters(previous, current);

    const speedKmh =
      typeof current.speedKmh === "number" && current.speedKmh >= 0
        ? current.speedKmh
        : speedBetween(previous, current);
    speedSamples.push({ point: current, index, speedKmh });
  }

  const startMs = timestampMs(startedAt);
  const endMs = timestampMs(endedAt);
  const durationS = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(0, Math.round((endMs - startMs) / 1000))
    : 0;
  const avgSpeedKmh = durationS > 0 ? (distanceM / 1000 / (durationS / 3600)) : 0;

  return {
    distanceM: Math.round(distanceM),
    durationS,
    topSpeedKmh: round(reliableTopSpeed(speedSamples)),
    avgSpeedKmh: round(avgSpeedKmh)
  };
}

function reliableTopSpeed(samples) {
  const valid = samples.filter((sample) => isValidSpeedSample(sample));
  if (!valid.length) {
    return 0;
  }

  let best = 0;
  for (const sample of valid) {
    const supported = valid.some((other) => {
      if (other.index === sample.index) {
        return false;
      }
      const gapMs = Math.abs(timestampMs(other.point.recordedAt) - timestampMs(sample.point.recordedAt));
      return gapMs <= SPEED_SUPPORT_WINDOW_MS && other.speedKmh >= sample.speedKmh * MIN_SUPPORTED_SPEED_RATIO;
    });
    if (supported) {
      best = Math.max(best, sample.speedKmh);
    }
  }

  return best || Math.max(...valid.map((sample) => sample.speedKmh));
}

function isValidSpeedSample(sample) {
  if (!Number.isFinite(sample.speedKmh) || sample.speedKmh < 0 || sample.speedKmh > MAX_REASONABLE_SPEED_KMH) {
    return false;
  }
  const accuracyM = sample.point.accuracyM;
  return accuracyM == null || Number(accuracyM) <= MAX_SPEED_ACCURACY_M;
}

function speedBetween(a, b) {
  const elapsedS = (timestampMs(b.recordedAt) - timestampMs(a.recordedAt)) / 1000;
  if (!Number.isFinite(elapsedS) || elapsedS <= 0) {
    return 0;
  }

  return (distanceMeters(a, b) / 1000 / elapsedS) * 3600;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function isCoordinate(point) {
  return (
    point &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude)) &&
    Math.abs(Number(point.latitude)) <= 90 &&
    Math.abs(Number(point.longitude)) <= 180
  );
}

function timestampMs(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

module.exports = { distanceMeters, summarizeRide };
