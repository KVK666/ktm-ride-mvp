const EARTH_RADIUS_M = 6371000;
const MAX_REASONABLE_SPEED_KMH = 250;
const MAX_SPEED_ACCURACY_M = 35;
const SPEED_SUPPORT_WINDOW_MS = 12 * 1000;
const MIN_SUPPORTED_SPEED_RATIO = 0.75;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function summarizeRide(points, startedAt, endedAt) {
  const ordered = [...points].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

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

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  const durationS = Math.max(0, Math.round((endMs - startMs) / 1000));
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
      const gapMs = Math.abs(new Date(other.point.recordedAt).getTime() - new Date(sample.point.recordedAt).getTime());
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
  const elapsedS =
    (new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()) / 1000;
  if (elapsedS <= 0) {
    return 0;
  }

  return (distanceMeters(a, b) / 1000 / elapsedS) * 3600;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
