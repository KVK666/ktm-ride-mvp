package com.ridepulse.api.service;

import static com.ridepulse.api.service.GoogleTimelineOverlapPolicy.*;
import static com.ridepulse.api.service.GoogleTimelinePayload.*;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.repository.TripRepository;
import java.time.Instant;
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
    List<String> clientRideIds = rides.stream().map(ImportedRide::clientRideId).toList();
    Map<String, String> foundRideIds = rideRepository.ownedRideIdsByClientIds(userId, clientRideIds);
    Map<String, String> existingRideIds = foundRideIds == null ? Map.of() : foundRideIds;
    List<ImportedRide> unmatchedRides = rides.stream()
        .filter(ride -> !existingRideIds.containsKey(ride.clientRideId()))
        .toList();
    List<Map<String, Object>> existingIntervals = List.of();
    if (!unmatchedRides.isEmpty()) {
      String rangeStart = unmatchedRides.stream().map(ImportedRide::startedAt).min(Comparator.comparing(Instant::parse)).orElseThrow();
      String rangeEnd = unmatchedRides.stream().map(ImportedRide::endedAt).max(Comparator.comparing(Instant::parse)).orElseThrow();
      existingIntervals = rideRepository.overlapsRange(userId, rangeStart, rangeEnd);
      if (existingIntervals == null) existingIntervals = List.of();
    }
    for (ImportedRide ride : rides) {
      Map<String, Object> summary = summary(ride);
      String existingRideId = existingRideIds.get(ride.clientRideId());
      if (existingRideId != null) {
        inspections.add(new RideInspection(ride, "existing", existingRideId, summary, null));
        continue;
      }

      Map<String, Object> overlap = firstOverlap(existingIntervals, ride);
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

  private static List<String> resolveRideIds(List<String> references, Set<String> ownedRideIds, Map<String, String> ownedClientRideIds) {
    List<String> resolved = new ArrayList<>();
    for (String reference : references) {
      if (ownedRideIds.contains(reference)) resolved.add(reference);
      else if (ownedClientRideIds.containsKey(reference)) resolved.add(ownedClientRideIds.get(reference));
    }
    return resolved;
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

  private static Map<String, Object> importSummary(int requested, int created, int duplicates, int overlaps) {
    return Map.of(
        "requested", requested,
        "created", created,
        "duplicates", duplicates,
        "overlaps", overlaps,
        "skipped", duplicates + overlaps);
  }

  private record RideInspection(
      ImportedRide ride,
      String status,
      String rideId,
      Map<String, Object> summary,
      Map<String, Object> overlap) {}

}
