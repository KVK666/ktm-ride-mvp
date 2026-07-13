package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.TripService;
import com.ridepulse.api.utility.ResponseUtil;
import com.ridepulse.api.utility.ValidationUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/trips")
public class TripsController {
  private final AuthSupport authSupport;
  private final TripService tripService;

  TripsController(AuthSupport authSupport, TripService tripService) {
    this.authSupport = authSupport;
    this.tripService = tripService;
  }

  @GetMapping
  ApiResponse<Map<String, Object>> list(HttpServletRequest request) {
    return ResponseUtil.ok(tripService.list(authSupport.userId(request)));
  }

  @PostMapping
  ResponseEntity<ApiResponse<Map<String, Object>>> create(HttpServletRequest request, @RequestBody(required = false) Map<String, Object> body) {
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(ResponseUtil.created(tripService.create(authSupport.userId(request), ValidationUtil.requestBody(body, Messages.TRIP_TITLE_REQUIRED))));
  }

  @GetMapping("/{id}")
  ApiResponse<Map<String, Object>> get(HttpServletRequest request, @PathVariable String id) {
    return ResponseUtil.ok(tripService.get(authSupport.userId(request), ValidationUtil.requiredPath(id, Messages.TRIP_NOT_FOUND)));
  }

  @PatchMapping("/{id}")
  ApiResponse<Map<String, Object>> update(HttpServletRequest request, @PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(tripService.update(authSupport.userId(request), ValidationUtil.requiredPath(id, Messages.TRIP_NOT_FOUND), ValidationUtil.requestBody(body, Messages.TRIP_TITLE_REQUIRED)));
  }

  @DeleteMapping("/{id}")
  ApiResponse<Void> delete(HttpServletRequest request, @PathVariable String id) {
    tripService.delete(authSupport.userId(request), ValidationUtil.requiredPath(id, Messages.TRIP_NOT_FOUND));
    return ResponseUtil.deleted();
  }

  @PostMapping("/{id}/rides")
  ApiResponse<Map<String, Object>> addRide(HttpServletRequest request, @PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(tripService.addRide(authSupport.userId(request), ValidationUtil.requiredPath(id, Messages.TRIP_NOT_FOUND), ValidationUtil.requestBody(body, Messages.RIDE_NOT_FOUND)));
  }

  @DeleteMapping("/{id}/rides/{rideId}")
  ApiResponse<Map<String, Object>> removeRide(HttpServletRequest request, @PathVariable String id, @PathVariable String rideId) {
    return ResponseUtil.ok(tripService.removeRide(
        authSupport.userId(request),
        ValidationUtil.requiredPath(id, Messages.TRIP_NOT_FOUND),
        ValidationUtil.requiredPath(rideId, Messages.RIDE_NOT_FOUND)));
  }
}
