package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.ResetTokenRow;
import com.ridepulse.api.pojo.ResetUserRow;
import com.ridepulse.api.repository.PasswordResetRepository;
import jakarta.mail.MessagingException;
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
    MimeMessageHelper helper = multipartMessageHelper(message);
    helper.setFrom(System.getenv("SMTP_FROM"));
    helper.setTo(to);
    helper.setSubject("Reset your RidePulse password");
    helper.setText(
        "Hi " + name + ",\n\nUse this link to reset your RidePulse password. It expires in 30 minutes:\n" + link
            + "\n\nIf you did not request this, you can ignore this email.",
        resetEmailHtml(name, link));
    mailSender.send(message);
  }

  static MimeMessageHelper multipartMessageHelper(MimeMessage message) throws MessagingException {
    return new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
  }

  static String resetEmailHtml(String name, String link) {
    String safeName = escapeHtml(name);
    String safeLink = escapeHtml(link);
    return """
        <!doctype html>
        <html lang="en">
          <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
            <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
              <tr><td align="center">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(24,24,27,.08);">
                  <tr><td style="background:#18181b;padding:28px 36px;color:#ffffff;">
                    <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#fb923c;font-weight:700;">RidePulse</div>
                    <div style="font-size:26px;line-height:1.25;font-weight:700;margin-top:8px;">Reset your password</div>
                  </td></tr>
                  <tr><td style="padding:34px 36px 18px;">
                    <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Hi %s,</p>
                    <p style="font-size:16px;line-height:1.6;margin:0 0 24px;color:#3f3f46;">We received a request to reset your RidePulse password. Use the button below to choose a new one.</p>
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:10px;background:#f97316;">
                      <a href="%s" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;">Reset password</a>
                    </td></tr></table>
                    <div style="margin:24px 0;padding:14px 16px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:14px;line-height:1.5;"><strong>This link expires in 30 minutes.</strong> For your security, it can only be used once.</div>
                    <p style="font-size:14px;line-height:1.6;margin:0;color:#71717a;">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
                  </td></tr>
                  <tr><td style="padding:18px 36px 34px;">
                    <p style="font-size:12px;line-height:1.5;margin:0 0 8px;color:#a1a1aa;">Button not working? Copy and paste this link into your browser:</p>
                    <p style="font-size:12px;line-height:1.5;margin:0;word-break:break-all;"><a href="%s" style="color:#ea580c;">%s</a></p>
                  </td></tr>
                  <tr><td style="border-top:1px solid #e4e4e7;padding:20px 36px;text-align:center;color:#a1a1aa;font-size:12px;">RidePulse · Your rides, remembered.</td></tr>
                </table>
              </td></tr>
            </table>
          </body>
        </html>
        """.formatted(safeName, safeLink, safeLink, safeLink);
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
