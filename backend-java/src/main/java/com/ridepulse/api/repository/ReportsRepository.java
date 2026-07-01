package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;

public interface ReportsRepository {
  Map<String, Object> summary(String userId, String grain, String anchor);

  List<Map<String, Object>> routes(String userId, String grain, String anchor);
}
