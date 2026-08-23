package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.repository.TripRepository;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Normalizes the mobile Google Timeline export contract before it reaches JDBC. */
@Service
public class GoogleTimelineImportService {
  static final int MAX_RIDES_PER_BATCH = 50;
  static final int MAX_TRIPS_PER_BATCH = 50;
  static final int MAX_RIDES_PER_TRIP = 50;
  static final int MAX_POINTS_PER_RIDE = 12000;
  static final int MAX_TOTAL_POINTS_PER_BATCH = 200000;
  private static final int MAX_TEXT_LENGTH = 300;

  private final RideRepository rideRepository;
  private final TripRepository tripRepository;
  private final RideMathService rideMathService;

  GoogleTimelineImportService(
      RideRepository rideRepository,
      TripRepository tripRepository,
      RideMathService rideMathService) {
    this.rideRepository = rideRepository;
    this.tripRepository = tripRepository;
    this.rideMathService = rideMathService;
  }

  public Map<String, Object> check(String userId, Map<String, Object> body) {
    if (!hasRidePayload(body)) return checkClientRideIds(userId, body);
    List<ImportedRide> rides = normalizeRides(body);
    List<RideInspection> inspections = inspect(userId, rides);
    return withImportMetadata(body, responseForInspections(inspections));
  }

  @Transactional
  public Map<String, Object> importRides(String userId, Map<String, Object> body) {
    List<ImportedRide> rides = normalizeRides(body);
    List<RideInspection> inspections = inspect(userId, rides);
    Set<String> allowedOverlaps = allowedOverlapIds(body);
    List<Map<String, Object>> results = new ArrayList<>();
    int created = 0;
    int duplicates = 0;
    int overlaps = 0;

    for (RideInspection inspection : inspections) {
      ImportedRide ride = inspection.ride();
      Map<String, Object> result = new LinkedHashMap<>();
      result.put("clientRideId", ride.clientRideId());
      result.put("summary", inspection.summary());
      result.put("status", inspection.status());
      result.put("rideId", inspection.rideId());

      boolean overlapAllowed = "probable_overlap".equals(inspection.status())
          && (Boolean.TRUE.equals(first(body, "allowOverlap", "allow_overlap"))
              || Boolean.TRUE.equals(ride.body().get("allowOverlap"))
              || allowedOverlaps.contains(ride.clientRideId()));
      if ("new".equals(inspection.status()) || overlapAllowed) {
        String rideId = rideRepository.insertImportedRide(
            userId,
            ride.body(),
            ride.clientRideId(),
            ride.startedAt(),
            ride.endedAt(),
            ride.points(),
            inspection.summary());
        if (rideId == null || rideId.isBlank()) {
          Map<String, Object> duplicate = rideRepository.findByClientRideId(userId, ride.clientRideId()).orElse(null);
          if (duplicate == null) {
            throw new ApiException(HttpStatus.CONFLICT, ProgramCodes.CONFLICT, Messages.REQUEST_CONFLICT);
          }
          result.put("status", "existing");
          result.put("rideId", first(duplicate, "rideId", "id"));
          duplicates += 1;
        } else {
          rideRepository.insertPoints(rideId, ride.points());
          result.put("status", "created");
          if (overlapAllowed) result.put("overlapConfirmed", true);
          result.put("rideId", rideId);
          created += 1;
        }
      } else if ("existing".equals(inspection.status())) {
        duplicates += 1;
      } else {
        result.put("status", "conflict");
        overlaps += 1;
      }
      results.add(result);
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("rides", results);
    response.put("summary", importSummary(rides.size(), created, duplicates, overlaps));
    response.put("created", created > 0);
    return response;
  }

  @Transactional
  public Map<String, Object> importTrips(String userId, Map<String, Object> body) {
    List<ImportedTrip> trips = normalizeTrips(body);
    List<String> requestedRideIds = trips.stream()
        .flatMap(trip -> trip.rideReferences().stream())
        .distinct()
        .toList();
    Set<String> ownedRideIds = new HashSet<>(rideRepository.ownedRideIdsFresh(userId, requestedRideIds));
    Map<String, String> ownedClientRideIds = rideRepository.ownedRideIdsByClientIds(userId, requestedRideIds);

    List<Map<String, Object>> results = new ArrayList<>();
    int created = 0;
    int updated = 0;
    int addedRides = 0;
    for (ImportedTrip trip : trips) {
      List<String> resolvedRideIds = resolveRideIds(trip.rideReferences(), ownedRideIds, ownedClientRideIds);
      if (resolvedRideIds.size() != trip.rideReferences().size()) {
        throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.GOOGLE_TIMELINE_RIDE_NOT_FOUND);
      }

      Map<String, Object> existingTrip = tripRepository.findByClientTripId(userId, trip.clientTripId()).orElse(null);
      boolean existing = existingTrip != null;
      String tripId = existing ? text(first(existingTrip, "id", "tripId"))
          : tripRepository.createImported(userId, trip.title(), trip.description(), trip.clientTripId());
      if (tripId == null || tripId.isBlank()) {
        tripId = tripRepository.findByClientTripId(userId, trip.clientTripId())
            .map(value -> text(first(value, "id", "tripId")))
            .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, ProgramCodes.CONFLICT, Messages.REQUEST_CONFLICT));
      }
      int added = tripRepository.addRides(tripId, resolvedRideIds);
      if (added > 0) tripRepository.touch(userId, tripId);
      addedRides += added;
      if (existing) updated += 1;
      else created += 1;

      Map<String, Object> result = new LinkedHashMap<>();
      result.put("clientTripId", trip.clientTripId());
      result.put("tripId", tripId);
      result.put("status", existing ? "updated" : "created");
      result.put("rideIds", resolvedRideIds);
      result.put("addedRideCount", added);
      results.add(result);
    }

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("trips", results);
    response.put("summary", Map.of(
        "requested", trips.size(),
        "created", created,
        "updated", updated,
        "ridesAdded", addedRides));
    response.put("created", created > 0);
    return response;
  }

  private List<RideInspection> inspect(String userId, List<ImportedRide> rides) {
    List<RideInspection> inspections = new ArrayList<>();
    List<ImportedRide> acceptedInBatch = new ArrayList<>();
    for (ImportedRide ride : rides) {
      Map<String, Object> duplicate = rideRepository.findByClientRideId(userId, ride.clientRideId()).orElse(null);
      Map<String, Object> summary = summary(ride);
      if (duplicate != null) {
        inspections.add(new RideInspection(ride, "existing", text(first(duplicate, "rideId", "id")), summary, null));
        continue;
      }

      List<Map<String, Object>> overlaps = rideRepository.overlaps(userId, ride.startedAt(), ride.endedAt());
      Map<String, Object> overlap = overlaps.isEmpty() ? null : overlaps.get(0);
      if (overlap == null) {
        overlap = batchOverlap(acceptedInBatch, ride);
      }
      if (overlap != null) {
        inspections.add(new RideInspection(ride, "probable_overlap", text(overlap.get("rideId")), summary, overlap));
      } else {
        acceptedInBatch.add(ride);
        inspections.add(new RideInspection(ride, "new", null, summary, null));
      }
    }
    return inspections;
  }

  private Map<String, Object> checkClientRideIds(String userId, Map<String, Object> body) {
    Object rawIds = first(body, "clientRideIds", "client_ride_ids", "candidateIds", "candidate_ids");
    if (!(rawIds instanceof List<?> values) || values.isEmpty()) {
      throw badRequest(Messages.GOOGLE_TIMELINE_RIDES_REQUIRED);
    }
    if (values.size() > MAX_RIDES_PER_BATCH) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ProgramCodes.PAYLOAD_TOO_LARGE, Messages.GOOGLE_TIMELINE_RIDE_LIMIT);
    }
    LinkedHashSet<String> ids = new LinkedHashSet<>();
    for (Object value : values) {
      String id = optionalText(value, MAX_TEXT_LENGTH);
      if (id == null) throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_ID_REQUIRED);
      if (!ids.add(id)) throw badRequest("Google Timeline ride client ids must be unique within a batch");
    }
    Map<String, String> owned = rideRepository.ownedRideIdsByClientIds(userId, new ArrayList<>(ids));
    List<Map<String, Object>> rides = new ArrayList<>();
    List<String> existingIds = new ArrayList<>();
    for (String id : ids) {
      String rideId = owned.get(id);
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("clientRideId", id);
      row.put("candidateId", id);
      row.put("status", rideId == null ? "new" : "existing");
      row.put("rideId", rideId);
      if (rideId != null) existingIds.add(id);
      rides.add(row);
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("rides", rides);
    response.put("existingCandidateIds", existingIds);
    response.put("existingClientRideIds", existingIds);
    response.put("summary", Map.of(
        "requested", ids.size(),
        "new", ids.size() - existingIds.size(),
        "duplicates", existingIds.size(),
        "overlaps", 0));
    response.put("canImport", existingIds.size() < ids.size());
    return withImportMetadata(body, response);
  }

  private static boolean hasRidePayload(Map<String, Object> body) {
    return body != null && (first(body, "rides", "segments", "candidates") instanceof List<?>);
  }

  private static Map<String, Object> withImportMetadata(Map<String, Object> body, Map<String, Object> response) {
    String importId = optionalText(first(body, "importId", "import_id"), MAX_TEXT_LENGTH);
    String sourceHash = optionalText(first(body, "sourceHash", "source_hash"), MAX_TEXT_LENGTH);
    if (importId != null) response.put("importId", importId);
    if (sourceHash != null) response.put("sourceHash", sourceHash);
    return response;
  }

  private Map<String, Object> responseForInspections(List<RideInspection> inspections) {
    List<Map<String, Object>> rides = new ArrayList<>();
    List<String> existingIds = new ArrayList<>();
    int fresh = 0;
    int duplicates = 0;
    int overlaps = 0;
    for (RideInspection inspection : inspections) {
      Map<String, Object> row = new LinkedHashMap<>();
      row.put("clientRideId", inspection.ride().clientRideId());
      row.put("candidateId", inspection.ride().clientRideId());
      row.put("status", inspection.status());
      row.put("rideId", inspection.rideId());
      row.put("summary", inspection.summary());
      if (inspection.overlap() != null) row.put("overlap", inspection.overlap());
      if ("existing".equals(inspection.status())) existingIds.add(inspection.ride().clientRideId());
      rides.add(row);
      switch (inspection.status()) {
        case "new" -> fresh += 1;
        case "existing" -> duplicates += 1;
        default -> overlaps += 1;
      }
    }
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("rides", rides);
    response.put("existingCandidateIds", existingIds);
    response.put("existingClientRideIds", existingIds);
    response.put("summary", Map.of(
        "requested", inspections.size(),
        "new", fresh,
        "duplicates", duplicates,
        "overlaps", overlaps));
    response.put("canImport", fresh > 0);
    return response;
  }

  private List<ImportedRide> normalizeRides(Map<String, Object> body) {
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

  private ImportedRide normalizeRide(Object value) {
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

  private List<Map<String, Object>> normalizePoints(List<?> values) {
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

  private List<ImportedTrip> normalizeTrips(Map<String, Object> body) {
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

  private static List<String> resolveRideIds(List<String> references, Set<String> ownedRideIds, Map<String, String> ownedClientRideIds) {
    List<String> resolved = new ArrayList<>();
    for (String reference : references) {
      if (ownedRideIds.contains(reference)) resolved.add(reference);
      else if (ownedClientRideIds.containsKey(reference)) resolved.add(ownedClientRideIds.get(reference));
    }
    return resolved;
  }

  private static Map<String, Object> batchOverlap(List<ImportedRide> accepted, ImportedRide candidate) {
    Instant start = Instant.parse(candidate.startedAt());
    Instant end = Instant.parse(candidate.endedAt());
    for (ImportedRide prior : accepted) {
      if (start.isBefore(Instant.parse(prior.endedAt())) && end.isAfter(Instant.parse(prior.startedAt()))) {
        return Map.of("clientRideId", prior.clientRideId(), "source", "batch");
      }
    }
    return null;
  }

  private Map<String, Object> summary(ImportedRide ride) {
    double distanceM = ride.sourceDistanceM();
    int durationS = Math.max(0, (int) ((Instant.parse(ride.endedAt()).toEpochMilli() - Instant.parse(ride.startedAt()).toEpochMilli()) / 1000));
    double averageSpeedKmh = durationS > 0 ? distanceM / 1000d / (durationS / 3600d) : 0;
    Double peakSpeedKmh = estimatedPeakSpeedKmh(ride.points());
    ride.body().put("speedDataQuality", peakSpeedKmh == null ? "unavailable" : "estimated");
    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("distanceM", Math.round(distanceM));
    summary.put("durationS", durationS);
    summary.put("topSpeedKmh", peakSpeedKmh == null ? 0d : Math.round(peakSpeedKmh * 10) / 10d);
    summary.put("avgSpeedKmh", Math.round(averageSpeedKmh * 10) / 10d);
    return summary;
  }

  private Double estimatedPeakSpeedKmh(List<Map<String, Object>> points) {
    List<Double> speeds = new ArrayList<>();
    for (int index = 1; index < points.size(); index += 1) {
      Map<String, Object> previous = points.get(index - 1);
      Map<String, Object> current = points.get(index);
      Long startedAt = RideMathService.timestampMs(previous.get("recordedAt"));
      Long endedAt = RideMathService.timestampMs(current.get("recordedAt"));
      if (startedAt == null || endedAt == null) continue;
      long elapsedMs = endedAt - startedAt;
      if (elapsedMs < 1_000 || elapsedMs > 15 * 60_000) continue;
      double distanceM = rideMathService.distanceMeters(previous, current);
      if (distanceM < 5) continue;
      double speedKmh = distanceM / (elapsedMs / 1000d) * 3.6d;
      if (Double.isFinite(speedKmh) && speedKmh > 0 && speedKmh <= 250) speeds.add(speedKmh);
    }
    if (speeds.size() < 3) return null;
    speeds.sort(Double::compareTo);
    int percentileIndex = Math.max(0, (int) Math.ceil(speeds.size() * 0.85d) - 1);
    return speeds.get(Math.min(percentileIndex, speeds.size() - 1));
  }

  private static Set<String> allowedOverlapIds(Map<String, Object> body) {
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

  private static Map<String, Object> importSummary(int requested, int created, int duplicates, int overlaps) {
    return Map.of(
        "requested", requested,
        "created", created,
        "duplicates", duplicates,
        "overlaps", overlaps,
        "skipped", duplicates + overlaps);
  }

  private static Map<String, Object> asMap(Object value, String message) {
    if (!(value instanceof Map<?, ?> map)) throw badRequest(message);
    return asMap(map, message);
  }

  private static Map<String, Object> asMap(Map<?, ?> value, String message) {
    Map<String, Object> result = new LinkedHashMap<>();
    for (Map.Entry<?, ?> entry : value.entrySet()) {
      if (entry.getKey() != null) result.put(String.valueOf(entry.getKey()), entry.getValue());
    }
    return result;
  }

  private static Map<String, Object> asMapOrNull(Object value) {
    return value instanceof Map<?, ?> map ? asMap(map, "") : null;
  }

  private static Object first(Map<String, Object> map, String... keys) {
    if (map == null) return null;
    for (String key : keys) {
      if (map.containsKey(key) && map.get(key) != null) return map.get(key);
    }
    return null;
  }

  private static String requiredText(Object value, int maxLength, String message) {
    String text = optionalText(value, maxLength);
    if (text == null) throw badRequest(message);
    return text;
  }

  private static String optionalText(Object value, int maxLength) {
    if (value == null) return null;
    String text = String.valueOf(value).trim();
    if (text.isBlank()) return null;
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }

  private static Instant requiredInstant(Object value) {
    Instant instant = parseInstant(value);
    if (instant == null) throw badRequest(Messages.GOOGLE_TIMELINE_RIDE_INVALID);
    return instant;
  }

  private static Instant parseInstant(Object value) {
    if (value == null) return null;
    try {
      return Instant.parse(String.valueOf(value).trim());
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  private static Double number(Object value) {
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

  private static Integer integer(Object value) {
    if (value == null) return null;
    if (value instanceof Number number) return number.intValue();
    try {
      return Integer.valueOf(String.valueOf(value).trim());
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  private static double numeric(Object value) {
    Double number = number(value);
    return number == null ? 0 : number;
  }

  private static String text(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static String defaultText(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  private static ApiException badRequest(String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, message);
  }

  private record ImportedRide(
      String clientRideId,
      String startedAt,
      String endedAt,
      List<Map<String, Object>> points,
      Map<String, Object> body,
      Double sourceDistanceM,
      Integer sourceDurationS) {}

  private record RideInspection(
      ImportedRide ride,
      String status,
      String rideId,
      Map<String, Object> summary,
      Map<String, Object> overlap) {}

  private record ImportedTrip(
      String clientTripId,
      String title,
      String description,
      List<String> rideReferences) {}
}
