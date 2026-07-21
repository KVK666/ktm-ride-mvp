package com.ridepulse.api.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.PasswordResetService;
import com.ridepulse.api.service.RideAiIntelligenceService;
import com.ridepulse.api.service.DestinationPlaceService;
import java.util.Map;
import org.junit.jupiter.api.Test;

class HealthControllerTest {
  @Test
  void healthIncludesNonSecretRideAiConfigStatus() {
    PasswordResetService passwordResetService = mock(PasswordResetService.class);
    RideAiIntelligenceService rideAiIntelligenceService = mock(RideAiIntelligenceService.class);
    DestinationPlaceService destinationPlaceService = mock(DestinationPlaceService.class);
    when(passwordResetService.configStatus()).thenReturn(Map.of("smtpHost", true));
    when(rideAiIntelligenceService.configStatus()).thenReturn(Map.of(
        "apiKeyPresent", true,
        "model", "gpt-test",
        "endpointHost", "api.openai.com"));
    when(destinationPlaceService.configStatus()).thenReturn(Map.of("configured", true));
    HealthController controller = new HealthController(passwordResetService, rideAiIntelligenceService, destinationPlaceService);

    ApiResponse<Map<String, Object>> response = controller.health("1234567890abcdef");

    @SuppressWarnings("unchecked")
    Map<String, Object> config = (Map<String, Object>) response.data().get("config");
    assertThat(config).containsKeys("passwordReset", "rideAi", "destinationPlaces");
    assertThat(config.get("rideAi")).isEqualTo(Map.of(
        "apiKeyPresent", true,
        "model", "gpt-test",
        "endpointHost", "api.openai.com"));
  }
}
