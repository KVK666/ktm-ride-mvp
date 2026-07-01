package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;

public interface DashboardRepository {
  Map<String, Object> stats(String userId);

  List<Map<String, Object>> recentRides(String userId);

  List<Map<String, Object>> journalRecentRides(String userId, int limit);

  List<Map<String, Object>> journalMonthRides(String userId, int limit);
}
