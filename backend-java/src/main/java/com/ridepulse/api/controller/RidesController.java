package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.dto.CreateRideResult;
import com.ridepulse.api.service.RideService;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rides")
public class RidesController {
  private final AuthSupport authSupport;
  private final RideService rideService;

  RidesController(AuthSupport authSupport, RideService rideService) {
    this.authSupport = authSupport;
    this.rideService = rideService;
  }

  @GetMapping
  ApiResponse<Map<String, Object>> list(HttpServletRequest request, @RequestParam(defaultValue = "all") String period) {
    return ResponseUtil.ok(rideService.list(authSupport.user(request).id(), period));
  }

  @GetMapping("/{id}/intelligence")
  ApiResponse<Map<String, Object>> intelligence(HttpServletRequest request, @PathVariable String id) {
    return ResponseUtil.ok(rideService.intelligence(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND)));
  }

  @GetMapping("/{id}/duplicates")
  ApiResponse<Map<String, Object>> duplicates(HttpServletRequest request, @PathVariable String id) {
    return ResponseUtil.ok(rideService.duplicates(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND)));
  }

  @GetMapping("/{id}/photos")
  ApiResponse<Map<String, Object>> photos(HttpServletRequest request, @PathVariable String id) {
    return ResponseUtil.ok(rideService.photos(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND)));
  }

  @PostMapping("/{id}/photos")
  ResponseEntity<ApiResponse<Map<String, Object>>> addPhoto(HttpServletRequest request, @PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(ResponseUtil.created(rideService.addPhoto(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND), ValidationUtil.requestBody(body, Messages.RIDE_PHOTO_MISSING_OR_INVALID))));
  }

  @DeleteMapping("/{id}/photos/{photoId}")
  ApiResponse<Void> deletePhoto(HttpServletRequest request, @PathVariable String id, @PathVariable String photoId) {
    rideService.deletePhoto(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND), ValidationUtil.requiredPath(photoId, Messages.RIDE_PHOTO_NOT_FOUND));
    return ResponseUtil.deleted();
  }

  @GetMapping("/{id}")
  ApiResponse<Map<String, Object>> get(HttpServletRequest request, @PathVariable String id) {
    return ResponseUtil.ok(rideService.get(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND)));
  }

  @PatchMapping("/{id}")
  ApiResponse<Map<String, Object>> patch(HttpServletRequest request, @PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(rideService.patch(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND), ValidationUtil.requestBody(body, Messages.RIDE_NOT_FOUND)));
  }

  @PostMapping
  ResponseEntity<ApiResponse<Map<String, Object>>> create(
      HttpServletRequest request,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      @RequestBody(required = false) Map<String, Object> body) {
    CreateRideResult result = rideService.create(authSupport.user(request).id(), idempotencyKey, ValidationUtil.requestBody(body, Messages.ROUTE_REQUIRES_POINTS));
    return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .body(result.created() ? ResponseUtil.created(result.body()) : ResponseUtil.ok(result.body()));
  }

  @DeleteMapping("/{id}")
  ApiResponse<Void> delete(HttpServletRequest request, @PathVariable String id) {
    rideService.delete(authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.RIDE_NOT_FOUND));
    return ResponseUtil.deleted();
  }
}
