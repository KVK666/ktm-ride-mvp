package com.ridepulse.api.utility;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

public final class Rows {
  private Rows() {}

  public static Map<String, Object> ride(ResultSet rs) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", string(rs, "id"));
    row.put("startLabel", rs.getString("start_label"));
    row.put("endLabel", rs.getString("end_label"));
    row.put("startLatitude", number(rs.getObject("start_latitude")));
    row.put("startLongitude", number(rs.getObject("start_longitude")));
    row.put("endLatitude", number(rs.getObject("end_latitude")));
    row.put("endLongitude", number(rs.getObject("end_longitude")));
    row.put("distanceM", intNumber(rs.getObject("distance_m")));
    row.put("durationS", intNumber(rs.getObject("duration_s")));
    row.put("topSpeedKmh", number(rs.getObject("top_speed_kmh")));
    row.put("avgSpeedKmh", number(rs.getObject("avg_speed_kmh")));
    row.put("title", rs.getString("title"));
    row.put("notes", rs.getString("notes"));
    row.put("reviewedAt", instantString(rs.getObject("reviewed_at")));
    row.put("startedAt", instantString(rs.getObject("started_at")));
    row.put("endedAt", instantString(rs.getObject("ended_at")));
    row.put("createdAt", instantString(rs.getObject("created_at")));
    String source = rs.getString("source");
    if (source == null || source.isBlank()) source = "ridepulse";
    String speedDataQuality = rs.getString("speed_data_quality");
    if (speedDataQuality == null || speedDataQuality.isBlank()) {
      speedDataQuality = "google_timeline".equals(source) ? "unavailable" : "recorded";
    }
    row.put("source", source);
    row.put("sourceActivityType", rs.getString("source_activity_type"));
    row.put("speedDataQuality", speedDataQuality);
    row.put("aiTitle", rs.getString("ai_title"));
    row.put("aiSummary", rs.getString("ai_summary"));
    row.put("rideKind", rs.getString("ride_kind"));
    row.put("rideKindConfidence", numberOrNull(rs.getObject("ride_kind_confidence")));
    row.put("rideKindReason", rs.getString("ride_kind_reason"));
    row.put("keyInsight", rs.getString("key_insight"));
    row.put("bestMoment", rs.getString("best_moment"));
    row.put("tripSuggestion", rs.getString("trip_suggestion"));
    row.put("aiStatus", rs.getString("ai_status"));
    row.put("aiGeneratedAt", instantString(rs.getObject("ai_generated_at")));
    row.put("destinationName", rs.getString("destination_name"));
    row.put("destinationCategory", rs.getString("destination_category"));
    row.put("destinationAddress", rs.getString("destination_address"));
    row.put("destinationSource", rs.getString("destination_source"));
    row.put("aiContextVersion", intNumber(rs.getObject("ai_context_version")));
    return row;
  }

  public static Map<String, Object> point(ResultSet rs) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("latitude", number(rs.getObject("latitude")));
    row.put("longitude", number(rs.getObject("longitude")));
    putIfPresent(row, "altitudeM", numberOrNull(rs.getObject("altitude_m")));
    putIfPresent(row, "accuracyM", numberOrNull(rs.getObject("accuracy_m")));
    putIfPresent(row, "speedKmh", numberOrNull(rs.getObject("speed_kmh")));
    row.put("recordedAt", instantString(rs.getObject("recorded_at")));
    return row;
  }

  public static Map<String, Object> speedPoint(ResultSet rs) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("speedKmh", numberOrNull(rs.getObject("speed_kmh")));
    row.put("recordedAt", instantString(rs.getObject("recorded_at")));
    return row;
  }

  public static Map<String, Object> user(ResultSet rs) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", string(rs, "id"));
    row.put("email", rs.getString("email"));
    row.put("name", rs.getString("name"));
    row.put("bikeModel", rs.getString("bike_model"));
    row.put("hasProfilePhoto", rs.getBoolean("has_profile_photo"));
    row.put("profilePhotoUpdatedAt", instantString(rs.getObject("profile_photo_updated_at")));
    return row;
  }

  public static double numeric(Object value) {
    Object number = number(value);
    return number instanceof Integer integer ? integer.doubleValue() : (Double) number;
  }

  public static int integer(Object value) {
    Object number = intNumber(value);
    return number instanceof Integer integer ? integer : ((Double) number).intValue();
  }

  public static Object number(Object value) {
    if (value == null) return 0d;
    if (value instanceof BigDecimal decimal) return decimal.doubleValue();
    if (value instanceof Number number) return number.doubleValue();
    try {
      return Double.parseDouble(String.valueOf(value));
    } catch (NumberFormatException ignored) {
      return 0d;
    }
  }

  public static Object intNumber(Object value) {
    if (value == null) return 0;
    if (value instanceof Number number) return number.intValue();
    try {
      return Integer.parseInt(String.valueOf(value));
    } catch (NumberFormatException ignored) {
      return 0;
    }
  }

  public static Object numberOrNull(Object value) {
    if (value == null) return null;
    return number(value);
  }

  public static String instantString(Object value) {
    if (value == null) return null;
    if (value instanceof Timestamp timestamp) return timestamp.toInstant().toString();
    if (value instanceof OffsetDateTime offsetDateTime) return offsetDateTime.toInstant().toString();
    if (value instanceof java.util.Date date) return date.toInstant().toString();
    return String.valueOf(value);
  }

  private static String string(ResultSet rs, String column) throws SQLException {
    Object value = rs.getObject(column);
    return value == null ? null : String.valueOf(value);
  }

  private static void putIfPresent(Map<String, Object> row, String key, Object value) {
    if (value != null) row.put(key, value);
  }
}
