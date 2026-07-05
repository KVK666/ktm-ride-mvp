package com.ridepulse.api.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.repository.TripRepository;
import com.ridepulse.api.utility.Rows;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class RideAiIntelligenceService {
  private static final double HIGH_TRIP_CONFIDENCE = 0.86;
  private static final int MAX_LABEL_LENGTH = 72;
  private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

  private final RideRepository rideRepository;
  private final TripRepository tripRepository;
  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final String apiKey;
  private final String model;
  private final String apiUrl;

  RideAiIntelligenceService(
      RideRepository rideRepository,
      TripRepository tripRepository,
      ObjectMapper objectMapper,
      @Value("${RIDEPULSE_AI_API_KEY:${OPENAI_API_KEY:}}") String apiKey,
      @Value("${RIDEPULSE_AI_MODEL:gpt-4o-mini}") String model,
      @Value("${RIDEPULSE_AI_URL:https://api.openai.com/v1/chat/completions}") String apiUrl) {
    this.rideRepository = rideRepository;
    this.tripRepository = tripRepository;
    this.objectMapper = objectMapper;
    this.apiKey = apiKey == null ? "" : apiKey.trim();
    this.model = model == null || model.isBlank() ? "gpt-4o-mini" : model.trim();
    this.apiUrl = apiUrl == null || apiUrl.isBlank() ? "https://api.openai.com/v1/chat/completions" : apiUrl.trim();
    this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
  }

  public void processRideAsync(String userId, String rideId) {
    try {
      rideRepository.markAiPending(userId, rideId);
    } catch (Exception ignored) {
      // Ride saving must not fail because the optional intelligence marker failed.
    }
    CompletableFuture.runAsync(() -> processRide(userId, rideId));
  }

  public void processRideIfMissingAsync(String userId, Map<String, Object> ride) {
    if (ride == null) return;
    String status = string(ride.get("aiStatus"));
    if ("ready".equals(status) || "pending".equals(status)) return;
    if (!string(ride.get("aiTitle")).isBlank() || !string(ride.get("aiSummary")).isBlank()) return;
    String rideId = string(ride.get("id"));
    if (!rideId.isBlank()) processRideAsync(userId, rideId);
  }

  public Map<String, Object> decorateIntelligence(Map<String, Object> intelligence, Map<String, Object> ride) {
    Map<String, Object> decorated = new LinkedHashMap<>(intelligence == null ? Map.of() : intelligence);
    Map<String, Object> ai = normalizeStoredAi(ride);
    if (!string(ai.get("aiTitle")).isBlank()) decorated.put("suggestedTitle", ai.get("aiTitle"));
    if (!string(ai.get("aiSummary")).isBlank()) decorated.put("summaryText", ai.get("aiSummary"));
    decorated.put("classification", Map.of(
        "rideKind", stringOrDefault(ai.get("rideKind"), "scenic_leisure"),
        "label", rideKindLabel(ai.get("rideKind")),
        "confidence", numberOrDefault(ai.get("rideKindConfidence"), 0.55),
        "reason", stringOrDefault(ai.get("rideKindReason"), "RidePulse used the route summary to classify this ride."),
        "status", stringOrDefault(ai.get("aiStatus"), "fallback")));
    decorated.put("keyInsight", stringOrDefault(ai.get("keyInsight"), stringOrDefault(decorated.get("highlightReason"), "A route worth remembering.")));
    decorated.put("bestMoment", stringOrDefault(ai.get("bestMoment"), "The saved route is ready for review."));
    decorated.put("tripAutomation", parseTripSuggestion(ai.get("tripSuggestion")));
    return decorated;
  }

  private void processRide(String userId, String rideId) {
    try {
      Map<String, Object> ride = rideRepository.findOwnedRide(userId, rideId).orElse(null);
      if (ride == null) return;
      List<Map<String, Object>> points = rideRepository.intelligencePoints(rideId);
      Map<String, Object> fallback = fallbackIntelligence(ride, points);
      Map<String, Object> ai = callAi(ride, points, userId);
      Map<String, Object> intelligence = ai.isEmpty() ? fallback : merge(fallback, ai);
      Map<String, Object> tripSuggestion = applyTripAutomation(userId, rideId, intelligence);
      intelligence.put("tripSuggestion", toJson(tripSuggestion));
      rideRepository.saveAiIntelligence(userId, rideId, intelligence);
    } catch (Exception error) {
      try {
        Map<String, Object> ride = rideRepository.findOwnedRide(userId, rideId).orElse(null);
        if (ride != null) {
          Map<String, Object> fallback = fallbackIntelligence(ride, rideRepository.intelligencePoints(rideId));
          fallback.put("aiStatus", "fallback");
          rideRepository.saveAiIntelligence(userId, rideId, fallback);
        }
      } catch (Exception ignored) {
        // Keep failures contained; ride creation and reads must stay reliable.
      }
    }
  }

  private Map<String, Object> callAi(Map<String, Object> ride, List<Map<String, Object>> points, String userId) {
    if (apiKey.isBlank()) return Map.of();
    try {
      Map<String, Object> request = Map.of(
          "model", model,
          "temperature", 0.25,
          "response_format", Map.of("type", "json_object"),
          "messages", List.of(
              Map.of("role", "system", "content", systemPrompt()),
              Map.of("role", "user", "content", toJson(aiPayload(ride, points, userId)))));
      HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(apiUrl))
          .timeout(Duration.ofSeconds(8))
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(toJson(request)))
          .build();
      HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
      if (response.statusCode() < 200 || response.statusCode() >= 300) return Map.of();
      JsonNode content = objectMapper.readTree(response.body()).path("choices").path(0).path("message").path("content");
      if (!content.isTextual()) return Map.of();
      return normalizeAiResponse(objectMapper.readValue(content.asText(), MAP_TYPE));
    } catch (Exception ignored) {
      return Map.of();
    }
  }

  private Map<String, Object> aiPayload(Map<String, Object> ride, List<Map<String, Object>> points, String userId) {
    Map<String, Object> payload = new LinkedHashMap<>();
    Map<String, Object> ridePayload = new LinkedHashMap<>();
    ridePayload.put("distanceKm", Math.round(Rows.numeric(ride.get("distanceM")) / 100d) / 10d);
    ridePayload.put("durationMinutes", Math.round(Rows.numeric(ride.get("durationS")) / 60d));
    ridePayload.put("topSpeedKmh", Math.round(Rows.numeric(ride.get("topSpeedKmh"))));
    ridePayload.put("avgSpeedKmh", Math.round(Rows.numeric(ride.get("avgSpeedKmh"))));
    ridePayload.put("startedAt", ride.get("startedAt"));
    ridePayload.put("endedAt", ride.get("endedAt"));
    ridePayload.put("startLabel", safeLabel(ride.get("startLabel")));
    ridePayload.put("endLabel", safeLabel(ride.get("endLabel")));
    ridePayload.put("routeShape", routeShape(ride, points));
    payload.put("ride", ridePayload);

    List<Map<String, Object>> trips = new ArrayList<>();
    for (Map<String, Object> trip : tripRepository.list(userId).stream().limit(8).toList()) {
      Map<String, Object> tripPayload = new LinkedHashMap<>();
      tripPayload.put("id", trip.get("id"));
      tripPayload.put("title", trip.get("title"));
      tripPayload.put("rideCount", trip.get("rideCount"));
      tripPayload.put("distanceKm", Math.round(Rows.numeric(trip.get("distanceM")) / 100d) / 10d);
      tripPayload.put("startedAt", trip.get("startedAt"));
      tripPayload.put("endedAt", trip.get("endedAt"));
      trips.add(tripPayload);
    }
    payload.put("existingTrips", trips);
    payload.put("privacy", "No full GPS trace is included. Use only this summarized route context.");
    return payload;
  }

  private String systemPrompt() {
    return """
        You are RidePulse's ride intelligence engine. Return strict JSON only.
        Name rides in human language, not as start/end place strings.
        Allowed rideKind values: commute, short_spin, city_errand, long_trip, fast_ride, night_ride, scenic_leisure.
        JSON keys: aiTitle, aiSummary, rideKind, rideKindConfidence, rideKindReason, keyInsight, bestMoment, tripSuggestion.
        tripSuggestion must be an object with action none|suggest|auto_add|auto_create, confidence, title, reason, and optional tripId.
        Use auto_add/auto_create only when confidence is very high. Otherwise use suggest or none.
        Keep copy concise and useful for a motorcyclist.
        """;
  }

  private Map<String, Object> fallbackIntelligence(Map<String, Object> ride, List<Map<String, Object>> points) {
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
    result.put("tripSuggestion", toJson(Map.of("action", "none", "confidence", 0.0, "reason", "No high-confidence trip grouping yet.")));
    result.put("aiStatus", "fallback");
    return result;
  }

  private Map<String, Object> applyTripAutomation(String userId, String rideId, Map<String, Object> intelligence) {
    Map<String, Object> suggestion = parseTripSuggestion(intelligence.get("tripSuggestion"));
    String action = string(suggestion.get("action"));
    double confidence = numberOrDefault(suggestion.get("confidence"), 0);
    if (confidence < HIGH_TRIP_CONFIDENCE) return suggestion.isEmpty() ? Map.of("action", "none", "confidence", confidence) : suggestion;
    try {
      if ("auto_add".equals(action) && !string(suggestion.get("tripId")).isBlank()) {
        tripRepository.addRide(string(suggestion.get("tripId")), rideId);
        Map<String, Object> updated = new LinkedHashMap<>(suggestion);
        updated.put("action", "auto_added");
        return updated;
      }
      if ("auto_create".equals(action)) {
        String title = trimText(suggestion.get("title"), 120, "Smart trip");
        String reason = trimText(suggestion.get("reason"), 1000, "RidePulse grouped this ride automatically.");
        String tripId = tripRepository.create(userId, title, reason);
        tripRepository.addRide(tripId, rideId);
        Map<String, Object> updated = new LinkedHashMap<>(suggestion);
        updated.put("action", "auto_created");
        updated.put("tripId", tripId);
        return updated;
      }
    } catch (Exception ignored) {
      Map<String, Object> fallback = new LinkedHashMap<>(suggestion);
      fallback.put("action", "suggest");
      fallback.put("reason", stringOrDefault(suggestion.get("reason"), "Trip automation needs confirmation."));
      return fallback;
    }
    return suggestion;
  }

  private Map<String, Object> normalizeAiResponse(Map<String, Object> raw) {
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

  private Map<String, Object> normalizeStoredAi(Map<String, Object> ride) {
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

  private Map<String, Object> normalizeTripSuggestion(Object raw) {
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

  private Map<String, Object> parseTripSuggestion(Object raw) {
    if (raw instanceof Map<?, ?> map) return normalizeTripSuggestion(copyMap(map));
    String text = string(raw);
    if (text.isBlank()) return Map.of("action", "none", "confidence", 0.0);
    try {
      return normalizeTripSuggestion(objectMapper.readValue(text, MAP_TYPE));
    } catch (Exception ignored) {
      return Map.of("action", "none", "confidence", 0.0);
    }
  }

  private Map<String, Object> merge(Map<String, Object> fallback, Map<String, Object> ai) {
    Map<String, Object> merged = new LinkedHashMap<>(fallback);
    ai.forEach((key, value) -> {
      if (value != null && !string(value).isBlank()) merged.put(key, value);
    });
    return merged;
  }

  private String fallbackKind(Map<String, Object> ride) {
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

  private String fallbackTitle(Map<String, Object> ride, String kind, List<Map<String, Object>> points) {
    String userTitle = string(ride == null ? null : ride.get("title")).trim();
    if (!userTitle.isBlank()) return userTitle;
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

  private String fallbackSummary(Map<String, Object> ride, String kind) {
    double distanceKm = Rows.numeric(ride == null ? null : ride.get("distanceM")) / 1000d;
    long minutes = Math.round(Rows.numeric(ride == null ? null : ride.get("durationS")) / 60d);
    return String.format("%s across %.1f km in %d minutes.", rideKindLabel(kind), distanceKm, minutes);
  }

  private String fallbackReason(Map<String, Object> ride, String kind) {
    return "Detected from distance, time of day, and speed profile as " + rideKindLabel(kind).toLowerCase() + ".";
  }

  private String fallbackInsight(Map<String, Object> ride, String kind) {
    if ("long_trip".equals(kind)) return "This ride has enough distance to feel like a trip chapter.";
    if ("fast_ride".equals(kind)) return "The speed profile stands out from a normal cruise.";
    if ("night_ride".equals(kind)) return "The route happened after dark, so visibility and fatigue notes may matter.";
    return "RidePulse turned the saved GPS summary into a cleaner journal entry.";
  }

  private String fallbackBestMoment(Map<String, Object> ride) {
    double topSpeed = Rows.numeric(ride == null ? null : ride.get("topSpeedKmh"));
    if (topSpeed > 0) return "Strongest speed: " + Math.round(topSpeed) + " km/h.";
    return "The complete route is saved and ready to review.";
  }

  private String routeShape(Map<String, Object> ride, List<Map<String, Object>> points) {
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

  private String safeLabel(Object value) {
    String label = string(value).replaceAll("\\([^)]*\\)", "").trim();
    if (label.matches(".*-?\\d+\\.\\d{3,}.*") || label.toLowerCase().startsWith("auto start") || label.toLowerCase().startsWith("auto end")) {
      return "";
    }
    return label.length() > MAX_LABEL_LENGTH ? label.substring(0, MAX_LABEL_LENGTH) : label;
  }

  private String rideKindLabel(Object kind) {
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

  private String allowedKind(Object value) {
    String kind = string(value);
    return List.of("commute", "short_spin", "city_errand", "long_trip", "fast_ride", "night_ride", "scenic_leisure").contains(kind) ? kind : "scenic_leisure";
  }

  private String timeTitle(Object value) {
    int hour = hour(value);
    if (hour < 5) return "Late-night";
    if (hour < 11) return "Morning";
    if (hour < 16) return "Day";
    if (hour < 20) return "Evening";
    return "Night";
  }

  private int hour(Object value) {
    try {
      return Instant.parse(String.valueOf(value)).atZone(ZoneId.systemDefault()).getHour();
    } catch (Exception ignored) {
      return 12;
    }
  }

  private double fallbackConfidence(Map<String, Object> ride, String kind) {
    if ("night_ride".equals(kind) || "long_trip".equals(kind) || "fast_ride".equals(kind)) return 0.78;
    return 0.62;
  }

  private double haversine(double lat1, double lon1, double lat2, double lon2) {
    double radiusM = 6371000d;
    double latDelta = Math.toRadians(lat2 - lat1);
    double lonDelta = Math.toRadians(lon2 - lon1);
    double a = Math.sin(latDelta / 2) * Math.sin(latDelta / 2)
        + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
        * Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
    return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private Map<String, Object> copyMap(Map<?, ?> map) {
    Map<String, Object> copy = new LinkedHashMap<>();
    map.forEach((key, value) -> copy.put(String.valueOf(key), value));
    return copy;
  }

  private String toJson(Object value) {
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ignored) {
      return "{}";
    }
  }

  private String trimText(Object value, int maxLength, String fallback) {
    String text = string(value).trim();
    if (text.isBlank()) return fallback;
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }

  private String stringOrDefault(Object value, String fallback) {
    String text = string(value);
    return text.isBlank() ? fallback : text;
  }

  private String string(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  private double numberOrDefault(Object value, double fallback) {
    if (value instanceof Number number) return number.doubleValue();
    try {
      return Double.parseDouble(String.valueOf(value));
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private double clamp(double value, double min, double max) {
    if (!Double.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
}
