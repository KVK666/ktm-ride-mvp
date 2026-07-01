package com.ridepulse.api.http;

import com.ridepulse.api.constants.ProgramCodes;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
  private final HttpStatus status;
  private final String programCode;

  public ApiException(HttpStatus status, String message) {
    this(status, defaultProgramCode(status), message);
  }

  public ApiException(HttpStatus status, String programCode, String message) {
    super(message);
    this.status = status;
    this.programCode = programCode;
  }

  public HttpStatus status() {
    return status;
  }

  public String programCode() {
    return programCode;
  }

  private static String defaultProgramCode(HttpStatus status) {
    if (status == HttpStatus.BAD_REQUEST) return ProgramCodes.BAD_REQUEST;
    if (status == HttpStatus.UNAUTHORIZED) return ProgramCodes.UNAUTHORIZED;
    if (status == HttpStatus.NOT_FOUND) return ProgramCodes.NOT_FOUND;
    if (status == HttpStatus.CONFLICT) return ProgramCodes.CONFLICT;
    if (status == HttpStatus.PAYLOAD_TOO_LARGE) return ProgramCodes.PAYLOAD_TOO_LARGE;
    if (status == HttpStatus.SERVICE_UNAVAILABLE) return ProgramCodes.TEMPORARILY_UNAVAILABLE;
    return ProgramCodes.SERVER_ERROR;
  }
}
