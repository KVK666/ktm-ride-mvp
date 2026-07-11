package com.ridepulse.api.dto;

public record AnalyticsInsights(
    String generatedAt,
    int ridesLast30Days,
    double distanceLast30DaysM,
    double distancePrevious30DaysM,
    double distanceCurrentMonthM,
    Double distanceTrendPercent,
    int activeDaysLast30Days,
    int currentRideDayStreak,
    double longestRideM,
    double averageRideDistanceM,
    double averageRideDurationS,
    double averageTopSpeedKmh,
    String favoriteWeekday,
    String favoriteTimeOfDay,
    double reviewCompletionPercent,
    int cleanupCandidateCount,
    double projectedMonthDistanceM) {}
