package com.ridepulse.api.http;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RequestLoggingFilter extends OncePerRequestFilter {
  private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);
  private static final String REQUEST_ID_HEADER = "X-Request-Id";

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String requestId = requestId(request);
    long startedAt = System.currentTimeMillis();
    response.setHeader(REQUEST_ID_HEADER, requestId);
    try {
      filterChain.doFilter(request, response);
    } finally {
      log.info(
          "api requestId={} method={} path={} status={} durationMs={}",
          requestId,
          request.getMethod(),
          request.getRequestURI(),
          response.getStatus(),
          System.currentTimeMillis() - startedAt);
    }
  }

  private String requestId(HttpServletRequest request) {
    String requestId = request.getHeader(REQUEST_ID_HEADER);
    if (requestId == null || requestId.isBlank() || requestId.length() > 80) {
      return UUID.randomUUID().toString();
    }
    return requestId;
  }
}
