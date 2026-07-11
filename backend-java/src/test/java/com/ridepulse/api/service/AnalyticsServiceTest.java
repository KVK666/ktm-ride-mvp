package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.dto.AnalyticsInsights;
import com.ridepulse.api.repository.AnalyticsRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class AnalyticsServiceTest {
  private static final Instant NOW = Instant.parse("2026-07-15T12:00:00Z");

  @Test
  void insightsLoadsOnlyTheRequestedUsersSummaryRides() {
    AnalyticsRepository repository = mock(AnalyticsRepository.class);
    AnalyticsService service = new AnalyticsService(repository, mock(RideService.class));
    when(repository.insightRides("owner-1")).thenReturn(List.of());

    Map<String, Object> response = service.insights("owner-1");

    verify(repository).insightRides("owner-1");
    assertThat(response).containsOnlyKeys("insights");
  }

  @Test
  void returnsDeterministicEmptyInsights() {
    AnalyticsService service = service();

    AnalyticsInsights insights = service.calculateInsights(List.of(), NOW);

    assertThat(insights.generatedAt()).isEqualTo("2026-07-15T12:00:00Z");
    assertThat(insights.ridesLast30Days()).isZero();
    assertThat(insights.distanceLast30DaysM()).isZero();
    assertThat(insights.distancePrevious30DaysM()).isZero();
    assertThat(insights.distanceCurrentMonthM()).isZero();
    assertThat(insights.distanceTrendPercent()).isNull();
    assertThat(insights.activeDaysLast30Days()).isZero();
    assertThat(insights.currentRideDayStreak()).isZero();
    assertThat(insights.longestRideM()).isZero();
    assertThat(insights.averageRideDistanceM()).isZero();
    assertThat(insights.averageRideDurationS()).isZero();
    assertThat(insights.averageTopSpeedKmh()).isZero();
    assertThat(insights.favoriteWeekday()).isNull();
    assertThat(insights.favoriteTimeOfDay()).isNull();
    assertThat(insights.reviewCompletionPercent()).isZero();
    assertThat(insights.cleanupCandidateCount()).isZero();
    assertThat(insights.projectedMonthDistanceM()).isZero();
  }

  @Test
  void keepsThirtyDayWindowsDisjointAtTheirExactBoundaries() {
    AnalyticsService service = service();
    List<Map<String, Object>> rides = List.of(
        ride("2026-06-15T12:00:00Z", 1000, 100, 20, false),
        ride("2026-06-15T11:59:59Z", 2000, 200, 30, false),
        ride("2026-05-16T12:00:00Z", 3000, 300, 40, false),
        ride("2026-05-16T11:59:59Z", 9000, 900, 50, true),
        ride("2026-07-15T12:00:01Z", 50000, 5000, 200, true));

    AnalyticsInsights insights = service.calculateInsights(rides, NOW);

    assertThat(insights.ridesLast30Days()).isEqualTo(1);
    assertThat(insights.distanceLast30DaysM()).isEqualTo(1000);
    assertThat(insights.distancePrevious30DaysM()).isEqualTo(5000);
    assertThat(insights.distanceTrendPercent()).isEqualTo(-80);
    assertThat(insights.longestRideM()).isEqualTo(9000);
  }

  @Test
  void aggregatesRecentActivityStreakFavoritesAveragesTrendAndProjection() {
    AnalyticsService service = service();
    List<Map<String, Object>> rides = List.of(
        ride("2026-07-15T06:00:00Z", 10000, 600, 50, true),
        ride("2026-07-14T07:00:00Z", 20000, 1200, 70, true),
        ride("2026-07-13T08:00:00Z", 30000, 1800, 90, false),
        ride("2026-07-11T18:00:00Z", 40000, 2400, 110, false),
        ride("2026-06-10T06:00:00Z", 50000, 3000, 100, true));

    AnalyticsInsights insights = service.calculateInsights(rides, NOW);

    assertThat(insights.ridesLast30Days()).isEqualTo(4);
    assertThat(insights.distanceLast30DaysM()).isEqualTo(100000);
    assertThat(insights.distancePrevious30DaysM()).isEqualTo(50000);
    assertThat(insights.distanceCurrentMonthM()).isEqualTo(100000);
    assertThat(insights.distanceTrendPercent()).isEqualTo(100);
    assertThat(insights.activeDaysLast30Days()).isEqualTo(4);
    assertThat(insights.currentRideDayStreak()).isEqualTo(3);
    assertThat(insights.longestRideM()).isEqualTo(50000);
    assertThat(insights.averageRideDistanceM()).isEqualTo(25000);
    assertThat(insights.averageRideDurationS()).isEqualTo(1500);
    assertThat(insights.averageTopSpeedKmh()).isEqualTo(80);
    assertThat(insights.favoriteWeekday()).isEqualTo("Monday");
    assertThat(insights.favoriteTimeOfDay()).isEqualTo("Morning");
    assertThat(insights.projectedMonthDistanceM()).isEqualTo(206666.7);
  }

  @Test
  void usesTheRiderTimezoneForCalendarMonthWeekdayAndTimeOfDay() {
    AnalyticsService service = service();
    Instant now = Instant.parse("2026-08-01T01:00:00Z");

    AnalyticsInsights insights = service.calculateInsights(
        List.of(ride("2026-07-31T18:30:00Z", 1000, 600, 40, true)),
        now,
        ZoneId.of("Asia/Kolkata"));

    assertThat(insights.distanceCurrentMonthM()).isEqualTo(1000);
    assertThat(insights.projectedMonthDistanceM()).isEqualTo(31000);
    assertThat(insights.favoriteWeekday()).isEqualTo("Saturday");
    assertThat(insights.favoriteTimeOfDay()).isEqualTo("Night");
  }

  @Test
  void countsReviewAndCleanupMetricsAcrossHistoryAndRejectsMalformedData() {
    AnalyticsService service = service();
    List<Map<String, Object>> rides = List.of(
        ride("2026-07-15T08:00:00Z", 10, 50, 20, false),
        ride("2026-07-14T08:00:00Z", 10, 50, 20, true),
        ride("2026-07-13T08:00:00Z", 200, 60, 300, false),
        ride("2026-07-12T08:00:00Z", 200, 61, -10, false),
        ride("not-an-instant", 100000, 10000, 200, true));

    AnalyticsInsights insights = service.calculateInsights(rides, NOW);

    assertThat(insights.reviewCompletionPercent()).isEqualTo(25);
    assertThat(insights.cleanupCandidateCount()).isEqualTo(2);
    assertThat(insights.longestRideM()).isEqualTo(200);
    assertThat(insights.averageTopSpeedKmh()).isEqualTo(10);
  }

  @Test
  void carriesAnUnbrokenStreakFromYesterdayButNotAcrossAGap() {
    AnalyticsService service = service();

    AnalyticsInsights activeYesterday = service.calculateInsights(
        List.of(
            ride("2026-07-14T08:00:00Z", 1000, 100, 20, false),
            ride("2026-07-13T08:00:00Z", 1000, 100, 20, false)),
        NOW);
    AnalyticsInsights stale = service.calculateInsights(
        List.of(ride("2026-07-13T08:00:00Z", 1000, 100, 20, false)),
        NOW);

    assertThat(activeYesterday.currentRideDayStreak()).isEqualTo(2);
    assertThat(stale.currentRideDayStreak()).isZero();
  }

  private static AnalyticsService service() {
    return new AnalyticsService(mock(AnalyticsRepository.class), mock(RideService.class));
  }

  private static Map<String, Object> ride(
      String startedAt,
      Object distanceM,
      Object durationS,
      Object topSpeedKmh,
      boolean reviewed) {
    Map<String, Object> ride = new LinkedHashMap<>();
    ride.put("startedAt", startedAt);
    ride.put("distanceM", distanceM);
    ride.put("durationS", durationS);
    ride.put("topSpeedKmh", topSpeedKmh);
    ride.put("reviewedAt", reviewed ? "2026-07-15T10:00:00Z" : null);
    return ride;
  }
}
