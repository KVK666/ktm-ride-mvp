package com.ridepulse.api.utility;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.constants.ResponseStatuses;
import com.ridepulse.api.dto.ApiResponse;

public final class ResponseUtil {
  private ResponseUtil() {}

  public static <T> ApiResponse<T> ok(T data) {
    return new ApiResponse<>(ResponseStatuses.SUCCESS, ProgramCodes.OK, Messages.SUCCESS, data);
  }

  public static <T> ApiResponse<T> created(T data) {
    return new ApiResponse<>(ResponseStatuses.SUCCESS, ProgramCodes.CREATED, Messages.CREATED, data);
  }

  public static ApiResponse<Void> deleted() {
    return new ApiResponse<>(ResponseStatuses.SUCCESS, ProgramCodes.DELETED, Messages.DELETED, null);
  }

  public static ApiResponse<Void> error(String programCode, String message) {
    return new ApiResponse<>(ResponseStatuses.ERROR, programCode, message, null);
  }
}
