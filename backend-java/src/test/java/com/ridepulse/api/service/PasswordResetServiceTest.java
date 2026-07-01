package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PasswordResetServiceTest {
  @Test
  void hashResetTokenMatchesSha256HexContract() {
    assertThat(PasswordResetService.hashResetToken("ridepulse-token"))
        .isEqualTo("c5f6d4b1637c6178ede07849ae5c4b2891aa23a9689951abbe3a38fddb09950a");
  }
}
