package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.repository.TripRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class GoogleTimelineImportServiceTest {
  private final RideRepository rideRepository = mock(RideRepository.class);
  private final TripRepository tripRepository = mock(TripRepository.class);
  private final GoogleTimelineImportService service = new GoogleTimelineImportService(
      rideRepository,
      tripRepository,
      new RideMathService());

  @Test
  void checkClassifiesExistingRidesAndTimeOverlapsWithoutCrossAccountReads() {
    when(rideRepository.ownedRideIdsByClientIds("user-1", List.of("already-imported", "new-ride")))
        .thenReturn(Map.of("already-imported", "ride-existing"));
    when(rideRepository.overlapsRange("user-1", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))
        .thenReturn(List.of(Map.of(
            "rideId", "ride-overlap",
            "startedAt", "2026-08-23T10:05:00Z",
            "endedAt", "2026-08-23T10:20:00Z")));

    Map<String, Object> response = service.check("user-1", Map.of("rides", List.of(
        ride("already-imported", "2026-08-23T09:00:00Z", "2026-08-23T09:30:00Z"),
        ride("new-ride", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))));

    List<?> rides = (List<?>) response.get("rides");
    List<String> statuses = rides.stream().map(value -> String.valueOf(((Map<?, ?>) value).get("status"))).toList();
    assertThat(statuses)
        .containsExactly("existing", "probable_overlap");
    assertThat(response.get("canImport")).isEqualTo(false);
    verify(rideRepository).ownedRideIdsByClientIds("user-1", List.of("already-imported", "new-ride"));
    verify(rideRepository, never()).ownedRideIdsByClientIds(eq("other-user"), any());
  }

  @Test
  void importWritesTimelineSourceAndDefersAiWhileRemainingIdempotent() {
    when(rideRepository.insertImportedRide(
        eq("user-1"), any(), eq("new-ride"), eq("2026-08-23T10:00:00Z"), eq("2026-08-23T10:30:00Z"), any(), any()))
        .thenReturn("ride-1");

    Map<String, Object> response = service.importRides("user-1", Map.of("rides", List.of(
        ride("new-ride", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))));

    assertThat(response.get("created")).isEqualTo(true);
    assertThat(((Map<?, ?>) response.get("summary")).get("created")).isEqualTo(1);
    verify(rideRepository).insertPoints(eq("ride-1"), any());
    ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
    verify(rideRepository).insertImportedRide(
        eq("user-1"), body.capture(), eq("new-ride"), eq("2026-08-23T10:00:00Z"), eq("2026-08-23T10:30:00Z"), any(), any());
    assertThat(body.getValue()).containsEntry("source", "google_timeline").containsEntry("aiStatus", "deferred");
  }

  @Test
  void checkAcceptsTheMobileIdOnlyPreflightContract() {
    when(rideRepository.ownedRideIdsByClientIds("user-1", List.of("existing", "new")))
        .thenReturn(Map.of("existing", "ride-1"));

    Map<String, Object> response = service.check("user-1", Map.of(
        "importId", "gti-1",
        "sourceHash", "hash-1",
        "candidateIds", List.of("existing", "new"),
        "clientRideIds", List.of("existing", "new")));

    assertThat(response).containsEntry("importId", "gti-1").containsEntry("sourceHash", "hash-1");
    assertThat(response.get("existingCandidateIds")).isEqualTo(List.of("existing"));
    assertThat(((List<?>) response.get("rides")).get(0)).extracting(value -> ((Map<?, ?>) value).get("status"))
        .isEqualTo("existing");
  }

  @Test
  void importUsesTimelineDistanceAndDurationForSummaryInsteadOfPointDistance() {
    ArgumentCaptor<Map<String, Object>> summary = ArgumentCaptor.forClass(Map.class);
    when(rideRepository.insertImportedRide(eq("user-1"), any(), eq("authoritative"), any(), any(), any(), summary.capture()))
        .thenReturn("ride-authoritative");

    Map<String, Object> source = ride("authoritative", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z");
    source = new java.util.LinkedHashMap<>(source);
    source.put("distanceMeters", 10000);
    source.put("durationS", 600);
    service.importRides("user-1", Map.of("rides", List.of(source)));

    assertThat(summary.getValue()).containsEntry("distanceM", 10000L).containsEntry("durationS", 1800).containsEntry("avgSpeedKmh", 20.0);
  }

  @Test
  void probableOverlapRequiresExplicitAllowanceBeforeWriting() {
    when(rideRepository.overlapsRange("user-1", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))
        .thenReturn(List.of(Map.of(
            "rideId", "ride-existing",
            "startedAt", "2026-08-23T10:05:00Z",
            "endedAt", "2026-08-23T10:20:00Z")));
    when(rideRepository.insertImportedRide(eq("user-1"), any(), eq("overlap"), any(), any(), any(), any()))
        .thenReturn("ride-overlap");

    Map<String, Object> rejected = service.importRides("user-1", Map.of("rides", List.of(
        ride("overlap", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))));
    assertThat(((List<?>) rejected.get("rides")).get(0)).extracting(value -> ((Map<?, ?>) value).get("status"))
        .isEqualTo("conflict");
    verify(rideRepository, never()).insertPoints(any(), any());

    Map<String, Object> allowed = service.importRides("user-1", Map.of(
        "allowOverlapClientRideIds", List.of("overlap"),
        "rides", List.of(ride("overlap", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))));
    assertThat(((List<?>) allowed.get("rides")).get(0)).extracting(value -> ((Map<?, ?>) value).get("overlapConfirmed"))
        .isEqualTo(true);
  }

  @Test
  void importingTheSameClientRideReturnsDuplicateAndDoesNotWritePoints() {
    when(rideRepository.ownedRideIdsByClientIds("user-1", List.of("already-imported")))
        .thenReturn(Map.of("already-imported", "ride-existing"));

    Map<String, Object> response = service.importRides("user-1", Map.of("rides", List.of(
        ride("already-imported", "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"))));

    assertThat(response.get("created")).isEqualTo(false);
    assertThat(((List<?>) response.get("rides")).get(0)).extracting(value -> ((Map<?, ?>) value).get("rideId"))
        .isEqualTo("ride-existing");
    verify(rideRepository, never()).insertImportedRide(any(), any(), any(), any(), any(), any(), any());
    verify(rideRepository, never()).insertPoints(any(), any());
    verify(rideRepository, never()).overlapsRange(any(), any(), any());
  }

  @Test
  void importedTripsResolveOwnedClientRideIdsAndUpsertMembership() {
    when(rideRepository.ownedRideIdsFresh("user-1", List.of("new-ride"))).thenReturn(List.of());
    when(rideRepository.ownedRideIdsByClientIds("user-1", List.of("new-ride")))
        .thenReturn(Map.of("new-ride", "ride-1"));
    when(tripRepository.createImported("user-1", "Weekend loop", null, "trip-client-1"))
        .thenReturn("trip-1");
    when(tripRepository.addRides("trip-1", List.of("ride-1"))).thenReturn(1);

    Map<String, Object> response = service.importTrips("user-1", Map.of("trips", List.of(Map.of(
        "clientTripId", "trip-client-1",
        "title", "Weekend loop",
        "rideClientIds", List.of("new-ride")))));

    assertThat(response.get("created")).isEqualTo(true);
    assertThat(((List<?>) response.get("trips")).get(0)).extracting(value -> ((Map<?, ?>) value).get("tripId"))
        .isEqualTo("trip-1");
    verify(tripRepository).addRides("trip-1", List.of("ride-1"));
    verify(tripRepository).touch("user-1", "trip-1");
  }

  @Test
  void importedTripsRejectRidesNotOwnedByTheAccount() {
    when(rideRepository.ownedRideIdsFresh("user-1", List.of("foreign-ride"))).thenReturn(List.of());
    when(rideRepository.ownedRideIdsByClientIds("user-1", List.of("foreign-ride"))).thenReturn(Map.of());

    assertThatThrownBy(() -> service.importTrips("user-1", Map.of("trips", List.of(Map.of(
        "clientTripId", "trip-client-1",
        "rideIds", List.of("foreign-ride"))))))
        .isInstanceOf(ApiException.class);
    verify(tripRepository, never()).createImported(any(), any(), any(), any());
  }

  @Test
  void retryingAnImportedTripDoesNotOverwriteItsExistingTitle() {
    when(rideRepository.ownedRideIdsFresh("user-1", List.of("ride-1"))).thenReturn(List.of("ride-1"));
    when(rideRepository.ownedRideIdsByClientIds("user-1", List.of("ride-1"))).thenReturn(Map.of());
    when(tripRepository.findByClientTripId("user-1", "trip-1"))
        .thenReturn(Optional.of(Map.of("id", "trip-1", "title", "Manually edited")));
    when(tripRepository.addRides("trip-1", List.of("ride-1"))).thenReturn(0);

    service.importTrips("user-1", Map.of("trips", List.of(Map.of(
        "clientTripId", "trip-1",
        "title", "Timeline generated title",
        "rideIds", List.of("ride-1")))));

    verify(tripRepository, never()).createImported(any(), any(), any(), any());
  }

  @Test
  void importBatchIsLimitedToFiftyRides() {
    List<Map<String, Object>> rides = new ArrayList<>();
    for (int index = 0; index < 51; index += 1) {
      rides.add(ride("ride-" + index, "2026-08-23T10:00:00Z", "2026-08-23T10:30:00Z"));
    }
    assertThatThrownBy(() -> service.check("user-1", Map.of("rides", rides)))
        .isInstanceOf(ApiException.class);
  }

  @Test
  void invalidRideTimesAreRejectedBeforeRepositoryAccess() {
    assertThatThrownBy(() -> service.check("user-1", Map.of("rides", List.of(
        ride("bad-ride", "2026-08-23T10:30:00Z", "2026-08-23T10:00:00Z")))))
        .isInstanceOf(ApiException.class);
    verify(rideRepository, never()).ownedRideIdsByClientIds(any(), any());
  }

  private static Map<String, Object> ride(String clientRideId, String startedAt, String endedAt) {
    return Map.of(
        "clientRideId", clientRideId,
        "sourceActivityType", "MOTORCYCLING",
        "distanceMeters", 2500,
        "startedAt", startedAt,
        "endedAt", endedAt,
        "points", List.of(
            Map.of("latitude", 12.9, "longitude", 77.6, "recordedAt", startedAt),
            Map.of("latitude", 12.91, "longitude", 77.61, "recordedAt", endedAt)));
  }
}
