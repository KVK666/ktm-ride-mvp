package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.dto.NormalizedRidePhoto;
import com.ridepulse.api.http.ApiException;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class PhotoValidationService {
  private static final Set<String> ALLOWED_MIME_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
  private static final int MAX_PROFILE_PHOTO_BYTES = 4 * 1024 * 1024;
  private static final int MAX_RIDE_PHOTO_BYTES = 4 * 1024 * 1024;

  public NormalizedPhoto normalizeProfilePhotoPayload(Map<String, Object> body) {
    return normalizePhoto(body, MAX_PROFILE_PHOTO_BYTES, true, Messages.PROFILE_PHOTO_INVALID_MIME);
  }

  public NormalizedRidePhoto normalizeRidePhotoPayload(Map<String, Object> body) {
    NormalizedPhoto photo = normalizePhoto(body, MAX_RIDE_PHOTO_BYTES, false, Messages.RIDE_PHOTO_INVALID_MIME);
    Double latitude = optionalCoordinate(body == null ? null : body.get("latitude"), 90);
    Double longitude = optionalCoordinate(body == null ? null : body.get("longitude"), 180);
    boolean hasLocation = latitude != null && longitude != null;
    return new NormalizedRidePhoto(
        photo.data(),
        photo.mimeType(),
        normalizeOptionalText(body == null ? null : body.get("fileName"), 180),
        normalizeDate(body == null ? null : body.get("createdAt")),
        Instant.now().toString(),
        hasLocation ? latitude : null,
        hasLocation ? longitude : null,
        hasLocation,
        normalizeOptionalText(body == null ? null : body.get("clientPhotoId"), 300));
  }

  private NormalizedPhoto normalizePhoto(Map<String, Object> body, int maxBytes, boolean profilePhoto, String mimeMessage) {
    String mimeType = string(body == null ? null : body.get("mimeType")).trim().toLowerCase();
    String imageBase64 = string(body == null ? null : body.get("imageBase64")).trim();
    if (!ALLOWED_MIME_TYPES.contains(mimeType)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, mimeMessage);
    }
    if (imageBase64.isBlank() || !imageBase64.matches("^[A-Za-z0-9+/]+={0,2}$")) {
      throw new ApiException(HttpStatus.BAD_REQUEST, profilePhoto ? Messages.PROFILE_PHOTO_MISSING_OR_INVALID : Messages.RIDE_PHOTO_MISSING_OR_INVALID);
    }

    byte[] data;
    try {
      data = Base64.getDecoder().decode(imageBase64);
    } catch (IllegalArgumentException error) {
      throw new ApiException(HttpStatus.BAD_REQUEST, profilePhoto ? Messages.PROFILE_PHOTO_MALFORMED : Messages.RIDE_PHOTO_MISSING_OR_INVALID);
    }
    String normalized = Base64.getEncoder().encodeToString(data).replaceAll("=+$", "");
    if (data.length == 0 || !normalized.equals(imageBase64.replaceAll("=+$", ""))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, profilePhoto ? Messages.PROFILE_PHOTO_MALFORMED : Messages.RIDE_PHOTO_MISSING_OR_INVALID);
    }
    if (data.length > maxBytes) {
      String message = profilePhoto ? Messages.PROFILE_PHOTO_TOO_LARGE : Messages.RIDE_PHOTO_TOO_LARGE;
      throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, message);
    }
    return new NormalizedPhoto(data, mimeType);
  }

  private static String normalizeOptionalText(Object value, int maxLength) {
    String text = string(value).trim();
    if (text.isBlank()) return null;
    return text.length() > maxLength ? text.substring(0, maxLength) : text;
  }

  private static String normalizeDate(Object value) {
    if (!(value instanceof String string)) return Instant.now().toString();
    try {
      return Instant.parse(string).toString();
    } catch (Exception ignored) {
      return Instant.now().toString();
    }
  }

  private static Double optionalCoordinate(Object value, int limit) {
    if (value == null || String.valueOf(value).isBlank()) return null;
    Double number = RideMathService.optionalNumber(value);
    return number != null && Math.abs(number) <= limit ? number : null;
  }

  private static String string(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  public record NormalizedPhoto(byte[] data, String mimeType) {}

}
