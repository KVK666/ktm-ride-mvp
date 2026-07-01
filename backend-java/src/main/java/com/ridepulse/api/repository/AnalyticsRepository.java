package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;

public interface AnalyticsRepository {
  List<Map<String, Object>> distance(String userId, String grain);

  List<Map<String, Object>> speed(String rideId);
}
