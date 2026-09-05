package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.ResetTokenRow;
import com.ridepulse.api.pojo.ResetUserRow;
import com.ridepulse.api.repository.PasswordResetRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {
  public static final String RESET_REQUEST_MESSAGE = Messages.RESET_REQUEST_MESSAGE;
  public static final String INVALID_RESET_MESSAGE = Messages.INVALID_RESET_MESSAGE;
  private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
  private final PasswordResetRepository passwordResetRepository;
  private final BCryptPasswordEncoder passwordEncoder;
  private final String resetUrlBase;
  private final PasswordResetEmailSender emailSender;
  private final PasswordResetTokenIssuer tokenIssuer;

  public PasswordResetService(
      PasswordResetRepository passwordResetRepository,
      BCryptPasswordEncoder passwordEncoder,
      PasswordResetEmailSender emailSender,
      PasswordResetTokenIssuer tokenIssuer,
      @Value("${ridepulse.password-reset-url-base:}") String resetUrlBase) {
    this.passwordResetRepository = passwordResetRepository;
    this.passwordEncoder = passwordEncoder;
    this.resetUrlBase = resetUrlBase;
    this.emailSender = emailSender;
    this.tokenIssuer = tokenIssuer;
  }

  public Map<String, Object> configStatus() {
    return emailSender.configStatus(resetUrlBase != null && !resetUrlBase.isBlank());
  }

  public Map<String, Object> requestPasswordReset(Object emailValue) {
    String email = normalizeEmail(emailValue);
    validateEmail(email);
    ensurePasswordResetConfig();

    PasswordResetTokenIssuer.IssuedToken issued = tokenIssuer.issue(email);
    if (issued == null) {
      log.info("Password reset requested for unknown account emailDomain={}", emailDomain(email));
      return Map.of("message", RESET_REQUEST_MESSAGE);
    }

    ResetUserRow user = issued.user();
    try {
      emailSender.send(user.email(), user.name() == null || user.name().isBlank() ? Messages.DEFAULT_RIDER_NAME : user.name(), resetUrl(issued.token()));
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
    if (resetUrlBase == null || resetUrlBase.isBlank() || !emailSender.configured("SMTP_HOST") || !emailSender.configured("SMTP_FROM")) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ProgramCodes.TEMPORARILY_UNAVAILABLE, Messages.RESET_UNAVAILABLE);
    }
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

}
