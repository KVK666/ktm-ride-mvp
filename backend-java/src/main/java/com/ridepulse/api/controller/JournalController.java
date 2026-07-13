package com.ridepulse.api.controller;

import com.ridepulse.api.auth.AuthSupport;
import com.ridepulse.api.dto.ApiResponse;
import com.ridepulse.api.service.JournalExperienceService;
import com.ridepulse.api.utility.ResponseUtil;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/api/journal", "/api/home"})
public class JournalController {
  private final AuthSupport authSupport;
  private final JournalExperienceService journalExperienceService;

  JournalController(AuthSupport authSupport, JournalExperienceService journalExperienceService) {
    this.authSupport = authSupport;
    this.journalExperienceService = journalExperienceService;
  }

  @GetMapping
  ApiResponse<Map<String, Object>> journal(HttpServletRequest request) {
    return ResponseUtil.ok(journalExperienceService.journal(authSupport.userId(request), request.getRequestURI().endsWith("/home")));
  }
}
