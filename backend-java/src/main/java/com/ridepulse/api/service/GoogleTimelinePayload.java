package com.ridepulse.api.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import org.springframework.http.HttpStatus;
import java.time.format.DateTimeParseException;

final class GoogleTimelinePayload {
  private GoogleTimelinePayload() {}
  static final int MAX_RIDES_PER_BATCH = 50;
  static final int MAX_TRIPS_PER_BATCH = 50;
  static final int MAX_RIDES_PER_TRIP = 50;
  static final int MAX_POINTS_PER_RIDE = 12000;
  static final int MAX_TOTAL_POINTS_PER_BATCH = 200000;
  static final int MAX_TEXT_LENGTH = 300;

  static boolean hasRidePayload(Map<String, Object> body) {
    return body != null && (first(body, "rides", "segments", "candidates") instanceof List<?>);
  }

  static Map<String, Object> withImportMetadata(Map<String, Object> body, Map<String, Object> response) {
    String importId = optionalText(first(body, "importId", "import_id"), MAX_TEXT_LENGTH);
    String sourceHash = optionalText(first(body, "sourceHash", "source_hash"), MAX_TEXT_LENGTH);
    if (importId != null) response.put("importId", importId);
    if (sourceHash != null) response.put("sourceHash", sourceHash);
    return response;
  }

  static List<ImportedRide> normalizeRides(Map<String, Object> body) {
    Object rawRides = first(body, "rides", "segments", "candidates");
    if (!(rawRides instanceof List<?> values) || values.isEmpty()) {
      throw badRequest(Messages.GOOGLE_TIMELINE_RIDES_REQUIRED);
    }
    if (values.size() > MAX_RIDES_PER_BATCH) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ProgramCodes.PAYLOAD_TOO_LARGE, Messages.GOOGLE_TIMELINE_RIDE_LIMIT);
    }
    List<ImportedRide> rides = new ArrayList<>();
    Set<String> clientIds = new HashSet<>();
    int totalPoints = 0;
    for (Object value : values) {
      ImportedRide ride = normalizeRide(value);
      if (!clientIds.add(ride.clientRideId())) {
        throw badRequest("Google Timeline ride client ids must be unique within a batch");
      }
      totalPoints += ride.points().size();
      if (totalPoints > MAX_TOTAL_POINTS_PER_BATCH) {
        throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ProgramCodes.PAYLOAD_TOO_LARGE, Messages.GOOGLE_TIMELINE_POINTS_LIMIT);
      }
      rides.add(ride);
    }
    return rides;
  }

  static ImportedRide normalizeRide(Object value) {
    Map<String, Object> raw = asMap(value, Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    String clientRideId = requiredText(first(raw, "clientRideId", "client_ride_id", "id"), MAX_TEXT_LENGTH, Messages.GOOGLE_TIMELINE_RIDE_ID_REQUIRED);
    Instant started = requiredInstant(first(raw, "startedAt", "started_at", "startTime"));
    Instant ended = requiredInstant(first(raw, "endedAt", "ended_at", "endTime"));
    if (!ended.isAfter(started)) throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);

    Object rawPoints = first(raw, "points", "timelinePath", "path");
    if (!(rawPoints instanceof List<?> values) || values.size() < 2) {
      throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    }
    if (values.size() > MAX_POINTS_PER_RIDE) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ProgramCodes.PAYLOAD_TOO_LARGE, Messages.GOOGLE_TIMELINE_POINTS_LIMIT);
    }
    List<Map<String, Object>> points = normalizePoints(values);
    if (points.size() < 2) throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    points.sort(Comparator.comparing(point -> requiredInstant(point.get("recordedAt"))));

    String sourceActivityType = optionalText(first(raw, "sourceActivityType", "source_activity_type", "activityType"), 80);
    if (!"MOTORCYCLING".equals(sourceActivityType) && !"IN_PASSENGER_VEHICLE".equals(sourceActivityType)) {
      throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    }
    Double sourceDistanceM = number(first(raw, "distanceMeters", "distanceM", "distance_m"));
    if (sourceDistanceM == null || sourceDistanceM < 500 || sourceDistanceM > 10_000_000) {
      throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    }
    Integer sourceDurationS = integer(first(raw, "durationS", "durationSeconds", "duration_s"));
    if (sourceDurationS != null && (sourceDurationS < 0 || sourceDurationS > 7 * 24 * 60 * 60)) {
      throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    }
    int timestampDurationS = Math.max(0, (int) ((ended.toEpochMilli() - started.toEpochMilli()) / 1000));
    if (timestampDurationS < 120) throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    for (Map<String, Object> point : points) {
      Instant recordedAt = requiredInstant(point.get("recordedAt"));
      if (recordedAt.isBefore(started) || recordedAt.isAfter(ended)) {
        throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
      }
    }
    Map<String, Object> normalized = new LinkedHashMap<>();
    normalized.put("startLabel", defaultText(optionalText(first(raw, "startLabel", "start_label"), 180), Messages.DEFAULT_START_LABEL));
    normalized.put("endLabel", defaultText(optionalText(first(raw, "endLabel", "end_label"), 180), Messages.DEFAULT_END_LABEL));
    normalized.put("source", "google_timeline");
    normalized.put("sourceActivityType", sourceActivityType);
    normalized.put("speedDataQuality", "unavailable");
    normalized.put("aiStatus", "deferred");
    normalized.put("allowOverlap", Boolean.TRUE.equals(first(raw, "allowOverlap", "allow_overlap")));
    return new ImportedRide(clientRideId, started.toString(), ended.toString(), points, normalized, sourceDistanceM, sourceDurationS);
  }

  static List<Map<String, Object>> normalizePoints(List<?> values) {
    List<Map<String, Object>> points = new ArrayList<>();
    for (Object value : values) {
      Map<String, Object> raw = asMap(value, Messages.GOOGLE_TIMELINE_RIDE_INVALID);
      Map<String, Object> location = asMapOrNull(first(raw, "location", "coordinate"));
      Object latitudeValue = first(raw, "latitude", "lat");
      Object longitudeValue = first(raw, "longitude", "lng", "lon");
      if (location != null) {
        latitudeValue = first(location, "latitude", "lat");
        longitudeValue = first(location, "longitude", "lng", "lon");
      }
      Double latitude = number(latitudeValue);
      Double longitude = number(longitudeValue);
      Instant recordedAt = parseInstant(first(raw, "recordedAt", "recorded_at", "timestamp", "time"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || recordedAt == null) {
        throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
      }
      Map<String, Object> point = new LinkedHashMap<>();
      point.put("latitude", latitude);
      point.put("longitude", longitude);
      point.put("altitudeM", number(first(raw, "altitudeM", "altitude_m", "altitude")));
      point.put("accuracyM", number(first(raw, "accuracyM", "accuracy_m", "accuracy")));
      Double speedKmh = number(first(raw, "speedKmh", "speed_kmh", "speed"));
      if (speedKmh != null && (speedKmh < 0 || speedKmh > 250)) speedKmh = null;
      point.put("speedKmh", speedKmh);
      point.put("recordedAt", recordedAt.toString());
      points.add(point);
    }
    return points;
  }

  static List<ImportedTrip> normalizeTrips(Map<String, Object> body) {
    Object rawTrips = first(body, "trips", "groups");
    if (!(rawTrips instanceof List<?> values) || values.isEmpty()) {
      throw badRequest(Messages.GOOGLE_TIMELINE_TRIPS_REQUIRED);
    }
    if (values.size() > MAX_TRIPS_PER_BATCH) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ProgramCodes.PAYLOAD_TOO_LARGE, Messages.GOOGLE_TIMELINE_TRIP_LIMIT);
    }
    List<ImportedTrip> trips = new ArrayList<>();
    Set<String> clientTripIds = new HashSet<>();
    for (Object value : values) {
      Map<String, Object> raw = asMap(value, Messages.GOOGLE_TIMELINE_TRIP_INVALID);
      String clientTripId = requiredText(first(raw, "clientTripId", "client_trip_id", "id"), MAX_TEXT_LENGTH, Messages.GOOGLE_TIMELINE_TRIP_INVALID);
      if (!clientTripIds.add(clientTripId)) throw badRequest("Google Timeline trip client ids must be unique within a batch");
      String title = defaultText(optionalText(first(raw, "title", "name"), 120), "Imported Google Timeline trip");
      String description = optionalText(first(raw, "description", "notes"), 1000);
      Object rawRideReferences = first(raw, "rideClientIds", "ride_client_ids", "rideIds", "ride_ids", "rides", "candidates");
      if (!(rawRideReferences instanceof List<?> references) || references.isEmpty() || references.size() > MAX_RIDES_PER_TRIP) {
        throw badRequest(Messages.GOOGLE_TIMELINE_TRIP_INVALID);
      }
      LinkedHashSet<String> rideReferences = new LinkedHashSet<>();
      for (Object reference : references) {
        if (reference instanceof Map<?, ?> map) {
          reference = first(asMap(map, Messages.GOOGLE_TIMELINE_TRIP_INVALID), "clientRideId", "client_ride_id", "rideId", "ride_id", "id");
        }
        String id = optionalText(reference, MAX_TEXT_LENGTH);
        if (id == null) throw badRequest(Messages.GOOGLE_TIMELINE_TRIP_INVALID);
        rideReferences.add(id);
      }
      if (rideReferences.isEmpty()) throw badRequest(Messages.GOOGLE_TIMELINE_TRIP_INVALID);
      trips.add(new ImportedTrip(clientTripId, title, description, List.copyOf(rideReferences)));
    }
    return trips;
  }

  static Set<String> allowedOverlapIds(Map<String, Object> body) {
    Set<String> ids = new LinkedHashSet<>();
    Object raw = first(body, "allowOverlapClientRideIds", "allow_overlap_client_ride_ids", "confirmedOverlapClientRideIds");
    if (raw instanceof List<?> values) {
      for (Object value : values) {
        String id = optionalText(value, MAX_TEXT_LENGTH);
        if (id != null) ids.add(id);
      }
    }
    return ids;
  }

  static Map<String, Object> asMap(Object value, String message) {
    if (!(value instanceof Map<?, ?> map)) throw badRequest(message);
    return asMap(map, message);
  }

  static Map<String, Object> asMap(Map<?, ?> value, String message) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (Map.Entry<?, ?> entry : value.entrySet()) {
      if (entry.getKey() != null) result.put(String.valueOf(entry.getKey()), entry.getValue());
    }
    return result;
  }

  static Map<String, Object> asMapOrNull(Object value) {
    return value instanceof Map<?, ?> map ? asMap(map, "") : null;
  }

  static Object first(Map<String, Object> map, String... keys) {
    if (map == null) return null;
    for (String key : keys) {
      if (map.containsKey(key) && map.get(key) != null) return map.get(key);
    }
    return null;
  }

  static String requiredText(Object value, int maxLength, String message) {
    String text = optionalText(value, maxLength);
    if (text == null) throw badRequest(message);
    return text;
  }

  static String optionalText(Object value, int maxLength) {
    if (value == null) return null;
    String text = String.valueOf(value).trim();
    if (text.isBlank()) return null;
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }

  static Instant requiredInstant(Object value) {
    Instant instant = parseInstant(value);
    if (instant == null) throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    return instant;
  }

  static Instant parseInstant(Object value) {
    if (value == null) return null;
    try {
      return Instant.parse(String.valueOf(value).trim());
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  static Double number(Object value) {
    if (value == null) return null;
    if (value instanceof Number number) {
      double result = number.doubleValue();
      return Double.isFinite(result) ? result : null;
    }
    try {
      double result = Double.parseDouble(String.valueOf(value).trim());
      return Double.isFinite(result) ? result : null;
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  static Integer integer(Object value) {
    if (value == null) return null;
    if (value instanceof Number number) return number.intValue();
    try {
      return Integer.valueOf(String.valueOf(value).trim());
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  static double numeric(Object value) {
    Double number = number(value);
    return number == null ? 0 : number;
  }

  static String text(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  static String defaultText(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  static ApiException badRequest(String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, message);
  }

  record ImportedRide(
      String clientRideId,
      String startedAt,
      String endedAt,
      List<Map<String, Object>> points,
      Map<String, Object> body,
      Double sourceDistanceM,
      Integer sourceDurationS) {}

  record ImportedTrip(
      String clientTripId,
      String title,
      String description,
      List<String> rideReferences) {}
}
