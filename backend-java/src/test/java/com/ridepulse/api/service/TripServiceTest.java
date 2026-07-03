package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.TripRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class TripServiceTest {
  private final TripRepository tripRepository = mock(TripRepository.class);
  private final RideService rideService = mock(RideService.class);
  private final RoutePreviewService routePreviewService = mock(RoutePreviewService.class);
  private final JournalIntelligenceService journalIntelligenceService = mock(JournalIntelligenceService.class);
  private final TripService service = new TripService(tripRepository, rideService, routePreviewService, journalIntelligenceService);

  TripServiceTest() {
    when(routePreviewService.attachRoutePreviews(any())).thenAnswer(invocation -> invocation.getArgument(0));
    when(journalIntelligenceService.decorateRides(any(), anyMap())).thenAnswer(invocation -> invocation.getArgument(0));
  }

  @Test
  void addsRideOnlyAfterTripAndRideOwnershipAreVerified() {
    when(tripRepository.find("user-1", "trip-1")).thenReturn(Optional.of(Map.of("id", "trip-1", "title", "Weekend")));
    when(rideService.ownedRideExists("user-1", "ride-1")).thenReturn(true);
    when(tripRepository.rides("user-1", "trip-1")).thenReturn(List.of(Map.of("id", "ride-1")));

    Map<String, Object> response = service.addRide("user-1", "trip-1", Map.of("rideId", "ride-1"));

    verify(tripRepository).addRide("trip-1", "ride-1");
    assertThat(response).containsKey("trip").containsKey("rides");
  }

  @Test
  void rejectsAddingRideToAnotherUsersTrip() {
    when(tripRepository.find("user-1", "trip-2")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.addRide("user-1", "trip-2", Map.of("rideId", "ride-1")))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void removingRideKeepsTheRideAndReturnsUpdatedTrip() {
    when(tripRepository.find("user-1", "trip-1")).thenReturn(Optional.of(Map.of("id", "trip-1", "title", "Weekend")));
    when(tripRepository.rides("user-1", "trip-1")).thenReturn(List.of());

    Map<String, Object> response = service.removeRide("user-1", "trip-1", "ride-1");

    verify(tripRepository).removeRide("trip-1", "ride-1");
    assertThat(response.get("rides")).isEqualTo(List.of());
  }
}
