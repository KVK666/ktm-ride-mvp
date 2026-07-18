package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.dto.RideListQuery;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.RideRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class RideServiceTest {
  private final RideRepository rideRepository = mock(RideRepository.class);
  private final RoutePreviewService routePreviewService = mock(RoutePreviewService.class);
  private final JournalIntelligenceService journalIntelligenceService = mock(JournalIntelligenceService.class);
  private final RideService service = new RideService(
      rideRepository,
      mock(RideMathService.class),
      routePreviewService,
      journalIntelligenceService,
      mock(PhotoValidationService.class),
      mock(RideAiIntelligenceService.class));

  RideServiceTest() {
    when(routePreviewService.attachRoutePreviews(any())).thenAnswer(invocation -> invocation.getArgument(0));
    when(journalIntelligenceService.decorateRides(any(), anyMap())).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void legacyListKeepsRidesOnlyResponseShape() {
    List<Map<String, Object>> rides = List.of(Map.of("id", "ride-1", "title", "Hill climb"));
    when(rideRepository.list(eq("user-1"), any(RideListQuery.class))).thenReturn(rides);

    Map<String, Object> response = service.list("user-1", "all", "hill");

    ArgumentCaptor<RideListQuery> query = ArgumentCaptor.forClass(RideListQuery.class);
    verify(rideRepository).list(eq("user-1"), query.capture());
    assertThat(query.getValue().searchQuery()).isEqualTo("hill");
    assertThat(query.getValue().fetchLimit()).isEqualTo(100);
    assertThat(response).containsEntry("rides", rides).doesNotContainKey("pageInfo");
  }

  @Test
  void paginatedListReturnsPageInfoAndFetchesOneExtraRow() {
    List<Map<String, Object>> rows = List.of(
        ride("10000000-0000-0000-0000-000000000003", "2026-07-19T12:00:00Z", 3000, 60),
        ride("10000000-0000-0000-0000-000000000002", "2026-07-19T11:00:00Z", 2000, 50),
        ride("10000000-0000-0000-0000-000000000001", "2026-07-19T10:00:00Z", 1000, 40));
    when(rideRepository.list(eq("user-1"), any(RideListQuery.class))).thenReturn(rows);

    Map<String, Object> response = service.list("user-1", "all", "", 2, null, "needs-review", "longest");

    ArgumentCaptor<RideListQuery> query = ArgumentCaptor.forClass(RideListQuery.class);
    verify(rideRepository).list(eq("user-1"), query.capture());
    assertThat(query.getValue().fetchLimit()).isEqualTo(3);
    assertThat(query.getValue().reviewStatus()).isEqualTo("needs_review");
    assertThat(query.getValue().sort()).isEqualTo("longest");
    assertThat((List<?>) response.get("rides")).hasSize(2);
    Map<?, ?> pageInfo = (Map<?, ?>) response.get("pageInfo");
    assertThat(pageInfo.get("hasMore")).isEqualTo(true);
    assertThat(pageInfo.get("nextCursor")).isNotNull();
  }

  @Test
  void rejectsInvalidCursorBeforeQueryingTheRepository() {
    assertThatThrownBy(() -> service.list("user-1", "all", "", 20, "not-a-cursor", null, null))
        .isInstanceOf(ApiException.class);
  }

  private static Map<String, Object> ride(String id, String startedAt, int distanceM, int topSpeedKmh) {
    return Map.of("id", id, "startedAt", startedAt, "distanceM", distanceM, "topSpeedKmh", topSpeedKmh);
  }
}
