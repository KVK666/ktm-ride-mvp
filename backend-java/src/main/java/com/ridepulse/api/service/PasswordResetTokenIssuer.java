package com.ridepulse.api.service;

import com.ridepulse.api.pojo.ResetUserRow;
import com.ridepulse.api.repository.PasswordResetRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class PasswordResetTokenIssuer {
  private static final SecureRandom RANDOM = new SecureRandom();
  private final PasswordResetRepository repository;

  PasswordResetTokenIssuer(PasswordResetRepository repository) {
    this.repository = repository;
  }

  @Transactional
  public IssuedToken issue(String email) {
    ResetUserRow user = repository.findUserByEmail(email).orElse(null);
    if (user == null) return null;
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    repository.markExistingTokensUsed(user.id());
    repository.createToken(user.id(), PasswordResetService.hashResetToken(token), Instant.now().plusSeconds(1800).toString());
    return new IssuedToken(user, token);
  }

  record IssuedToken(ResetUserRow user, String token) {}
}
