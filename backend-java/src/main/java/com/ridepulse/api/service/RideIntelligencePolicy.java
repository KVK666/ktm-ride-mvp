package com.ridepulse.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.ridepulse.api.utility.Rows;
import static com.ridepulse.api.service.RideIntelligenceSupport.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.springframework.stereotype.Component;

@Component
class RideIntelligencePolicy {
  private static final TypeReference<Map<String,Object>> MAP_TYPE = new TypeReference<>() {};
  private final ObjectMapper objectMapper;

  RideIntelligencePolicy(ObjectMapper objectMapper) { this.objectMapper = objectMapper; }

  Map<String, Object> fallbackIntelligence(Map<String, Object> ride, List<Map<String, Object>> points) {
    String kind = fallbackKind(ride);
    double confidence = fallbackConfidence(ride, kind);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("aiTitle", fallbackTitle(ride, kind, points));
    result.put("aiSummary", fallbackSummary(ride, kind));
    result.put("rideKind", kind);
    result.put("rideKindConfidence", confidence);
    result.put("rideKindReason", fallbackReason(ride, kind));
    result.put("keyInsight", fallbackInsight(ride, kind));
    result.put("bestMoment", fallbackBestMoment(ride));
    result.put("tripSuggestion", toJson(fallbackTripSuggestion(ride, kind)));
    result.put("aiStatus", "fallback");
    return result;
  }

  Map<String, Object> normalizeAiResponse(Map<String, Object> raw) {
    if (raw == null || raw.isEmpty()) return Map.of();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("aiTitle", trimText(raw.get("aiTitle"), 120, null));
    result.put("aiSummary", trimText(raw.get("aiSummary"), 240, null));
    result.put("rideKind", allowedKind(raw.get("rideKind")));
    result.put("rideKindConfidence", clamp(numberOrDefault(raw.get("rideKindConfidence"), 0.55), 0, 1));
    result.put("rideKindReason", trimText(raw.get("rideKindReason"), 240, null));
    result.put("keyInsight", trimText(raw.get("keyInsight"), 220, null));
    result.put("bestMoment", trimText(raw.get("bestMoment"), 180, null));
    result.put("tripSuggestion", toJson(normalizeTripSuggestion(raw.get("tripSuggestion"))));
    result.put("aiStatus", "ready");
    return result;
  }

  Map<String, Object> normalizeTripSuggestion(Object raw) {
    Map<String, Object> source = raw instanceof Map<?, ?> map ? copyMap(map) : parseTripSuggestion(raw);
    String action = string(source.get("action"));
    if (!List.of("none", "suggest", "auto_add", "auto_create", "auto_added", "auto_created").contains(action)) {
      action = "none";
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("action", action);
    result.put("confidence", clamp(numberOrDefault(source.get("confidence"), 0), 0, 1));
    if (!string(source.get("title")).isBlank()) result.put("title", trimText(source.get("title"), 120, null));
    if (!string(source.get("reason")).isBlank()) result.put("reason", trimText(source.get("reason"), 240, null));
    if (!string(source.get("tripId")).isBlank()) result.put("tripId", string(source.get("tripId")));
    return result;
  }

  Map<String, Object> parseTripSuggestion(Object raw) {
    if (raw instanceof Map<?, ?> map) return normalizeTripSuggestion(copyMap(map));
    String text = string(raw);
    if (text.isBlank()) return Map.of("action", "none", "confidence", 0.0);
    try {
      return normalizeTripSuggestion(objectMapper.readValue(text, MAP_TYPE));
    } catch (Exception ignored) {
      return Map.of("action", "none", "confidence", 0.0);
    }
  }

  Map<String, Object> merge(Map<String, Object> fallback, Map<String, Object> ai) {
    Map<String, Object> merged = new LinkedHashMap<>(fallback);
    ai.forEach((key, value) -> {
      if (value != null && !string(value).isBlank()) merged.put(key, value);
    });
    return merged;
  }

  String fallbackKind(Map<String, Object> ride) {
    if (isCommuteRoute(ride)) return "commute";
    double distanceM = Rows.numeric(ride == null ? null : ride.get("distanceM"));
    double avgSpeed = Rows.numeric(ride == null ? null : ride.get("avgSpeedKmh"));
    double topSpeed = Rows.numeric(ride == null ? null : ride.get("topSpeedKmh"));
    int hour = hour(ride == null ? null : ride.get("startedAt"));
    if (hour >= 20 || hour < 5) return "night_ride";
    if (distanceM >= 50000) return "long_trip";
    if (topSpeed >= 95 || avgSpeed >= 70) return "fast_ride";
    if (distanceM < 5000) return "city_errand";
    if (distanceM < 12000) return "short_spin";
    return "scenic_leisure";
  }

  String fallbackTitle(Map<String, Object> ride, String kind, List<Map<String, Object>> points) {
    String userTitle = string(ride == null ? null : ride.get("title")).trim();
    if (!userTitle.isBlank()) return userTitle;
    String savedPlaceTitle = savedPlaceTitle(ride);
    if (!savedPlaceTitle.isBlank()) return savedPlaceTitle;
    String destinationTitle = destinationTitle(ride);
    if (!destinationTitle.isBlank()) return destinationTitle;
    String shape = routeShape(ride, points);
    String time = timeTitle(ride == null ? null : ride.get("startedAt"));
    String safeKind = string(kind).isBlank() ? fallbackKind(ride) : kind;
    if ("long_trip".equals(safeKind)) return time + " long ride";
    if ("fast_ride".equals(safeKind)) return "Fast " + time.toLowerCase() + " ride";
    if ("night_ride".equals(safeKind)) return "Night cruise";
    if ("city_errand".equals(safeKind)) return "Short errand ride";
    if ("short_spin".equals(safeKind)) return "Quick " + time.toLowerCase() + " spin";
    if ("loop".equals(shape)) return time + " city loop";
    return time + " ride";
  }

  String fallbackSummary(Map<String, Object> ride, String kind) {
    double distanceKm = Rows.numeric(ride == null ? null : ride.get("distanceM")) / 1000d;
    long minutes = Math.round(Rows.numeric(ride == null ? null : ride.get("durationS")) / 60d);
    String startPlace = placeLabel(ride == null ? null : ride.get("matchedStartPlace"));
    String endPlace = placeLabel(ride == null ? null : ride.get("matchedEndPlace"));
    if (!startPlace.isBlank() && !endPlace.isBlank()) {
      return String.format("%s to %s across %.1f km in %d minutes.", startPlace, endPlace, distanceKm, minutes);
    }
    String destination = safeLabel(ride == null ? null : ride.get("destinationName"));
    String category = categoryLabel(ride == null ? null : ride.get("destinationCategory"));
    if (!destination.isBlank()) {
      String purpose = category.isBlank() ? "destination" : category.toLowerCase();
      return String.format("A %.1f km ride ending at %s, a %s, in %d minutes.", distanceKm, destination, purpose, minutes);
    }
    return String.format("%s across %.1f km in %d minutes.", rideKindLabel(kind), distanceKm, minutes);
  }

  Map<String, Object> normalizeStoredAi(Map<String, Object> ride) {
    Map<String, Object> ai = new LinkedHashMap<>();
    if (ride != null) {
      ai.putAll(ride);
    }
    if (string(ai.get("aiTitle")).isBlank()) ai.put("aiTitle", fallbackTitle(ride, string(ai.get("rideKind")), List.of()));
    if (string(ai.get("aiSummary")).isBlank()) ai.put("aiSummary", fallbackSummary(ride, string(ai.get("rideKind"))));
    if (string(ai.get("rideKind")).isBlank()) ai.put("rideKind", fallbackKind(ride));
    if (ai.get("rideKindConfidence") == null) ai.put("rideKindConfidence", fallbackConfidence(ride, string(ai.get("rideKind"))));
    if (string(ai.get("rideKindReason")).isBlank()) ai.put("rideKindReason", fallbackReason(ride, string(ai.get("rideKind"))));
    return ai;
  }

  String fallbackReason(Map<String, Object> ride, String kind) {
    return "Detected from distance, time of day, and speed profile as " + rideKindLabel(kind).toLowerCase() + ".";
  }

  String fallbackInsight(Map<String, Object> ride, String kind) {
    if ("long_trip".equals(kind)) return "This ride has enough distance to feel like a trip chapter.";
    if ("fast_ride".equals(kind)) return "The speed profile stands out from a normal cruise.";
    if ("night_ride".equals(kind)) return "The route happened after dark, so visibility and fatigue notes may matter.";
    return "RidePulse turned the saved GPS summary into a cleaner journal entry.";
  }

  String fallbackBestMoment(Map<String, Object> ride) {
    double topSpeed = Rows.numeric(ride == null ? null : ride.get("topSpeedKmh"));
    if (topSpeed > 0) return "Strongest speed: " + Math.round(topSpeed) + " km/h.";
    return "The complete route is saved and ready to review.";
  }

  Map<String, Object> fallbackTripSuggestion(Map<String, Object> ride, String kind) {
    double distanceM = Rows.numeric(ride == null ? null : ride.get("distanceM"));
    long minutes = Math.round(Rows.numeric(ride == null ? null : ride.get("durationS")) / 60d);
    if ("long_trip".equals(kind) || distanceM >= 45000 || minutes >= 90) {
      return Map.of(
          "action", "suggest",
          "confidence", 0.72,
          "title", timeTitle(ride == null ? null : ride.get("startedAt")) + " trip",
          "reason", "This ride has enough distance or duration to become a trip album.");
    }
    return Map.of("action", "none", "confidence", 0.0, "reason", "No high-confidence trip grouping yet.");
  }

  double fallbackConfidence(Map<String, Object> ride, String kind) {
    if ("night_ride".equals(kind) || "long_trip".equals(kind) || "fast_ride".equals(kind)) return 0.78;
    return 0.62;
  }

  String toJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ignored) {
      return "{}";
    }
  }
}
