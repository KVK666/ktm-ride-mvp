package com.ridepulse.api.service;

final class RideCleanupPolicy {
  private RideCleanupPolicy() {}

  static boolean isCandidate(Object distanceM, Object durationS, Object reviewedAt) {
    double safeDistanceM = nonNegativeNumber(distanceM);
    double safeDurationS = nonNegativeNumber(durationS);
    return reviewedAt == null
        && ((safeDistanceM <= 100 && safeDurationS <= 180)
            || (safeDistanceM <= 250 && safeDurationS <= 60));
  }

  private static double nonNegativeNumber(Object value) {
    Double parsed = RideMathService.optionalNumber(value);
    return parsed == null || !Double.isFinite(parsed) || parsed < 0 ? 0 : parsed;
  }
}
