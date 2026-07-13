package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.ReportsService;
import com.ridepulse.api.utility.ResponseUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
public class ReportsController {
  private final AuthSupport authSupport;
  private final ReportsService reportsService;

  ReportsController(AuthSupport authSupport, ReportsService reportsService) {
    this.authSupport = authSupport;
    this.reportsService = reportsService;
  }

  @GetMapping
  ApiResponse<Map<String, Object>> report(HttpServletRequest request, @RequestParam(defaultValue = "month") String period, @RequestParam(required = false) String date) {
    return ResponseUtil.ok(reportsService.report(authSupport.userId(request), period, date));
  }
}
