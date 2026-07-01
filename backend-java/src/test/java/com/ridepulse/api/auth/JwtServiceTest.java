package com.ridepulse.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class JwtServiceTest {
  @Test
  void signsAndVerifiesHs256TokenWithRawSecretBytes() {
    JwtService service = new JwtService("local-dev-secret", "30d", new ObjectMapper());
    String token = service.sign("user-1", "rider@example.com");

    AuthUser user = service.verify(token);

    assertThat(token).contains(".");
    assertThat(user.id()).isEqualTo("user-1");
    assertThat(user.email()).isEqualTo("rider@example.com");
  }
}
