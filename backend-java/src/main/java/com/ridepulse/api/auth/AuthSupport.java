package com.ridepulse.api.auth;

import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class AuthSupport {
  public AuthUser user(HttpServletRequest request) {
    Object value = request.getAttribute(JwtAuthFilter.AUTH_USER_ATTRIBUTE);
    if (value instanceof AuthUser user) {
      return user;
    }
    throw new ApiException(HttpStatus.UNAUTHORIZED, ProgramCodes.UNAUTHORIZED, Messages.MISSING_TOKEN);
  }
}
