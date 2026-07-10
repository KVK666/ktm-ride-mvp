package com.ridepulse.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ridepulse.api.http.ApiException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class JwtServiceTest {
  private static final String SECRET = "local-dev-secret";

  @Test
  void signsAndVerifiesHs256TokenWithRawSecretBytes() {
    JwtService service = new JwtService(SECRET, "30d", new ObjectMapper());
    String token = service.sign("user-1", "rider@example.com");

    AuthUser user = service.verify(token);

    assertThat(token).contains(".");
    assertThat(user.id()).isEqualTo("user-1");
    assertThat(user.email()).isEqualTo("rider@example.com");
  }

  @Test
  void rejectsSignedTokensWithoutExpiry() {
    JwtService service = new JwtService(SECRET, "30d", new ObjectMapper());
    String token = token(Map.of("id", "user-1", "email", "rider@example.com"));

    assertThatThrownBy(() -> service.verify(token)).isInstanceOf(ApiException.class);
  }

  @Test
  void rejectsSignedTokensWithoutIdentityClaims() {
    JwtService service = new JwtService(SECRET, "30d", new ObjectMapper());
    String token = token(Map.of("exp", Instant.now().plusSeconds(60).getEpochSecond()));

    assertThatThrownBy(() -> service.verify(token)).isInstanceOf(ApiException.class);
  }

  private static String token(Map<String, Object> claims) {
    try {
      ObjectMapper mapper = new ObjectMapper();
      String header = Base64.getUrlEncoder().withoutPadding()
          .encodeToString(mapper.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT")));
      String payload = Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(claims));
      String unsigned = header + "." + payload;
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      String signature = Base64.getUrlEncoder().withoutPadding()
          .encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
      return unsigned + "." + signature;
    } catch (Exception error) {
      throw new IllegalStateException(error);
    }
  }
}
