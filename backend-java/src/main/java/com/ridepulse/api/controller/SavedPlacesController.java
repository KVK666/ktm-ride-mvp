package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.SavedPlaceService;
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
@RequestMapping("/api/places")
public class SavedPlacesController {
  private final AuthSupport authSupport;
  private final SavedPlaceService savedPlaceService;

  SavedPlacesController(AuthSupport authSupport, SavedPlaceService savedPlaceService) {
    this.authSupport = authSupport;
    this.savedPlaceService = savedPlaceService;
  }

  @GetMapping
  ApiResponse<Map<String, Object>> list(HttpServletRequest request) {
    return ResponseUtil.ok(savedPlaceService.list(authSupport.user(request).id()));
  }

  @PostMapping
  ResponseEntity<ApiResponse<Map<String, Object>>> create(
      HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(ResponseUtil.created(savedPlaceService.create(
        authSupport.user(request).id(), ValidationUtil.requestBody(body, Messages.SAVED_PLACE_COORDINATES_INVALID))));
  }

  @PatchMapping("/{id}")
  ApiResponse<Map<String, Object>> update(
      HttpServletRequest request,
      @PathVariable String id,
      @RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(savedPlaceService.update(
        authSupport.user(request).id(),
        ValidationUtil.requiredPath(id, Messages.SAVED_PLACE_NOT_FOUND),
        ValidationUtil.requestBody(body, Messages.SAVED_PLACE_COORDINATES_INVALID)));
  }

  @DeleteMapping("/{id}")
  ApiResponse<Void> delete(HttpServletRequest request, @PathVariable String id) {
    savedPlaceService.delete(
        authSupport.user(request).id(), ValidationUtil.requiredPath(id, Messages.SAVED_PLACE_NOT_FOUND));
    return ResponseUtil.deleted();
  }
}
