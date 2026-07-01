package com.ridepulse.api.service;

import com.ridepulse.api.repository.ReportsRepository;
import com.ridepulse.api.utility.Rows;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ReportsService {
  private final ReportsRepository reportsRepository;

  ReportsService(ReportsRepository reportsRepository) {
    this.reportsRepository = reportsRepository;
  }

  public Map<String, Object> report(String userId, String period, String date) {
    String grain = "year".equals(period) ? "year" : "day".equals(period) ? "day" : "month";
    String anchor = normalizeAnchor(date);
    Map<String, Object> row = reportsRepository.summary(userId, grain, anchor);

    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("rideCount", Rows.integer(row.get("ride_count")));
    summary.put("distanceM", Rows.numeric(row.get("distance_m")));
    summary.put("durationS", Rows.numeric(row.get("duration_s")));
    summary.put("averageSpeedKmh", Rows.numeric(row.get("avg_speed_kmh")));
    summary.put("topSpeedKmh", Rows.numeric(row.get("top_speed_kmh")));

    Map<String, Object> response = new LinkedHashMap<>();
    response.put("period", period);
    response.put("generatedAt", Instant.now().toString());
    response.put("summary", summary);
    response.put("routes", reportsRepository.routes(userId, grain, anchor));
    return response;
  }

  private static String normalizeAnchor(String date) {
    try {
      return date == null || date.isBlank()
          ? Instant.now().toString()
          : LocalDate.parse(date).atStartOfDay().toInstant(ZoneOffset.UTC).toString();
    } catch (Exception ignored) {
      return Instant.now().toString();
    }
  }
}
