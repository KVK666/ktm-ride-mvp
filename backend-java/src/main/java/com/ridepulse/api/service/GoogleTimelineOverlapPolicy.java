package com.ridepulse.api.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.time.format.DateTimeParseException;
import static com.ridepulse.api.service.GoogleTimelinePayload.*;

final class GoogleTimelineOverlapPolicy {
  private GoogleTimelineOverlapPolicy() {}
  static Map<String, Object> firstOverlap(List<Map<String, Object>> intervals, ImportedRide ride) {
    Instant rideStart = Instant.parse(ride.startedAt());
    Instant rideEnd = Instant.parse(ride.endedAt());
    for (Map<String, Object> interval : intervals) {
      Instant intervalStart = instantOrNull(first(interval, "startedAt", "started_at"));
      if (intervalStart == null) continue;
      if (!intervalStart.isBefore(rideEnd)) break;
      Instant intervalEnd = instantOrNull(first(interval, "endedAt", "ended_at"));
      if (intervalEnd == null) intervalEnd = intervalStart;
      if (intervalEnd.isAfter(rideStart)) return interval;
    }
    return null;
  }

  static Instant instantOrNull(Object value) {
    if (value == null) return null;
    try {
      return Instant.parse(String.valueOf(value));
    } catch (DateTimeParseException ignored) {
      return null;
    }
  }

  static Map<String, Object> batchOverlap(List<ImportedRide> accepted, ImportedRide candidate) {
    Instant start = Instant.parse(candidate.startedAt());
    Instant end = Instant.parse(candidate.endedAt());
    for (ImportedRide prior : accepted) {
      if (start.isBefore(Instant.parse(prior.endedAt())) && end.isAfter(Instant.parse(prior.startedAt()))) {
        return Map.of("clientRideId", prior.clientRideId(), "source", "batch");
      }
    }
    return null;
  }

}
