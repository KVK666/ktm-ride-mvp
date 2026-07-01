package com.ridepulse.api.repository;

import java.util.List;
import java.util.Map;

public interface RoutePreviewRepository {
  Map<String, List<Map<String, Object>>> findPreviews(List<String> rideIds);
}
