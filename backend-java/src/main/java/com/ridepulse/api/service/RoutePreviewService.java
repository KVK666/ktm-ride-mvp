package com.ridepulse.api.service;

import com.ridepulse.api.repository.RoutePreviewRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class RoutePreviewService {
  private static final Logger log = LoggerFactory.getLogger(RoutePreviewService.class);
  private final RoutePreviewRepository routePreviewRepository;

  RoutePreviewService(RoutePreviewRepository routePreviewRepository) {
    this.routePreviewRepository = routePreviewRepository;
  }

  public List<Map<String, Object>> attachRoutePreviews(List<Map<String, Object>> rides) {
    if (rides == null || rides.isEmpty()) return rides == null ? List.of() : rides;
    List<String> ids = rides.stream().map(ride -> String.valueOf(ride.get("id"))).filter(id -> !id.isBlank()).toList();
    if (ids.isEmpty()) return rides;

    Map<String, List<Map<String, Object>>> previews;
    try {
      previews = routePreviewRepository.findPreviews(ids);
    } catch (Exception error) {
      log.warn("Route preview loading failed for {} rides: {}", ids.size(), error.getMessage());
      previews = Map.of();
    }
    List<Map<String, Object>> decorated = new ArrayList<>();
    for (Map<String, Object> ride : rides) {
      Map<String, Object> copy = new LinkedHashMap<>(ride);
      copy.put("routePreview", previews.getOrDefault(String.valueOf(ride.get("id")), List.of()));
      decorated.add(copy);
    }
    return decorated;
  }
}
