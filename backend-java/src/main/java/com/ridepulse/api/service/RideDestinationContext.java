package com.ridepulse.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static com.ridepulse.api.service.RideIntelligenceSupport.*;
import com.ridepulse.api.repository.SavedPlaceRepository;
import com.ridepulse.api.service.DestinationPlaceService.DestinationPlace;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
class RideDestinationContext {
  private static final Logger log = LoggerFactory.getLogger(RideDestinationContext.class);
  private final SavedPlaceRepository savedPlaceRepository;
  private final DestinationPlaceService destinationPlaceService;

  RideDestinationContext(SavedPlaceRepository savedPlaceRepository, DestinationPlaceService destinationPlaceService) {
    this.savedPlaceRepository = savedPlaceRepository;
    this.destinationPlaceService = destinationPlaceService;
  }

  Map<String, Object> matchSavedPlaces(String userId, Map<String, Object> ride) {
    Map<String, Object> matched = new LinkedHashMap<>(ride == null ? Map.of() : ride);
    if (userId == null || userId.isBlank() || ride == null || savedPlaceRepository == null) return matched;
    try {
      List<Map<String, Object>> places = savedPlaceRepository.list(userId);
      nearestPlace(places, ride.get("startLatitude"), ride.get("startLongitude"))
          .ifPresent(place -> matched.put("matchedStartPlace", place));
      nearestPlace(places, ride.get("endLatitude"), ride.get("endLongitude"))
          .ifPresent(place -> matched.put("matchedEndPlace", place));
    } catch (Exception error) {
      log.warn("ride saved-place matching failed message={}", error.getMessage());
    }
    return matched;
  }

  java.util.Optional<Map<String, Object>> nearestPlace(List<Map<String, Object>> places, Object latitudeValue, Object longitudeValue) {
    double latitude = numberOrDefault(latitudeValue, Double.NaN);
    double longitude = numberOrDefault(longitudeValue, Double.NaN);
    if (!Double.isFinite(latitude) || !Double.isFinite(longitude)) return java.util.Optional.empty();
    Map<String, Object> nearest = null;
    double nearestDistance = Double.MAX_VALUE;
    for (Map<String, Object> place : places == null ? List.<Map<String, Object>>of() : places) {
      double placeLatitude = numberOrDefault(place.get("latitude"), Double.NaN);
      double placeLongitude = numberOrDefault(place.get("longitude"), Double.NaN);
      double radiusM = clamp(numberOrDefault(place.get("radiusM"), 180), 50, 1000);
      if (!Double.isFinite(placeLatitude) || !Double.isFinite(placeLongitude)) continue;
      double distance = haversine(latitude, longitude, placeLatitude, placeLongitude);
      if (distance <= radiusM && distance < nearestDistance) {
        nearest = place;
        nearestDistance = distance;
      }
    }
    return java.util.Optional.ofNullable(nearest);
  }

  Map<String, Object> enrichDestination(Map<String, Object> ride) {
    Map<String, Object> enriched = new LinkedHashMap<>(ride == null ? Map.of() : ride);
    String savedEnd = placeLabel(enriched.get("matchedEndPlace"));
    if (!savedEnd.isBlank()) {
      enriched.put("destinationName", savedEnd);
      enriched.put("destinationCategory", stringOrDefault(placeKind(enriched.get("matchedEndPlace")), "saved_place"));
      enriched.put("destinationAddress", "");
      enriched.put("destinationSource", "saved_place");
      return enriched;
    }
    if (!string(enriched.get("destinationName")).isBlank() || destinationPlaceService == null) return enriched;
    destinationPlaceService.resolve(enriched.get("endLatitude"), enriched.get("endLongitude"))
        .ifPresent(place -> putDestination(enriched, place));
    return enriched;
  }

  void putDestination(Map<String, Object> target, DestinationPlace place) {
    target.put("destinationName", place.name());
    target.put("destinationCategory", place.category());
    target.put("destinationAddress", place.address());
    target.put("destinationSource", place.source());
  }
}
