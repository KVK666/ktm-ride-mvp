package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface SavedPlaceRepository {
  List<Map<String, Object>> list(String userId);

  Optional<Map<String, Object>> find(String userId, String placeId);

  int count(String userId);

  Map<String, Object> create(String userId, String label, String kind, double latitude, double longitude, int radiusM);

  Optional<Map<String, Object>> update(String userId, String placeId, String label, String kind, double latitude, double longitude, int radiusM);

  int delete(String userId, String placeId);
}
