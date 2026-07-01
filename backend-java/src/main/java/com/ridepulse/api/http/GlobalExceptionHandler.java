package com.ridepulse.api.http;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.utility.ResponseUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {
  private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  ResponseEntity<ApiResponse<Void>> api(ApiException error) {
    return ResponseEntity.status(error.status()).body(ResponseUtil.error(error.programCode(), error.getMessage()));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<ApiResponse<Void>> badJson() {
    return ResponseEntity.badRequest().body(ResponseUtil.error(ProgramCodes.BAD_REQUEST, Messages.INVALID_JSON));
  }

  @ExceptionHandler(DuplicateKeyException.class)
  ResponseEntity<ApiResponse<Void>> duplicate() {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(ResponseUtil.error(ProgramCodes.CONFLICT, Messages.REQUEST_CONFLICT));
  }

  @ExceptionHandler(NoHandlerFoundException.class)
  ResponseEntity<ApiResponse<Void>> notFound(NoHandlerFoundException error) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(ResponseUtil.error(ProgramCodes.NOT_FOUND, Messages.ROUTE_NOT_FOUND + ": " + error.getHttpMethod() + " " + error.getRequestURL()));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<ApiResponse<Void>> unexpected(Exception error) {
    log.error(Messages.UNEXPECTED_ERROR, error);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ResponseUtil.error(ProgramCodes.SERVER_ERROR, Messages.UNEXPECTED_ERROR));
  }
}
