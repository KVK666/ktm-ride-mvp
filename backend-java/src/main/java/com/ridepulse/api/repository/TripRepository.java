package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface TripRepository {
  List<Map<String, Object>> list(String userId);

  List<Map<String, Object>> listForRide(String userId, String rideId);

  Optional<Map<String, Object>> find(String userId, String tripId);

  Optional<Map<String, Object>> findFresh(String userId, String tripId);

  Optional<Map<String, Object>> findByClientTripId(String userId, String clientTripId);

  List<Map<String, Object>> rides(String userId, String tripId);

  List<Map<String, Object>> ridesFresh(String userId, String tripId);

  String create(String userId, String title, String description);

  String createImported(String userId, String title, String description, String clientTripId);

  int update(String userId, String tripId, String title, String description);

  int delete(String userId, String tripId);

  int addRide(String tripId, String rideId);

  int addRides(String tripId, List<String> rideIds);

  int removeRide(String tripId, String rideId);

  int touch(String userId, String tripId);
}
