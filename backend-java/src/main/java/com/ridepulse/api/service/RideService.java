package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.dto.CreateRideResult;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.utility.Rows;
import com.ridepulse.api.service.PhotoValidationService.NormalizedRidePhoto;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class RideService {
  private static final int MAX_RIDE_POINTS = 12000;
  private final RideRepository rideRepository;
  private final RideMathService rideMathService;
  private final RoutePreviewService routePreviewService;
  private final JournalIntelligenceService journalIntelligenceService;
  private final PhotoValidationService photoValidationService;
  private final RideAiIntelligenceService rideAiIntelligenceService;

  RideService(
      RideRepository rideRepository,
      RideMathService rideMathService,
      RoutePreviewService routePreviewService,
      JournalIntelligenceService journalIntelligenceService,
      PhotoValidationService photoValidationService,
      RideAiIntelligenceService rideAiIntelligenceService) {
    this.rideRepository = rideRepository;
    this.rideMathService = rideMathService;
    this.routePreviewService = routePreviewService;
    this.journalIntelligenceService = journalIntelligenceService;
    this.photoValidationService = photoValidationService;
    this.rideAiIntelligenceService = rideAiIntelligenceService;
  }

  public Map<String, Object> list(String userId, String period, String query) {
    List<Map<String, Object>> rides = rideRepository.list(userId, period, query);
    return Map.of("rides", journalIntelligenceService.decorateRides(routePreviewService.attachRoutePreviews(rides), Map.of()));
  }

  public Map<String, Object> intelligence(String userId, String rideId) {
    Map<String, Object> ride = ownedRide(userId, rideId);
    rideAiIntelligenceService.processRideIfMissingAsync(userId, ride);
    Map<String, Object> statsRow = rideRepository.intelligenceStats(userId);
    Map<String, Object> context = Map.of(
        "monthDistanceM", Rows.numeric(statsRow.get("month_distance_m")),
        "longestRideDistanceM", Rows.numeric(statsRow.get("longest_ride_distance_m")));
    return Map.of("intelligence", rideAiIntelligenceService.decorateIntelligence(
        journalIntelligenceService.buildRideIntelligence(ride, rideRepository.intelligencePoints(rideId), context),
        ride));
  }

  public Map<String, Object> duplicates(String userId, String rideId) {
    requireOwnedRide(userId, rideId);
    return Map.of("duplicates", rideRepository.duplicates(userId, rideId));
  }

  public Map<String, Object> photos(String userId, String rideId) {
    requireOwnedRide(userId, rideId);
    return Map.of("photos", rideRepository.photos(userId, rideId));
  }

  @Transactional
  public Map<String, Object> addPhoto(String userId, String rideId, Map<String, Object> body) {
    requireOwnedRide(userId, rideId);
    NormalizedRidePhoto photo = photoValidationService.normalizeRidePhotoPayload(body);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("photo", rideRepository.insertPhoto(userId, rideId, photo));
    return response;
  }

  @Transactional
  public void deletePhoto(String userId, String rideId, String photoId) {
    int deleted = rideRepository.deletePhoto(userId, rideId, photoId);
    if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_PHOTO_NOT_FOUND);
  }

  public Map<String, Object> get(String userId, String rideId) {
    Map<String, Object> ride = ownedRide(userId, rideId);
    Map<String, Object> responseRide = new LinkedHashMap<>(ride);
    responseRide.put("points", rideRepository.points(rideId));
    return Map.of("ride", responseRide);
  }

  @Transactional
  public Map<String, Object> patch(String userId, String rideId, Map<String, Object> body) {
    requireOwnedRide(userId, rideId);
    String title = normalizeOptionalText(body == null ? null : body.get("title"), 120);
    String notes = normalizeOptionalText(body == null ? null : body.get("notes"), 2000);
    boolean markReviewed = Boolean.TRUE.equals(body == null ? null : body.get("markReviewed"));
    Map<String, Object> ride = rideRepository.patch(userId, rideId, title, notes, markReviewed)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND));
    return Map.of("ride", ride);
  }

  @Transactional
  public CreateRideResult create(String userId, String idempotencyKey, Map<String, Object> body) {
    Map<String, Object> safeBody = body == null ? Map.of() : body;
    String startedAt = string(safeBody.get("startedAt"));
    String endedAt = string(safeBody.get("endedAt"));
    Object pointValue = safeBody.getOrDefault("points", List.of());
    if (!isValidDate(startedAt) || !isValidDate(endedAt) || !(pointValue instanceof List<?> rawPoints) || rawPoints.size() < 2) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.ROUTE_REQUIRES_POINTS);
    }
    if (rawPoints.size() > MAX_RIDE_POINTS) {
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ProgramCodes.PAYLOAD_TOO_LARGE, String.format(Messages.RIDE_TOO_MANY_POINTS, MAX_RIDE_POINTS));
    }
    List<Map<String, Object>> points = normalizeRidePoints(rawPoints);
    if (points.size() != rawPoints.size()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.INVALID_RIDE_POINTS);
    }
    String rideClientId = normalizeOptionalText(firstNonBlank(safeBody.get("clientRideId"), idempotencyKey), 300);
    if (rideClientId != null) {
      Map<String, Object> duplicate = rideRepository.findByClientRideId(userId, rideClientId).orElse(null);
      if (duplicate != null) return new CreateRideResult(false, duplicate);
    }

    Map<String, Object> normalizedBody = new LinkedHashMap<>(safeBody);
    normalizedBody.put("startLabel", defaultText(normalizeOptionalText(safeBody.get("startLabel"), 180), Messages.DEFAULT_START_LABEL));
    normalizedBody.put("endLabel", defaultText(normalizeOptionalText(safeBody.get("endLabel"), 180), Messages.DEFAULT_END_LABEL));
    Map<String, Object> summary = rideMathService.summarizeRide(points, startedAt, endedAt);

    try {
      String rideId = rideRepository.insertRide(userId, normalizedBody, rideClientId, startedAt, endedAt, points, summary);
      rideRepository.insertPoints(rideId, points);
      afterCommit(() -> rideAiIntelligenceService.processRideAsync(userId, rideId));
      Map<String, Object> response = new LinkedHashMap<>();
      response.put("rideId", rideId);
      response.put("summary", summary);
      response.put("aiStatus", "pending");
      return new CreateRideResult(true, response);
    } catch (DuplicateKeyException error) {
      Map<String, Object> duplicate = rideRepository.findByClientRideId(userId, rideClientId).orElse(null);
      if (duplicate != null) return new CreateRideResult(false, duplicate);
      throw error;
    }
  }

  @Transactional
  public void delete(String userId, String rideId) {
    int deleted = rideRepository.delete(userId, rideId);
    if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND);
  }

  public boolean ownedRideExists(String userId, String rideId) {
    return rideRepository.ownedRideExists(userId, rideId);
  }

  private Map<String, Object> ownedRide(String userId, String rideId) {
    return rideRepository.findOwnedRide(userId, rideId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND));
  }

  private void requireOwnedRide(String userId, String rideId) {
    if (!rideRepository.ownedRideExists(userId, rideId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND);
    }
  }

  private List<Map<String, Object>> normalizeRidePoints(List<?> rawPoints) {
    List<Map<String, Object>> points = new ArrayList<>();
    for (Object raw : rawPoints) {
      if (!(raw instanceof Map<?, ?> rawMap)) return points;
      Map<String, Object> point = new LinkedHashMap<>();
      Double latitude = RideMathService.optionalNumber(rawMap.get("latitude"));
      Double longitude = RideMathService.optionalNumber(rawMap.get("longitude"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !isValidDate(rawMap.get("recordedAt"))) {
        return points;
      }
      point.put("latitude", latitude);
      point.put("longitude", longitude);
      point.put("altitudeM", RideMathService.optionalNumber(rawMap.get("altitudeM")));
      point.put("accuracyM", RideMathService.optionalNumber(rawMap.get("accuracyM")));
      point.put("speedKmh", RideMathService.optionalNumber(rawMap.get("speedKmh")));
      point.put("recordedAt", string(rawMap.get("recordedAt")));
      points.add(point);
    }
    return points;
  }

  private static String normalizeOptionalText(Object value, int maxLength) {
    if (value == null) return null;
    String normalized = String.valueOf(value).trim();
    if (normalized.isBlank()) return null;
    return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
  }

  private static Object firstNonBlank(Object first, Object second) {
    String firstText = string(first).trim();
    return firstText.isBlank() ? second : first;
  }

  private static String defaultText(String value, String fallback) {
    return value == null || value.isBlank() ? fallback : value;
  }

  private static boolean isValidDate(Object value) {
    if (!(value instanceof String string)) return false;
    try {
      Instant.parse(string);
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  private static String string(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  private static void afterCommit(Runnable action) {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCommit() {
          action.run();
        }
      });
      return;
    }
    action.run();
  }
}
