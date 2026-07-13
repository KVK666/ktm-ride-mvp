package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.service.ProfileService;
import com.ridepulse.api.utility.ResponseUtil;
import com.ridepulse.api.utility.ValidationUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profile")
public class ProfileController {
  private final AuthSupport authSupport;
  private final ProfileService profileService;

  ProfileController(AuthSupport authSupport, ProfileService profileService) {
    this.authSupport = authSupport;
    this.profileService = profileService;
  }

  @GetMapping("/photo")
  ResponseEntity<?> getPhoto(HttpServletRequest request) {
    PhotoRow row = profileService.photo(authSupport.userId(request));
    byte[] data = row.data();
    String mime = row.mimeType();
    String accept = request.getHeader("Accept");
    if (accept != null && accept.contains("application/json")) {
      Map<String, Object> body = new LinkedHashMap<>();
      body.put("imageBase64", Base64.getEncoder().encodeToString(data));
      body.put("mimeType", mime);
      body.put("updatedAt", row.updatedAt());
      return ResponseEntity.ok(ResponseUtil.ok(body));
    }
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(mime))
        .cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePrivate())
        .lastModified(parseLastModified(row.updatedAt()))
        .body(data);
  }

  @PutMapping("/photo")
  ApiResponse<Map<String, Object>> putPhoto(HttpServletRequest request, @RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(profileService.updatePhoto(authSupport.userId(request), ValidationUtil.requestBody(body, "Profile photo data is missing or invalid")));
  }

  @DeleteMapping("/photo")
  ApiResponse<Map<String, Object>> deletePhoto(HttpServletRequest request) {
    return ResponseUtil.ok(profileService.deletePhoto(authSupport.userId(request)));
  }

  private long parseLastModified(Object value) {
    try {
      return Instant.parse(String.valueOf(value)).toEpochMilli();
    } catch (Exception ignored) {
      return Instant.now().toEpochMilli();
    }
  }
}
