package com.ridepulse.api.dto;

public record RideListQuery(
    String period,
    String searchQuery,
    String reviewStatus,
    String sort,
    String startedFrom,
    String startedBefore,
    int fetchLimit,
    RideListCursor cursor) {}
