package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.GoogleTimelineImportService;
import com.ridepulse.api.utility.ResponseUtil;
import com.ridepulse.api.utility.ValidationUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/imports/google-timeline")
public class GoogleTimelineImportController {
  private final AuthSupport authSupport;
  private final GoogleTimelineImportService importService;

  GoogleTimelineImportController(AuthSupport authSupport, GoogleTimelineImportService importService) {
    this.authSupport = authSupport;
    this.importService = importService;
  }

  @PostMapping("/check")
  ApiResponse<Map<String, Object>> check(
      HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(importService.check(
        authSupport.userId(request),
        ValidationUtil.requestBody(body, Messages.GOOGLE_TIMELINE_RIDES_REQUIRED)));
  }

  @PostMapping("/rides")
  ResponseEntity<ApiResponse<Map<String, Object>>> rides(
      HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> response = importService.importRides(
        authSupport.userId(request),
        ValidationUtil.requestBody(body, Messages.GOOGLE_TIMELINE_RIDES_REQUIRED));
    return ResponseEntity.status(Boolean.TRUE.equals(response.get("created")) ? HttpStatus.CREATED : HttpStatus.OK)
        .body(Boolean.TRUE.equals(response.get("created")) ? ResponseUtil.created(response) : ResponseUtil.ok(response));
  }

  @PostMapping("/trips")
  ResponseEntity<ApiResponse<Map<String, Object>>> trips(
      HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> response = importService.importTrips(
        authSupport.userId(request),
        ValidationUtil.requestBody(body, Messages.GOOGLE_TIMELINE_TRIPS_REQUIRED));
    return ResponseEntity.status(Boolean.TRUE.equals(response.get("created")) ? HttpStatus.CREATED : HttpStatus.OK)
        .body(Boolean.TRUE.equals(response.get("created")) ? ResponseUtil.created(response) : ResponseUtil.ok(response));
  }
}
