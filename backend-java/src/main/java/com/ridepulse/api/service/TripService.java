package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.TripRepository;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripService {
  private final TripRepository tripRepository;
  private final RideService rideService;
  private final RoutePreviewService routePreviewService;
  private final JournalIntelligenceService journalIntelligenceService;

  TripService(
      TripRepository tripRepository,
      RideService rideService,
      RoutePreviewService routePreviewService,
      JournalIntelligenceService journalIntelligenceService) {
    this.tripRepository = tripRepository;
    this.rideService = rideService;
    this.routePreviewService = routePreviewService;
    this.journalIntelligenceService = journalIntelligenceService;
  }

  public Map<String, Object> list(String userId) {
    return Map.of("trips", tripRepository.list(userId));
  }

  public Map<String, Object> get(String userId, String tripId) {
    Map<String, Object> trip = tripRepository.find(userId, tripId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.TRIP_NOT_FOUND));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("trip", trip);
    response.put("rides", decoratedRides(userId, tripId));
    return response;
  }

  @Transactional
  public Map<String, Object> create(String userId, Map<String, Object> body) {
    String title = requiredText(body == null ? null : body.get("title"), 120);
    String description = optionalText(body == null ? null : body.get("description"), 1000);
    String tripId = tripRepository.create(userId, title, description);
    return getFresh(userId, tripId);
  }

  @Transactional
  public Map<String, Object> update(String userId, String tripId, Map<String, Object> body) {
    String title = requiredText(body == null ? null : body.get("title"), 120);
    String description = optionalText(body == null ? null : body.get("description"), 1000);
    int updated = tripRepository.update(userId, tripId, title, description);
    if (updated == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.TRIP_NOT_FOUND);
    }
    return getFresh(userId, tripId);
  }

  @Transactional
  public void delete(String userId, String tripId) {
    int deleted = tripRepository.delete(userId, tripId);
    if (deleted == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.TRIP_NOT_FOUND);
    }
  }

  @Transactional
  public Map<String, Object> addRide(String userId, String tripId, Map<String, Object> body) {
    String rideId = requiredId(body == null ? null : body.get("rideId"));
    requireTrip(userId, tripId);
    if (!rideService.ownedRideExistsFresh(userId, rideId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND);
    }
    int added = tripRepository.addRide(tripId, rideId);
    if (added > 0) {
      tripRepository.touch(userId, tripId);
    }
    return getFresh(userId, tripId);
  }

  @Transactional
  public Map<String, Object> removeRide(String userId, String tripId, String rideId) {
    requireTrip(userId, tripId);
    int removed = tripRepository.removeRide(tripId, rideId);
    if (removed > 0) {
      tripRepository.touch(userId, tripId);
    }
    return getFresh(userId, tripId);
  }

  private Object decoratedRides(String userId, String tripId) {
    return journalIntelligenceService.decorateRides(routePreviewService.attachRoutePreviews(tripRepository.rides(userId, tripId)), Map.of());
  }

  private Map<String, Object> getFresh(String userId, String tripId) {
    Map<String, Object> trip = tripRepository.findFresh(userId, tripId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.TRIP_NOT_FOUND));
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("trip", trip);
    response.put("rides", decoratedRidesFresh(userId, tripId));
    return response;
  }

  private Object decoratedRidesFresh(String userId, String tripId) {
    return journalIntelligenceService.decorateRides(routePreviewService.attachRoutePreviews(tripRepository.ridesFresh(userId, tripId)), Map.of());
  }

  private void requireTrip(String userId, String tripId) {
    if (tripRepository.findFresh(userId, tripId).isEmpty()) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.TRIP_NOT_FOUND);
    }
  }

  private static String requiredId(Object value) {
    String text = value == null ? "" : String.valueOf(value).trim();
    if (text.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.RIDE_NOT_FOUND);
    }
    return text;
  }

  private static String requiredText(Object value, int maxLength) {
    String text = optionalText(value, maxLength);
    if (text == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.TRIP_TITLE_REQUIRED);
    }
    return text;
  }

  private static String optionalText(Object value, int maxLength) {
    if (value == null) return null;
    String text = String.valueOf(value).trim();
    if (text.isBlank()) return null;
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }
}
