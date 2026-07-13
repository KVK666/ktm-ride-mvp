package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.AnalyticsService;
import com.ridepulse.api.utility.ResponseUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {
  private final AuthSupport authSupport;
  private final AnalyticsService analyticsService;

  AnalyticsController(AuthSupport authSupport, AnalyticsService analyticsService) {
    this.authSupport = authSupport;
    this.analyticsService = analyticsService;
  }

  @GetMapping("/distance")
  ApiResponse<Map<String, Object>> distance(HttpServletRequest request, @RequestParam(defaultValue = "daily") String bucket) {
    return ResponseUtil.ok(analyticsService.distance(authSupport.userId(request), bucket));
  }

  @GetMapping("/insights")
  ApiResponse<Map<String, Object>> insights(
      HttpServletRequest request,
      @RequestParam(defaultValue = "UTC") String timezone) {
    return ResponseUtil.ok(analyticsService.insights(authSupport.userId(request), timezone));
  }

  @GetMapping("/speed/{rideId}")
  ApiResponse<Map<String, Object>> speed(HttpServletRequest request, @PathVariable String rideId) {
    return ResponseUtil.ok(analyticsService.speed(authSupport.userId(request), rideId));
  }
}
