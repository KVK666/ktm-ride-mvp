package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.MimeMessageHelper;

class PasswordResetServiceTest {
  @Test
  void hashResetTokenMatchesSha256HexContract() {
    assertThat(PasswordResetService.hashResetToken("ridepulse-token"))
        .isEqualTo("c5f6d4b1637c6178ede07849ae5c4b2891aa23a9689951abbe3a38fddb09950a");
  }

  @Test
  void resetEmailSupportsPlainTextAndHtmlAlternatives() throws Exception {
    MimeMessage message = new MimeMessage(Session.getInstance(new Properties()));
    MimeMessageHelper helper = PasswordResetService.multipartMessageHelper(message);

    helper.setText("Plain text", "<p>HTML text</p>");
    message.saveChanges();

    assertThat(message.getContentType()).startsWith("multipart/mixed");
  }

  @Test
  void resetEmailHtmlIsBrandedActionableAndEscaped() {
    String html = PasswordResetService.resetEmailHtml("Rider <One>", "https://example.com/reset?token=a&b");

    assertThat(html)
        .contains("RidePulse", "Reset your password", "This link expires in 30 minutes", "Reset password")
        .contains("#c8ff5a", "#101606")
        .contains("Rider &lt;One&gt;")
        .contains("https://example.com/reset?token=a&amp;b")
        .doesNotContain("#f97316", "#fb923c", "#ea580c")
        .doesNotContain("Rider <One>");
  }
}
