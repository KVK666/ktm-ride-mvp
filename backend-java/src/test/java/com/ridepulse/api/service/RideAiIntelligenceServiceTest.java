package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.repository.TripRepository;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RideAiIntelligenceServiceTest {
  private final RideAiIntelligenceService service = new RideAiIntelligenceService(
      mock(RideRepository.class),
      mock(TripRepository.class),
      new ObjectMapper(),
      "",
      "gpt-4o-mini",
      "https://example.invalid");

  @Test
  void decorateIntelligenceBuildsHumanFallbackTitleWithoutRouteLabels() {
    Map<String, Object> ride = Map.of(
        "id", "ride-1",
        "startLabel", "Auto start (12.97160, 77.59460)",
        "endLabel", "Unnamed Road, Bengaluru",
        "distanceM", 4200,
        "durationS", 840,
        "topSpeedKmh", 42,
        "avgSpeedKmh", 18,
        "startedAt", "2026-07-05T04:30:00Z");

    Map<String, Object> decorated = service.decorateIntelligence(Map.of("suggestedTitle", "Fallback"), ride);

    assertThat(decorated.get("suggestedTitle")).asString()
        .doesNotContain("Auto start")
        .doesNotContain("Unnamed Road")
        .contains("ride");
  }

  @Test
  void decorateIntelligenceParsesStoredTripSuggestionJson() {
    Map<String, Object> ride = Map.of(
        "id", "ride-1",
        "distanceM", 52000,
        "durationS", 3600,
        "topSpeedKmh", 88,
        "avgSpeedKmh", 52,
        "startedAt", "2026-07-05T08:00:00Z",
        "tripSuggestion", "{\"action\":\"suggest\",\"title\":\"Sunday highway run\",\"confidence\":0.74}");

    Map<String, Object> decorated = service.decorateIntelligence(Map.of(), ride);

    assertThat(decorated.get("tripAutomation")).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> tripAutomation = (Map<String, Object>) decorated.get("tripAutomation");
    assertThat(tripAutomation).containsEntry("action", "suggest").containsEntry("title", "Sunday highway run");
  }
}
