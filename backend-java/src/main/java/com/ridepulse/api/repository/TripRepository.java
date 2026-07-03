package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface TripRepository {
  List<Map<String, Object>> list(String userId);

  Optional<Map<String, Object>> find(String userId, String tripId);

  List<Map<String, Object>> rides(String userId, String tripId);

  String create(String userId, String title, String description);

  int update(String userId, String tripId, String title, String description);

  int delete(String userId, String tripId);

  int addRide(String tripId, String rideId);

  int removeRide(String tripId, String rideId);
}
