package com.ridepulse.api.dto;

public record RideListQuery(
    String period,
    String searchQuery,
    String reviewStatus,
    String sort,
    int fetchLimit,
    RideListCursor cursor) {}
