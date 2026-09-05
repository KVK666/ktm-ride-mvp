package com.ridepulse.api.dto;

public record NormalizedRidePhoto(
    byte[] data,
    String mimeType,
    String fileName,
    String createdAt,
    String importedAt,
    Double latitude,
    Double longitude,
    boolean hasLocation,
    String clientPhotoId) {}
