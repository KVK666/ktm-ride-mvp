package com.ridepulse.api.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class RideMathService {
  private static final double EARTH_RADIUS_M = 6371000;
  private static final double MAX_REASONABLE_SPEED_KMH = 250;
  private static final double MAX_SPEED_ACCURACY_M = 35;
  private static final long SPEED_SUPPORT_WINDOW_MS = 12_000;
  private static final double MIN_SUPPORTED_SPEED_RATIO = 0.75;

  public double distanceMeters(Map<String, Object> a, Map<String, Object> b) {
    if (!isCoordinate(a) || !isCoordinate(b)) return 0;
    double latA = number(a.get("latitude"));
    double lonA = number(a.get("longitude"));
    double latB = number(b.get("latitude"));
    double lonB = number(b.get("longitude"));
    double dLat = Math.toRadians(latB - latA);
    double dLon = Math.toRadians(lonB - lonA);
    double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(Math.toRadians(latA)) * Math.cos(Math.toRadians(latB))
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  public Map<String, Object> summarizeRide(List<Map<String, Object>> points, String startedAt, String endedAt) {
    List<Map<String, Object>> ordered = new ArrayList<>();
    for (Map<String, Object> point : points == null ? List.<Map<String, Object>>of() : points) {
      if (isCoordinate(point) && timestampMs(point.get("recordedAt")) != null) {
        ordered.add(point);
      }
    }
    ordered.sort(Comparator.comparing(point -> timestampMs(point.get("recordedAt"))));

    double distanceM = 0;
    List<SpeedSample> speedSamples = new ArrayList<>();
    for (int index = 1; index < ordered.size(); index += 1) {
      Map<String, Object> previous = ordered.get(index - 1);
      Map<String, Object> current = ordered.get(index);
      distanceM += distanceMeters(previous, current);
      double speedKmh = optionalNumber(current.get("speedKmh")) != null && optionalNumber(current.get("speedKmh")) >= 0
          ? optionalNumber(current.get("speedKmh"))
          : speedBetween(previous, current);
      speedSamples.add(new SpeedSample(current, index, speedKmh));
    }

    Long startMs = timestampMs(startedAt);
    Long endMs = timestampMs(endedAt);
    int durationS = startMs != null && endMs != null ? Math.max(0, Math.round((endMs - startMs) / 1000f)) : 0;
    double avgSpeedKmh = durationS > 0 ? (distanceM / 1000 / (durationS / 3600d)) : 0;
    return Map.of(
        "distanceM", Math.round(distanceM),
        "durationS", durationS,
        "topSpeedKmh", round(reliableTopSpeed(speedSamples)),
        "avgSpeedKmh", round(avgSpeedKmh));
  }

  public static boolean isCoordinate(Map<String, Object> point) {
    if (point == null) return false;
    Double latitude = optionalNumber(point.get("latitude"));
    Double longitude = optionalNumber(point.get("longitude"));
    return latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  }

  public static Double optionalNumber(Object value) {
    if (value == null) return null;
    if (value instanceof Number number) return number.doubleValue();
    try {
      return Double.parseDouble(String.valueOf(value));
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  public static double number(Object value) {
    Double safe = optionalNumber(value);
    return safe == null ? 0 : safe;
  }

  public static Long timestampMs(Object value) {
    if (!(value instanceof String string) || string.isBlank()) return null;
    try {
      return Instant.parse(string).toEpochMilli();
    } catch (Exception ignored) {
      return null;
    }
  }

  private double reliableTopSpeed(List<SpeedSample> samples) {
    List<SpeedSample> valid = samples.stream().filter(this::isValidSpeedSample).toList();
    if (valid.isEmpty()) return 0;
    double best = 0;
    for (SpeedSample sample : valid) {
      boolean supported = valid.stream().anyMatch(other -> {
        if (other.index() == sample.index()) return false;
        long gapMs = Math.abs(timestampMs(other.point().get("recordedAt")) - timestampMs(sample.point().get("recordedAt")));
        return gapMs <= SPEED_SUPPORT_WINDOW_MS && other.speedKmh() >= sample.speedKmh() * MIN_SUPPORTED_SPEED_RATIO;
      });
      if (supported) best = Math.max(best, sample.speedKmh());
    }
    if (best > 0) return best;
    return valid.stream().mapToDouble(SpeedSample::speedKmh).max().orElse(0);
  }

  private boolean isValidSpeedSample(SpeedSample sample) {
    if (!Double.isFinite(sample.speedKmh()) || sample.speedKmh() < 0 || sample.speedKmh() > MAX_REASONABLE_SPEED_KMH) {
      return false;
    }
    Double accuracyM = optionalNumber(sample.point().get("accuracyM"));
    return accuracyM == null || accuracyM <= MAX_SPEED_ACCURACY_M;
  }

  private double speedBetween(Map<String, Object> a, Map<String, Object> b) {
    Long start = timestampMs(a.get("recordedAt"));
    Long end = timestampMs(b.get("recordedAt"));
    if (start == null || end == null || end <= start) return 0;
    double elapsedS = (end - start) / 1000d;
    return (distanceMeters(a, b) / 1000 / elapsedS) * 3600;
  }

  private static double round(double value) {
    return Double.isFinite(value) ? Math.round(value * 10) / 10d : 0;
  }

  private record SpeedSample(Map<String, Object> point, int index, double speedKmh) {}
}
