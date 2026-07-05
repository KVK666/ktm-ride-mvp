package com.ridepulse.api.repository;

import com.ridepulse.api.service.PhotoValidationService.NormalizedRidePhoto;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface RideRepository {
  List<Map<String, Object>> list(String userId, String period, String query);

  Optional<Map<String, Object>> findOwnedRide(String userId, String rideId);

  boolean ownedRideExists(String userId, String rideId);

  List<Map<String, Object>> points(String rideId);

  List<Map<String, Object>> intelligencePoints(String rideId);

  Map<String, Object> intelligenceStats(String userId);

  List<Map<String, Object>> duplicates(String userId, String rideId);

  Optional<Map<String, Object>> patch(String userId, String rideId, String title, String notes, boolean markReviewed);

  Optional<Map<String, Object>> findByClientRideId(String userId, String clientRideId);

  String insertRide(String userId, Map<String, Object> body, String rideClientId, String startedAt, String endedAt, List<Map<String, Object>> points, Map<String, Object> summary);

  void insertPoints(String rideId, List<Map<String, Object>> points);

  void markAiPending(String userId, String rideId);

  void saveAiIntelligence(String userId, String rideId, Map<String, Object> intelligence);

  int delete(String userId, String rideId);

  List<Map<String, Object>> photos(String userId, String rideId);

  Map<String, Object> insertPhoto(String userId, String rideId, NormalizedRidePhoto photo);

  int deletePhoto(String userId, String rideId, String photoId);
}
