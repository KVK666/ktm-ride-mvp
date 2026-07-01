package com.ridepulse.api.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.utility.ResponseUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {
  public static final String AUTH_USER_ATTRIBUTE = "ridepulse.authUser";
  private final JwtService jwtService;
  private final ObjectMapper objectMapper;

  JwtAuthFilter(JwtService jwtService, ObjectMapper objectMapper) {
    this.jwtService = jwtService;
    this.objectMapper = objectMapper;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String path = request.getRequestURI();
    if (path.equals("/health")) return true;
    if (!path.startsWith("/api/")) return true;
    return path.equals("/api/auth/register")
        || path.equals("/api/auth/login")
        || path.equals("/api/auth/forgot-password")
        || path.equals("/api/auth/reset-password");
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String header = request.getHeader("Authorization");
    String token = header != null && header.startsWith("Bearer ") ? header.substring(7) : null;
    if (token == null || token.isBlank()) {
      writeUnauthorized(response, Messages.MISSING_TOKEN);
      return;
    }

    try {
      request.setAttribute(AUTH_USER_ATTRIBUTE, jwtService.verify(token));
      chain.doFilter(request, response);
    } catch (Exception ignored) {
      writeUnauthorized(response, Messages.INVALID_TOKEN);
    }
  }

  private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
    response.setStatus(401);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(response.getWriter(), ResponseUtil.error(ProgramCodes.UNAUTHORIZED, message));
  }
}
