package com.ridepulse.api.service;

import com.ridepulse.api.repository.DashboardRepository;
import com.ridepulse.api.utility.Rows;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {
  private final DashboardRepository dashboardRepository;
  private final RoutePreviewService routePreviewService;
  private final JournalIntelligenceService journalIntelligenceService;

  DashboardService(DashboardRepository dashboardRepository, RoutePreviewService routePreviewService, JournalIntelligenceService journalIntelligenceService) {
    this.dashboardRepository = dashboardRepository;
    this.routePreviewService = routePreviewService;
    this.journalIntelligenceService = journalIntelligenceService;
  }

  public Map<String, Object> dashboard(String userId) {
    Map<String, Object> stats = normalizeStats(dashboardRepository.stats(userId));
    List<Map<String, Object>> recent = dashboardRepository.recentRides(userId);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("stats", stats);
    response.put("recentRides", journalIntelligenceService.decorateRides(routePreviewService.attachRoutePreviews(recent), stats));
    return response;
  }

  public Map<String, Object> stats(String userId) {
    return normalizeStats(dashboardRepository.stats(userId));
  }

  public static Map<String, Object> normalizeStats(Map<String, Object> row) {
    Map<String, Object> stats = new LinkedHashMap<>();
    stats.put("todayDistanceM", Rows.numeric(row.get("today_distance_m")));
    stats.put("monthDistanceM", Rows.numeric(row.get("month_distance_m")));
    stats.put("yearDistanceM", Rows.numeric(row.get("year_distance_m")));
    stats.put("totalRides", Rows.integer(row.get("total_rides")));
    stats.put("unreviewedRides", Rows.integer(row.get("unreviewed_rides")));
    stats.put("bestTopSpeedKmh", Rows.numeric(row.get("best_top_speed_kmh")));
    stats.put("averageSpeedKmh", Rows.numeric(row.get("average_speed_kmh")));
    stats.put("previousMonthDistanceM", Rows.numeric(row.get("previous_month_distance_m")));
    stats.put("longestRideDistanceM", Rows.numeric(row.get("longest_ride_distance_m")));
    return stats;
  }
}
