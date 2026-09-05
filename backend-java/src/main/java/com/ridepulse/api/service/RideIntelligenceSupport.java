package com.ridepulse.api.service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.ridepulse.api.utility.Rows;

final class RideIntelligenceSupport {
  private static final int MAX_LABEL_LENGTH = 72;
  private RideIntelligenceSupport() {}

  static String savedPlaceTitle(Map<String, Object> ride) {
    if (ride == null || !string(ride.get("title")).trim().isBlank()) return "";
    String start = placeLabel(ride.get("matchedStartPlace"));
    String end = placeLabel(ride.get("matchedEndPlace"));
    if (start.isBlank() && end.isBlank()) return "";
    if (!start.isBlank() && !end.isBlank()) {
      if (start.equalsIgnoreCase(end)) return "Loop from " + start;
      String type = isCommuteRoute(ride) ? "Commute" : "Ride";
      return type + " · " + start + " to " + end;
    }
    return "Ride " + (end.isBlank() ? "from " + start : "to " + end);
  }

  static void copyDestination(Map<String, Object> source, Map<String, Object> target) {
    for (String key : List.of("destinationName", "destinationCategory", "destinationAddress", "destinationSource")) {
      String value = string(source == null ? null : source.get(key)).trim();
      if (!value.isBlank()) target.put(key, value);
    }
  }

  static String destinationTitle(Map<String, Object> ride) {
    String name = safeLabel(ride == null ? null : ride.get("destinationName"));
    if (name.isBlank()) return "";
    return switch (safeCategory(ride.get("destinationCategory"))) {
      case "coffee_shop" -> "Coffee run to " + name;
      case "restaurant" -> "Food ride to " + name;
      case "fuel_station" -> "Fuel stop at " + name;
      case "park" -> "Park ride to " + name;
      case "store" -> "Ride to " + name;
      case "hotel" -> "Ride to " + name;
      case "attraction" -> "Explore " + name;
      default -> "Ride to " + name;
    };
  }

  static boolean eligibleHistoricalRefresh(Map<String, Object> ride) {
    if (!string(ride.get("title")).trim().isBlank()) return false;
    String aiTitle = string(ride.get("aiTitle")).trim().toLowerCase();
    String endLabel = string(ride.get("endLabel")).trim().toLowerCase();
    if (aiTitle.isBlank()) return true;
    if (endLabel.matches(".*-?\\d+\\.\\d{3,}.*") || endLabel.startsWith("auto end") || endLabel.startsWith("recovered end")) return true;
    return aiTitle.matches("^(morning|afternoon|evening) (ride|long ride|city loop)$")
        || aiTitle.matches("^(fast|quick) (morning|afternoon|evening) (ride|spin)$")
        || List.of("night cruise", "short errand ride").contains(aiTitle);
  }

  static Map<String, Object> movementSignals(List<Map<String, Object>> points) {
    if (points == null || points.size() < 2) return Map.of();
    List<Double> speeds = points.stream()
        .map(point -> numberOrDefault(point.get("speedKmh"), Double.NaN))
        .filter(Double::isFinite)
        .sorted()
        .toList();
    long movingSeconds = 0;
    long stoppedSeconds = 0;
    long currentStopSeconds = 0;
    int stopCount = 0;
    for (int index = 1; index < points.size(); index++) {
      long delta = secondsBetween(points.get(index - 1).get("recordedAt"), points.get(index).get("recordedAt"));
      if (delta <= 0 || delta > 120) continue;
      double speed = numberOrDefault(points.get(index).get("speedKmh"), 0);
      if (speed >= 3) {
        movingSeconds += delta;
        if (currentStopSeconds >= 60) stopCount++;
        currentStopSeconds = 0;
      } else {
        stoppedSeconds += delta;
        currentStopSeconds += delta;
      }
    }
    if (currentStopSeconds >= 60) stopCount++;
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("movingMinutes", Math.round(movingSeconds / 60d));
    result.put("stoppedMinutes", Math.round(stoppedSeconds / 60d));
    result.put("stopCount", stopCount);
    if (!speeds.isEmpty()) {
      result.put("medianSpeedKmh", Math.round(percentile(speeds, 0.5)));
      result.put("p90SpeedKmh", Math.round(percentile(speeds, 0.9)));
    }
    return result;
  }

  static double percentile(List<Double> sorted, double percentile) {
    int index = Math.min(sorted.size() - 1, Math.max(0, (int) Math.ceil(sorted.size() * percentile) - 1));
    return sorted.get(index);
  }

  static long secondsBetween(Object startValue, Object endValue) {
    try {
      return Math.max(0, Duration.between(Instant.parse(string(startValue)), Instant.parse(string(endValue))).toSeconds());
    } catch (Exception ignored) {
      return 0;
    }
  }

  static double startEndDistanceM(Map<String, Object> ride) {
    return haversine(
        numberOrDefault(ride.get("startLatitude"), 0), numberOrDefault(ride.get("startLongitude"), 0),
        numberOrDefault(ride.get("endLatitude"), 0), numberOrDefault(ride.get("endLongitude"), 0));
  }

  static String dayOfWeek(Object value) {
    try {
      return ZonedDateTime.ofInstant(Instant.parse(string(value)), ZoneId.systemDefault()).getDayOfWeek().name().toLowerCase();
    } catch (Exception ignored) {
      return "unknown";
    }
  }

  static String safeCategory(Object value) {
    return string(value).trim().toLowerCase().replaceAll("[^a-z0-9_]+", "_");
  }

  static String categoryLabel(Object value) {
    return switch (safeCategory(value)) {
      case "coffee_shop" -> "Coffee shop";
      case "fuel_station" -> "Fuel station";
      case "saved_place" -> "Saved place";
      case "" -> "";
      default -> safeCategory(value).replace('_', ' ');
    };
  }

  static boolean isCommuteRoute(Map<String, Object> ride) {
    String startKind = placeKind(ride == null ? null : ride.get("matchedStartPlace"));
    String endKind = placeKind(ride == null ? null : ride.get("matchedEndPlace"));
    return ("home".equals(startKind) && "office".equals(endKind))
        || ("office".equals(startKind) && "home".equals(endKind));
  }

  static String placeLabel(Object value) {
    if (!(value instanceof Map<?, ?> place)) return "";
    return trimText(place.get("label"), 60, "");
  }

  static String placeKind(Object value) {
    if (!(value instanceof Map<?, ?> place)) return "";
    return string(place.get("kind")).toLowerCase();
  }

  static String routeShape(Map<String, Object> ride, List<Map<String, Object>> points) {
    double distanceM = Rows.numeric(ride == null ? null : ride.get("distanceM"));
    double startLat = Rows.numeric(ride == null ? null : ride.get("startLatitude"));
    double startLng = Rows.numeric(ride == null ? null : ride.get("startLongitude"));
    double endLat = Rows.numeric(ride == null ? null : ride.get("endLatitude"));
    double endLng = Rows.numeric(ride == null ? null : ride.get("endLongitude"));
    double startEndM = haversine(startLat, startLng, endLat, endLng);
    if (distanceM >= 1000 && startEndM <= Math.max(450, distanceM * 0.12)) return "loop";
    if (distanceM < 5000) return "short_hop";
    return "one_way";
  }

  static String safeLabel(Object value) {
    String label = string(value).replaceAll("\\([^)]*\\)", "").trim();
    if (label.matches(".*-?\\d+\\.\\d{3,}.*") || label.toLowerCase().startsWith("auto start") || label.toLowerCase().startsWith("auto end")) {
      return "";
    }
    return label.length() > MAX_LABEL_LENGTH ? label.substring(0, MAX_LABEL_LENGTH) : label;
  }

  static String rideKindLabel(Object kind) {
    return switch (string(kind)) {
      case "commute" -> "Commute";
      case "short_spin" -> "Short spin";
      case "city_errand" -> "City errand";
      case "long_trip" -> "Long trip";
      case "fast_ride" -> "Fast ride";
      case "night_ride" -> "Night ride";
      default -> "Scenic ride";
    };
  }

  static String allowedKind(Object value) {
    String kind = string(value);
    return List.of("commute", "short_spin", "city_errand", "long_trip", "fast_ride", "night_ride", "scenic_leisure").contains(kind) ? kind : "scenic_leisure";
  }

  static String timeTitle(Object value) {
    int hour = hour(value);
    if (hour < 5) return "Late-night";
    if (hour < 11) return "Morning";
    if (hour < 16) return "Day";
    if (hour < 20) return "Evening";
    return "Night";
  }

  static int hour(Object value) {
    try {
      return Instant.parse(String.valueOf(value)).atZone(ZoneId.systemDefault()).getHour();
    } catch (Exception ignored) {
      return 12;
    }
  }

  static double haversine(double lat1, double lon1, double lat2, double lon2) {
    double radiusM = 6371000d;
    double latDelta = Math.toRadians(lat2 - lat1);
    double lonDelta = Math.toRadians(lon2 - lon1);
    double a = Math.sin(latDelta / 2) * Math.sin(latDelta / 2)
        + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
        * Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
    return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static Map<String, Object> copyMap(Map<?, ?> map) {
    Map<String, Object> copy = new LinkedHashMap<>();
    map.forEach((key, value) -> copy.put(String.valueOf(key), value));
    return copy;
  }

  static String trimText(Object value, int maxLength, String fallback) {
    String text = string(value).trim();
    if (text.isBlank()) return fallback;
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }

  static String stringOrDefault(Object value, String fallback) {
    String text = string(value);
    return text.isBlank() ? fallback : text;
  }

  static String string(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  static double numberOrDefault(Object value, double fallback) {
    if (value instanceof Number number) return number.doubleValue();
    try {
      return Double.parseDouble(String.valueOf(value));
    } catch (Exception ignored) {
      return fallback;
    }
  }

  static double clamp(double value, double min, double max) {
    if (!Double.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
}
