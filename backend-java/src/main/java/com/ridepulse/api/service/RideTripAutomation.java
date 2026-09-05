package com.ridepulse.api.service;

import java.util.LinkedHashMap;
import java.util.Map;
import static com.ridepulse.api.service.RideIntelligenceSupport.*;
import com.ridepulse.api.repository.TripRepository;
import org.springframework.stereotype.Component;

@Component
class RideTripAutomation {
  private static final double HIGH_TRIP_CONFIDENCE = 0.86;
  private final TripRepository tripRepository;
  private final RideIntelligencePolicy policy;

  RideTripAutomation(TripRepository tripRepository, RideIntelligencePolicy policy) {
    this.tripRepository = tripRepository;
    this.policy = policy;
  }

  Map<String, Object> applyTripAutomation(String userId, String rideId, Map<String, Object> intelligence) {
    Map<String, Object> suggestion = policy.parseTripSuggestion(intelligence.get("tripSuggestion"));
    String action = string(suggestion.get("action"));
    double confidence = numberOrDefault(suggestion.get("confidence"), 0);
    if (confidence < HIGH_TRIP_CONFIDENCE) return suggestion.isEmpty() ? Map.of("action", "none", "confidence", confidence) : suggestion;
    if ("auto_add".equals(action) && !string(suggestion.get("tripId")).isBlank()) {
      String tripId = string(suggestion.get("tripId"));
      if (tripRepository.find(userId, tripId).isEmpty()) {
        Map<String, Object> downgraded = new LinkedHashMap<>(suggestion);
        downgraded.put("action", "suggest");
        downgraded.put("reason", "RidePulse needs you to confirm this trip match.");
        downgraded.remove("tripId");
        return downgraded;
      }
      tripRepository.addRide(tripId, rideId);
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
    return suggestion;
  }
}
