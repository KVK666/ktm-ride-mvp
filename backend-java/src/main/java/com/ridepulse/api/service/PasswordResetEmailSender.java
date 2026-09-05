package com.ridepulse.api.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
class PasswordResetEmailSender {
  private final Environment environment;
  private final PasswordResetEmailTemplate template;

  PasswordResetEmailSender(Environment environment, PasswordResetEmailTemplate template) {
    this.environment = environment;
    this.template = template;
  }

  Map<String, Object> configStatus(boolean resetUrlConfigured) {
    return Map.of(
        "resetUrl", resetUrlConfigured,
        "smtpHost", configured("SMTP_HOST"),
        "smtpPort", environment.getProperty("SMTP_PORT", "587"),
        "smtpSecure", "true".equalsIgnoreCase(environment.getProperty("SMTP_SECURE")) || "465".equals(environment.getProperty("SMTP_PORT")),
        "smtpUser", configured("SMTP_USER"),
        "smtpPass", configured("SMTP_PASS"),
        "smtpFrom", configured("SMTP_FROM"));
  }

  void send(String to, String name, String link) throws Exception {
    JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
    mailSender.setHost(environment.getProperty("SMTP_HOST"));
    mailSender.setPort(parseInt(environment.getProperty("SMTP_PORT"), 587));
    if (configured("SMTP_USER") || configured("SMTP_PASS")) {
      mailSender.setUsername(environment.getProperty("SMTP_USER"));
      mailSender.setPassword(environment.getProperty("SMTP_PASS"));
    }
    mailSender.getJavaMailProperties().put("mail.smtp.auth", String.valueOf(configured("SMTP_USER") || configured("SMTP_PASS")));
    mailSender.getJavaMailProperties().put("mail.smtp.starttls.enable", String.valueOf(!"true".equalsIgnoreCase(environment.getProperty("SMTP_SECURE"))));
    mailSender.getJavaMailProperties().put("mail.smtp.ssl.enable", String.valueOf("true".equalsIgnoreCase(environment.getProperty("SMTP_SECURE")) || "465".equals(environment.getProperty("SMTP_PORT"))));

    mailSender.getJavaMailProperties().put("mail.smtp.connectiontimeout", "10000");
    mailSender.getJavaMailProperties().put("mail.smtp.timeout", "10000");
    mailSender.getJavaMailProperties().put("mail.smtp.writetimeout", "10000");

    MimeMessage message = mailSender.createMimeMessage();
    MimeMessageHelper helper = multipartMessageHelper(message);
    helper.setFrom(environment.getProperty("SMTP_FROM"));
    helper.setTo(to);
    helper.setSubject("Reset your RidePulse password");
    helper.setText(
        "Hi " + name + ",\n\nUse this link to reset your RidePulse password. It expires in 30 minutes:\n" + link
            + "\n\nIf you did not request this, you can ignore this email.",
        template.render(name, link));
    mailSender.send(message);
  }

  static MimeMessageHelper multipartMessageHelper(MimeMessage message) throws MessagingException {
    return new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
  }

  boolean configured(String key) {
    String value = environment.getProperty(key);
    return value != null && !value.isBlank();
  }

  private static int parseInt(String value, int fallback) {
    try {
      return value == null ? fallback : Integer.parseInt(value);
    } catch (NumberFormatException ignored) {
      return fallback;
    }
  }

}
