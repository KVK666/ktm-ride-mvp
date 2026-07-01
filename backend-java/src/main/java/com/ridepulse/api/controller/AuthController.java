package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.AuthService;
import com.ridepulse.api.service.PasswordResetService;
import com.ridepulse.api.utility.ResponseUtil;
import com.ridepulse.api.utility.ValidationUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthSupport authSupport;
  private final AuthService authService;
  private final PasswordResetService passwordResetService;

  AuthController(AuthSupport authSupport, AuthService authService, PasswordResetService passwordResetService) {
    this.authSupport = authSupport;
    this.authService = authService;
    this.passwordResetService = passwordResetService;
  }

  @PostMapping("/register")
  ApiResponse<Map<String, Object>> register(@RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.created(authService.register(ValidationUtil.requestBody(body, Messages.EMAIL_PASSWORD_REQUIRED)));
  }

  @PostMapping("/login")
  ApiResponse<Map<String, Object>> login(@RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(authService.login(ValidationUtil.requestBody(body, Messages.EMAIL_PASSWORD_REQUIRED)));
  }

  @PostMapping("/forgot-password")
  ApiResponse<Map<String, Object>> forgotPassword(@RequestBody(required = false) Map<String, Object> body) {
    return ResponseUtil.ok(passwordResetService.requestPasswordReset(ValidationUtil.requestBody(body, Messages.VALID_EMAIL_REQUIRED).get("email")));
  }

  @PostMapping("/reset-password")
  ApiResponse<Map<String, Object>> resetPassword(@RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> request = ValidationUtil.requestBody(body, Messages.INVALID_RESET_MESSAGE);
    return ResponseUtil.ok(passwordResetService.completePasswordReset(request.get("token"), request.get("password")));
  }

  @GetMapping("/me")
  ApiResponse<Map<String, Object>> me(HttpServletRequest request) {
    return ResponseUtil.ok(authService.me(authSupport.user(request)));
  }
}
