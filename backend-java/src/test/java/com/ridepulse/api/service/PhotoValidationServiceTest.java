package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ridepulse.api.http.ApiException;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class PhotoValidationServiceTest {
  private final PhotoValidationService service = new PhotoValidationService();

  @Test
  void acceptsHighQualityProfilePhotosAboveThePreviousLimit() {
    byte[] image = new byte[2 * 1024 * 1024];

    PhotoValidationService.NormalizedPhoto result = service.normalizeProfilePhotoPayload(Map.of(
        "imageBase64", Base64.getEncoder().encodeToString(image),
        "mimeType", "image/jpeg"));

    assertThat(result.data()).hasSize(image.length);
    assertThat(result.mimeType()).isEqualTo("image/jpeg");
  }

  @Test
  void retainsABoundedServerSideProfilePhotoSafeguard() {
    byte[] image = new byte[(4 * 1024 * 1024) + 1];

    assertThatThrownBy(() -> service.normalizeProfilePhotoPayload(Map.of(
        "imageBase64", Base64.getEncoder().encodeToString(image),
        "mimeType", "image/jpeg")))
        .isInstanceOfSatisfying(ApiException.class,
            error -> assertThat(error.status()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE));
  }

  @Test
  void acceptsFourMegabyteRidePhotosAndKeepsClientIdempotencyKey() {
    byte[] image = new byte[4 * 1024 * 1024];

    PhotoValidationService.NormalizedRidePhoto result = service.normalizeRidePhotoPayload(Map.of(
        "imageBase64", Base64.getEncoder().encodeToString(image),
        "mimeType", "image/webp",
        "clientPhotoId", "device-photo-42"));

    assertThat(result.data()).hasSize(image.length);
    assertThat(result.clientPhotoId()).isEqualTo("device-photo-42");
  }
}
