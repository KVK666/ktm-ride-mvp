package com.ridepulse.api.pojo;

public record AuthUserRow(
    String id,
    String email,
    String passwordHash,
    String name,
    String bikeModel,
    boolean hasProfilePhoto,
    String profilePhotoUpdatedAt) {}
