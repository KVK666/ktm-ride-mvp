package com.ridepulse.api.dto;

import java.util.Map;

public record CreateRideResult(boolean created, Map<String, Object> body) {}
