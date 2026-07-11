package com.ridepulse.api.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.auth.AuthUser;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.service.AnalyticsService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class AnalyticsControllerTest {
  @Test
  void insightsUsesTheAuthenticatedOwnerId() {
    AuthSupport authSupport = mock(AuthSupport.class);
    AnalyticsService analyticsService = mock(AnalyticsService.class);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/analytics/insights");
    Map<String, Object> expected = Map.of("insights", Map.of("ridesLast30Days", 2));
    when(authSupport.user(request)).thenReturn(new AuthUser("owner-1", "owner@example.com"));
    when(analyticsService.insights("owner-1", "Asia/Kolkata")).thenReturn(expected);
    AnalyticsController controller = new AnalyticsController(authSupport, analyticsService);

    ApiResponse<Map<String, Object>> response = controller.insights(request, "Asia/Kolkata");

    verify(analyticsService).insights("owner-1", "Asia/Kolkata");
    assertThat(response.data()).isEqualTo(expected);
  }

  @Test
  void insightsRejectsRequestsWithoutAnAuthenticatedUser() {
    AnalyticsService analyticsService = mock(AnalyticsService.class);
    AnalyticsController controller = new AnalyticsController(new AuthSupport(), analyticsService);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/analytics/insights");

    assertThatThrownBy(() -> controller.insights(request, "UTC"))
        .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.status()).isEqualTo(HttpStatus.UNAUTHORIZED));
  }
}
