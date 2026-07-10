package com.ridepulse.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.http.ApiException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class JwtAuthFilterTest {
  @Test
  void letsDownstreamFailuresPropagateAfterTokenVerification() throws Exception {
    JwtService jwtService = mock(JwtService.class);
    JwtAuthFilter filter = new JwtAuthFilter(jwtService, new ObjectMapper());
    MockHttpServletRequest request = authenticatedRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();
    FilterChain chain = mock(FilterChain.class);

    when(jwtService.verify("valid-token")).thenReturn(new AuthUser("user-1", "rider@example.com"));
    org.mockito.Mockito.doThrow(new ServletException("database unavailable"))
        .when(chain).doFilter(request, response);

    assertThatThrownBy(() -> filter.doFilter(request, response, chain))
        .isInstanceOf(ServletException.class)
        .hasMessage("database unavailable");
    assertThat(response.getStatus()).isEqualTo(200);
  }

  @Test
  void returnsUnauthorizedOnlyWhenTokenVerificationFails() throws Exception {
    JwtService jwtService = mock(JwtService.class);
    JwtAuthFilter filter = new JwtAuthFilter(jwtService, new ObjectMapper());
    MockHttpServletRequest request = authenticatedRequest();
    MockHttpServletResponse response = new MockHttpServletResponse();

    when(jwtService.verify("valid-token"))
        .thenThrow(new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", Messages.INVALID_TOKEN));

    filter.doFilter(request, response, mock(FilterChain.class));

    assertThat(response.getStatus()).isEqualTo(401);
    assertThat(response.getContentAsString()).contains(Messages.INVALID_TOKEN);
  }

  private static MockHttpServletRequest authenticatedRequest() {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/dashboard");
    request.addHeader("Authorization", "Bearer valid-token");
    return request;
  }
}
