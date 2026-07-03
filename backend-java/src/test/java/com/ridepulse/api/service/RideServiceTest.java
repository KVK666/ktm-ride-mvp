package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.repository.RideRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RideServiceTest {
  @Test
  void listPassesSearchQueryThroughToRepositoryAndKeepsRideResponseShape() {
    RideRepository rideRepository = mock(RideRepository.class);
    RoutePreviewService routePreviewService = mock(RoutePreviewService.class);
    JournalIntelligenceService journalIntelligenceService = mock(JournalIntelligenceService.class);
    RideService service = new RideService(
        rideRepository,
        mock(RideMathService.class),
        routePreviewService,
        journalIntelligenceService,
        mock(PhotoValidationService.class));
    List<Map<String, Object>> rides = List.of(Map.of("id", "ride-1", "title", "Hill climb"));

    when(rideRepository.list("user-1", "all", "hill")).thenReturn(rides);
    when(routePreviewService.attachRoutePreviews(any())).thenAnswer(invocation -> invocation.getArgument(0));
    when(journalIntelligenceService.decorateRides(any(), anyMap())).thenAnswer(invocation -> invocation.getArgument(0));

    Map<String, Object> response = service.list("user-1", "all", "hill");

    verify(rideRepository).list("user-1", "all", "hill");
    assertThat(response).containsEntry("rides", rides);
  }
}
