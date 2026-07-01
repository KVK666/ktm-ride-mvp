package com.ridepulse.api.controller;

import com.ridepulse.api.service.PasswordResetService;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.utility.ResponseUtil;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
  private final PasswordResetService passwordResetService;

  HealthController(PasswordResetService passwordResetService) {
    this.passwordResetService = passwordResetService;
  }

  @GetMapping("/health")
  ApiResponse<Map<String, Object>> health(@Value("${RENDER_GIT_COMMIT:local}") String commit) {
    return ResponseUtil.ok(Map.of(
        "ok", true,
        "service", "ktm-ride-backend-java",
        "commit", commit.length() > 7 ? commit.substring(0, 7) : commit,
        "config", Map.of("passwordReset", passwordResetService.configStatus())));
  }
}
