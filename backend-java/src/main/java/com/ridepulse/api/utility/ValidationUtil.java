package com.ridepulse.api.utility;

import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import java.util.Map;
import org.springframework.http.HttpStatus;

public final class ValidationUtil {
  private ValidationUtil() {}

  public static Map<String, Object> requestBody(Map<String, Object> body, String message) {
    if (body == null) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, message);
    }
    return body;
  }

  public static String requiredPath(String value, String message) {
    if (value == null || value.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, message);
    }
    return value;
  }
}
