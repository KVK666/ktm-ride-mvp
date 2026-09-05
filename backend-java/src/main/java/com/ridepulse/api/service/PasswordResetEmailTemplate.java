package com.ridepulse.api.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
class PasswordResetEmailTemplate {
  private final String template;

  PasswordResetEmailTemplate() throws IOException {
    template = new ClassPathResource("mail/password-reset.html").getContentAsString(StandardCharsets.UTF_8);
  }

  String render(String name, String link) {
    return template.replace("${name}", escapeHtml(name)).replace("${link}", escapeHtml(link));
  }

  private static String escapeHtml(String value) {
    return String.valueOf(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }
}
