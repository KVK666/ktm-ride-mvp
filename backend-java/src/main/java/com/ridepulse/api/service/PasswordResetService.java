package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.ResetTokenRow;
import com.ridepulse.api.pojo.ResetUserRow;
import com.ridepulse.api.repository.PasswordResetRepository;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {
  public static final String RESET_REQUEST_MESSAGE = Messages.RESET_REQUEST_MESSAGE;
  public static final String INVALID_RESET_MESSAGE = Messages.INVALID_RESET_MESSAGE;
  private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
  private static final SecureRandom RANDOM = new SecureRandom();
  private final PasswordResetRepository passwordResetRepository;
  private final BCryptPasswordEncoder passwordEncoder;
  private final String resetUrlBase;

  public PasswordResetService(
      PasswordResetRepository passwordResetRepository,
      BCryptPasswordEncoder passwordEncoder,
      @Value("${ridepulse.password-reset-url-base:}") String resetUrlBase) {
    this.passwordResetRepository = passwordResetRepository;
    this.passwordEncoder = passwordEncoder;
    this.resetUrlBase = resetUrlBase;
  }

  public Map<String, Object> configStatus() {
    return Map.of(
        "resetUrl", envPresent("PASSWORD_RESET_URL_BASE"),
        "smtpHost", envPresent("SMTP_HOST"),
        "smtpPort", System.getenv().getOrDefault("SMTP_PORT", "587"),
        "smtpSecure", "true".equalsIgnoreCase(System.getenv("SMTP_SECURE")) || "465".equals(System.getenv("SMTP_PORT")),
        "smtpUser", envPresent("SMTP_USER"),
        "smtpPass", envPresent("SMTP_PASS"),
        "smtpFrom", envPresent("SMTP_FROM"));
  }

  @Transactional
  public Map<String, Object> requestPasswordReset(Object emailValue) {
    String email = normalizeEmail(emailValue);
    validateEmail(email);
    ensurePasswordResetConfig();

    ResetUserRow user = passwordResetRepository.findUserByEmail(email).orElse(null);
    if (user == null) {
      log.info("Password reset requested for unknown account emailDomain={}", emailDomain(email));
      return Map.of("message", RESET_REQUEST_MESSAGE);
    }

    String token = createResetToken();
    String tokenHash = hashResetToken(token);
    passwordResetRepository.markExistingTokensUsed(user.id());
    passwordResetRepository.createToken(user.id(), tokenHash, Instant.now().plusSeconds(30 * 60).toString());

    try {
      sendResetEmail(user.email(), user.name() == null || user.name().isBlank() ? Messages.DEFAULT_RIDER_NAME : user.name(), resetUrl(token));
      log.info("Password reset email accepted by SMTP userId={} emailDomain={}", user.id(), emailDomain(user.email()));
    } catch (Exception error) {
      log.warn("Password reset email failed userId={} emailDomain={} message={}", user.id(), emailDomain(user.email()), error.getMessage());
    }
    return Map.of("message", RESET_REQUEST_MESSAGE);
  }

  @Transactional
  public Map<String, Object> completePasswordReset(Object tokenValue, Object passwordValue) {
    String token = String.valueOf(tokenValue == null ? "" : tokenValue).trim();
    String password = String.valueOf(passwordValue == null ? "" : passwordValue);
    if (token.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, INVALID_RESET_MESSAGE);
    }
    if (password.length() < 8) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.RESET_PASSWORD_TOO_SHORT);
    }

    ResetTokenRow row = passwordResetRepository.findValidTokenForUpdate(hashResetToken(token))
        .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, INVALID_RESET_MESSAGE));
    passwordResetRepository.updatePassword(row.userId(), passwordEncoder.encode(password));
    passwordResetRepository.markTokenUsed(row.id());
    return Map.of("message", Messages.RESET_PASSWORD_UPDATED);
  }

  public String resetUrl(String token) {
    if (resetUrlBase == null || resetUrlBase.isBlank()) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ProgramCodes.TEMPORARILY_UNAVAILABLE, Messages.RESET_UNAVAILABLE);
    }
    String separator = resetUrlBase.contains("?") ? "&" : "?";
    return resetUrlBase + separator + "token=" + token;
  }

  public static String hashResetToken(String token) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(String.valueOf(token).getBytes(StandardCharsets.UTF_8)));
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  private void ensurePasswordResetConfig() {
    if (resetUrlBase == null || resetUrlBase.isBlank() || !envPresent("SMTP_HOST") || !envPresent("SMTP_FROM")) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ProgramCodes.TEMPORARILY_UNAVAILABLE, Messages.RESET_UNAVAILABLE);
    }
  }

  private void sendResetEmail(String to, String name, String link) throws Exception {
    JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
    mailSender.setHost(System.getenv("SMTP_HOST"));
    mailSender.setPort(parseInt(System.getenv("SMTP_PORT"), 587));
    if (envPresent("SMTP_USER") || envPresent("SMTP_PASS")) {
      mailSender.setUsername(System.getenv("SMTP_USER"));
      mailSender.setPassword(System.getenv("SMTP_PASS"));
    }
    mailSender.getJavaMailProperties().put("mail.smtp.auth", String.valueOf(envPresent("SMTP_USER") || envPresent("SMTP_PASS")));
    mailSender.getJavaMailProperties().put("mail.smtp.starttls.enable", String.valueOf(!"true".equalsIgnoreCase(System.getenv("SMTP_SECURE"))));
    mailSender.getJavaMailProperties().put("mail.smtp.ssl.enable", String.valueOf("true".equalsIgnoreCase(System.getenv("SMTP_SECURE")) || "465".equals(System.getenv("SMTP_PORT"))));

    MimeMessage message = mailSender.createMimeMessage();
    MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
    helper.setFrom(System.getenv("SMTP_FROM"));
    helper.setTo(to);
    helper.setSubject("Reset your RidePulse password");
    helper.setText(
        "Hi " + name + ",\n\nUse this link to reset your RidePulse password. It expires in 30 minutes:\n" + link
            + "\n\nIf you did not request this, you can ignore this email.",
        "<div style=\"font-family: Arial, sans-serif; color: #111827; line-height: 1.5;\"><p>Hi "
            + escapeHtml(name)
            + ",</p><p>Use this link to reset your RidePulse password. It expires in 30 minutes.</p><p><a href=\""
            + escapeHtml(link)
            + "\" style=\"color: #2563eb;\">Reset password</a></p><p>If you did not request this, you can ignore this email.</p></div>");
    mailSender.send(message);
  }

  private static String createResetToken() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static void validateEmail(String email) {
    if (email.isBlank() || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.VALID_EMAIL_REQUIRED);
    }
  }

  private static String normalizeEmail(Object value) {
    return String.valueOf(value == null ? "" : value).trim().toLowerCase();
  }

  private static String emailDomain(String email) {
    int at = email.indexOf('@');
    return at >= 0 ? email.substring(at + 1) : "unknown";
  }

  private static boolean envPresent(String key) {
    String value = System.getenv(key);
    return value != null && !value.isBlank();
  }

  private static int parseInt(String value, int fallback) {
    try {
      return value == null ? fallback : Integer.parseInt(value);
    } catch (NumberFormatException ignored) {
      return fallback;
    }
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
