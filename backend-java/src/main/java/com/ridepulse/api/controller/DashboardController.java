package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.DashboardService;
import com.ridepulse.api.utility.ResponseUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
  private final AuthSupport authSupport;
  private final DashboardService dashboardService;

  DashboardController(AuthSupport authSupport, DashboardService dashboardService) {
    this.authSupport = authSupport;
    this.dashboardService = dashboardService;
  }

  @GetMapping
  ApiResponse<Map<String, Object>> dashboard(HttpServletRequest request) {
    return ResponseUtil.ok(dashboardService.dashboard(authSupport.user(request).id()));
  }
}
