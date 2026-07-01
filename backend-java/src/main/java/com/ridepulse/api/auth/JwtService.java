package com.ridepulse.api.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
  private final String secret;
  private final String expiresIn;
  private final ObjectMapper objectMapper;

  public JwtService(
      @Value("${ridepulse.jwt-secret:}") String secret,
      @Value("${ridepulse.jwt-expires-in:30d}") String expiresIn,
      ObjectMapper objectMapper) {
    this.secret = secret;
    this.expiresIn = expiresIn;
    this.objectMapper = objectMapper;
  }

  public String sign(String id, String email) {
    if (secret == null || secret.isBlank()) {
      throw new IllegalStateException("JWT_SECRET is not configured");
    }
    Instant now = Instant.now();
    Map<String, Object> header = Map.of("alg", "HS256", "typ", "JWT");
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("id", id);
    payload.put("email", email);
    payload.put("iat", now.getEpochSecond());
    payload.put("exp", now.plus(parseExpiry(expiresIn)).getEpochSecond());
    String unsigned = base64Json(header) + "." + base64Json(payload);
    return unsigned + "." + hmac(unsigned);
  }

  public AuthUser verify(String token) {
    try {
      String[] parts = token.split("\\.", -1);
      if (parts.length != 3) {
        throw new IllegalArgumentException("Bad JWT");
      }
      String unsigned = parts[0] + "." + parts[1];
      if (!constantTimeEquals(hmac(unsigned), parts[2])) {
        throw new IllegalArgumentException("Bad JWT signature");
      }
      Map<String, Object> claims = objectMapper.readValue(
          Base64.getUrlDecoder().decode(parts[1]),
          new TypeReference<Map<String, Object>>() {});
      Object exp = claims.get("exp");
      if (exp instanceof Number number && Instant.now().getEpochSecond() >= number.longValue()) {
        throw new IllegalArgumentException("Expired JWT");
      }
      return new AuthUser(String.valueOf(claims.get("id")), String.valueOf(claims.get("email")));
    } catch (Exception error) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ProgramCodes.UNAUTHORIZED, Messages.INVALID_TOKEN);
    }
  }

  private String base64Json(Map<String, Object> value) {
    try {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(objectMapper.writeValueAsBytes(value));
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  private String hmac(String value) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }

  private static boolean constantTimeEquals(String left, String right) {
    byte[] a = left.getBytes(StandardCharsets.UTF_8);
    byte[] b = right.getBytes(StandardCharsets.UTF_8);
    int diff = a.length ^ b.length;
    for (int index = 0; index < Math.min(a.length, b.length); index += 1) {
      diff |= a[index] ^ b[index];
    }
    return diff == 0;
  }

  private static Duration parseExpiry(String value) {
    String clean = value == null || value.isBlank() ? "30d" : value.trim().toLowerCase();
    try {
      if (clean.endsWith("d")) return Duration.ofDays(Long.parseLong(clean.substring(0, clean.length() - 1)));
      if (clean.endsWith("h")) return Duration.ofHours(Long.parseLong(clean.substring(0, clean.length() - 1)));
      if (clean.endsWith("m")) return Duration.ofMinutes(Long.parseLong(clean.substring(0, clean.length() - 1)));
      if (clean.endsWith("s")) return Duration.ofSeconds(Long.parseLong(clean.substring(0, clean.length() - 1)));
      return Duration.ofSeconds(Long.parseLong(clean));
    } catch (NumberFormatException ignored) {
      return Duration.ofDays(30);
    }
  }
}
