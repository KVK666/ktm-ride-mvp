package com.ridepulse.api.service;

import com.ridepulse.api.repository.DashboardRepository;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class JournalExperienceService {
  private final DashboardService dashboardService;
  private final DashboardRepository dashboardRepository;
  private final RoutePreviewService routePreviewService;
  private final JournalIntelligenceService journalIntelligenceService;

  JournalExperienceService(
      DashboardService dashboardService,
      DashboardRepository dashboardRepository,
      RoutePreviewService routePreviewService,
      JournalIntelligenceService journalIntelligenceService) {
    this.dashboardService = dashboardService;
    this.dashboardRepository = dashboardRepository;
    this.routePreviewService = routePreviewService;
    this.journalIntelligenceService = journalIntelligenceService;
  }

  public Map<String, Object> journal(String userId, boolean home) {
    int limit = home ? 10 : 12;
    Map<String, Object> stats = dashboardService.stats(userId);
    List<Map<String, Object>> recent = routePreviewService.attachRoutePreviews(dashboardRepository.journalRecentRides(userId, limit));
    List<Map<String, Object>> month = routePreviewService.attachRoutePreviews(dashboardRepository.journalMonthRides(userId, limit));
    return home
        ? journalIntelligenceService.buildHomeExperience(stats, recent, month)
        : journalIntelligenceService.buildJournal(stats, recent, month);
  }
}
