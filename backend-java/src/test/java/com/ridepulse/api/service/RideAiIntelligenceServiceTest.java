package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.repository.SavedPlaceRepository;
import com.ridepulse.api.repository.TripRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RideAiIntelligenceServiceTest {
  private final SavedPlaceRepository savedPlaceRepository = mock(SavedPlaceRepository.class);
  private final DestinationPlaceService destinationPlaceService = mock(DestinationPlaceService.class);
  private final RideAiIntelligenceService service = new RideAiIntelligenceService(
      mock(RideRepository.class),
      mock(TripRepository.class),
      savedPlaceRepository,
      destinationPlaceService,
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

  @Test
  void savedHomeAndOfficeCreateAUsefulCommuteTitle() {
    when(savedPlaceRepository.list("owner-1")).thenReturn(List.of(
        Map.of("label", "Home", "kind", "home", "latitude", 12.9716, "longitude", 77.5946, "radiusM", 200),
        Map.of("label", "Office", "kind", "office", "latitude", 12.9352, "longitude", 77.6245, "radiusM", 200)));
    Map<String, Object> ride = Map.of(
        "id", "ride-1",
        "startLatitude", 12.9717,
        "startLongitude", 77.5947,
        "endLatitude", 12.9353,
        "endLongitude", 77.6246,
        "distanceM", 8500,
        "durationS", 1500,
        "topSpeedKmh", 52,
        "avgSpeedKmh", 24,
        "startedAt", "2026-07-14T03:30:00Z");

    Map<String, Object> decorated = service.decorateIntelligence("owner-1", Map.of(), ride);

    assertThat(decorated.get("suggestedTitle")).asString()
        .containsIgnoringCase("commute")
        .contains("Home to Office");
    assertThat(decorated.get("classification")).asString().contains("commute");
  }

  @Test
  void configStatusReportsNonSecretProviderSettings() {
    RideAiIntelligenceService configured = new RideAiIntelligenceService(
        mock(RideRepository.class),
        mock(TripRepository.class),
        mock(SavedPlaceRepository.class),
        mock(DestinationPlaceService.class),
        new ObjectMapper(),
        "sk-test-secret",
        "gpt-test",
        "https://api.openai.com/v1/chat/completions");

    Map<String, Object> status = configured.configStatus();

    assertThat(status)
        .containsEntry("apiKeyPresent", true)
        .containsEntry("model", "gpt-test")
        .containsEntry("endpointHost", "api.openai.com")
        .doesNotContainKey("apiKey");
  }

  @Test
  void coffeeDestinationCreatesPurposefulFallbackTitle() {
    Map<String, Object> ride = Map.of(
        "id", "ride-2",
        "destinationName", "Third Wave Coffee",
        "destinationCategory", "coffee_shop",
        "distanceM", 6200,
        "durationS", 1200,
        "topSpeedKmh", 48,
        "avgSpeedKmh", 22,
        "startedAt", "2026-07-21T03:30:00Z");

    Map<String, Object> decorated = service.decorateIntelligence(Map.of(), ride);

    assertThat(decorated.get("suggestedTitle")).isEqualTo("Coffee run to Third Wave Coffee");
    assertThat(decorated.get("summaryText")).asString().contains("Third Wave Coffee", "coffee shop");
  }

  @Test
  void staleGenericRideQueuesOneVersionedRefreshButManualTitleDoesNot() {
    RideRepository repository = mock(RideRepository.class);
    RideAiIntelligenceService refreshService = new RideAiIntelligenceService(
        repository, mock(TripRepository.class), mock(SavedPlaceRepository.class),
        mock(DestinationPlaceService.class), new ObjectMapper(), "", "gpt-4o-mini", "https://example.invalid");
    Map<String, Object> genericRide = Map.of(
        "id", "ride-old", "title", "", "aiTitle", "Morning ride", "aiStatus", "ready", "aiContextVersion", 0);

    assertThat(refreshService.processRideIfMissingAsync("owner-1", genericRide)).isTrue();
    verify(repository).markAiPending("owner-1", "ride-old", RideAiIntelligenceService.AI_CONTEXT_VERSION);

    RideRepository manualRepository = mock(RideRepository.class);
    RideAiIntelligenceService manualService = new RideAiIntelligenceService(
        manualRepository, mock(TripRepository.class), mock(SavedPlaceRepository.class),
        mock(DestinationPlaceService.class), new ObjectMapper(), "", "gpt-4o-mini", "https://example.invalid");
    Map<String, Object> manualRide = Map.of(
        "id", "ride-manual", "title", "My breakfast ride", "aiTitle", "Morning ride", "aiStatus", "ready", "aiContextVersion", 0);

    assertThat(manualService.processRideIfMissingAsync("owner-1", manualRide)).isFalse();
    verifyNoInteractions(manualRepository);
  }
}
