package com.ridepulse.api.dto;

public record ApiResponse<T>(
    String status,
    String programCode,
    String message,
    T data) {}
