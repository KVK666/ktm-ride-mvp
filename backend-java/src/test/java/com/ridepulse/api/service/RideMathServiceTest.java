package com.ridepulse.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RideMathServiceTest {
  private final RideMathService service = new RideMathService();
  private final Map<String, Object> bangaloreA = Map.of(
      "latitude", 12.9716,
      "longitude", 77.5946,
      "recordedAt", "2026-05-10T10:00:00.000Z");
  private final Map<String, Object> bangaloreB = Map.of(
      "latitude", 12.9726,
      "longitude", 77.5946,
      "recordedAt", "2026-05-10T10:01:00.000Z");

  @Test
  void distanceMetersMatchesExistingBackendRange() {
    double distance = service.distanceMeters(bangaloreA, bangaloreB);
    assertThat(distance).isGreaterThan(100).isLessThan(120);
  }

  @Test
  void summarizeRideKeepsReliableTopSpeedBehavior() {
    Map<String, Object> summary = service.summarizeRide(List.of(
        withSpeed(bangaloreA, 0, null),
        withSpeed(bangaloreB, 30, null),
        Map.of("latitude", 12.9736, "longitude", 77.5946, "recordedAt", "2026-05-10T10:01:08.000Z", "speedKmh", 32)),
        "2026-05-10T10:00:00.000Z",
        "2026-05-10T10:01:08.000Z");

    assertThat(((Number) summary.get("distanceM")).longValue()).isGreaterThan(100);
    assertThat(summary.get("durationS")).isEqualTo(68);
    assertThat(summary.get("topSpeedKmh")).isEqualTo(32.0);
  }

  @Test
  void summarizeRideRejectsUnsupportedSpeedSpikes() {
    Map<String, Object> summary = service.summarizeRide(List.of(
        withSpeed(bangaloreA, 40, 8),
        withSpeed(bangaloreB, 180, 8),
        Map.of("latitude", 12.9736, "longitude", 77.5946, "recordedAt", "2026-05-10T10:01:08.000Z", "speedKmh", 42, "accuracyM", 8),
        Map.of("latitude", 12.9746, "longitude", 77.5946, "recordedAt", "2026-05-10T10:01:16.000Z", "speedKmh", 43, "accuracyM", 8)),
        "2026-05-10T10:00:00.000Z",
        "2026-05-10T10:01:16.000Z");

    assertThat(summary.get("topSpeedKmh")).isEqualTo(43.0);
  }

  @Test
  void summarizeRideHandlesMalformedInputSafely() {
    Map<String, Object> summary = service.summarizeRide(List.of(
        Map.of("latitude", Double.NaN, "longitude", 77.5946, "recordedAt", "not-a-date", "speedKmh", Double.NaN),
        Map.of("latitude", 12.9736, "longitude", 77.5946, "recordedAt", "also-bad", "speedKmh", 30)),
        "not-a-date",
        "also-bad");

    assertThat(summary).containsEntry("distanceM", 0L);
    assertThat(summary).containsEntry("durationS", 0);
    assertThat(summary).containsEntry("topSpeedKmh", 0.0);
    assertThat(summary).containsEntry("avgSpeedKmh", 0.0);
  }

  private Map<String, Object> withSpeed(Map<String, Object> point, double speedKmh, Integer accuracyM) {
    java.util.LinkedHashMap<String, Object> copy = new java.util.LinkedHashMap<>(point);
    copy.put("speedKmh", speedKmh);
    if (accuracyM != null) copy.put("accuracyM", accuracyM);
    return copy;
  }
}
