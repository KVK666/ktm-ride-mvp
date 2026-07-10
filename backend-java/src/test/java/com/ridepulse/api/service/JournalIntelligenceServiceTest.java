package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.Map;
import org.junit.jupiter.api.Test;

class JournalIntelligenceServiceTest {
  private final JournalIntelligenceService service = new JournalIntelligenceService(mock(RideMathService.class));

  @Test
  void flagsOnlyUnreviewedNearZeroMovementRidesForCleanup() {
    Map<String, Object> decorated = service.decorateRide(
        Map.of("id", "ride-1", "distanceM", 12, "durationS", 75, "startedAt", "2026-07-11T06:00:00Z"),
        Map.of());

    assertThat(decorated).containsEntry("cleanupCandidate", true);
    assertThat(decorated.get("cleanupReason")).asString().contains("Almost no movement");
  }

  @Test
  void reviewedRidesStayOutOfCleanupQueue() {
    Map<String, Object> decorated = service.decorateRide(
        Map.of(
            "id", "ride-1",
            "distanceM", 12,
            "durationS", 75,
            "startedAt", "2026-07-11T06:00:00Z",
            "reviewedAt", "2026-07-11T06:10:00Z"),
        Map.of());

    assertThat(decorated).containsEntry("cleanupCandidate", false).containsEntry("cleanupReason", null);
  }

  @Test
  void meaningfulRidesStayOutOfCleanupQueue() {
    Map<String, Object> decorated = service.decorateRide(
        Map.of("id", "ride-1", "distanceM", 1200, "durationS", 240, "startedAt", "2026-07-11T06:00:00Z"),
        Map.of());

    assertThat(decorated).containsEntry("cleanupCandidate", false);
  }
}
