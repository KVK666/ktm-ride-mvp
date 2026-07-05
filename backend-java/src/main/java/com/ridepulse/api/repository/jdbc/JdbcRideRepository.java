package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.service.PhotoValidationService.NormalizedRidePhoto;
import com.ridepulse.api.utility.RowMappers;
import com.ridepulse.api.utility.Rows;
import com.ridepulse.api.utility.SqlQueries;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcRideRepository implements RideRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  public JdbcRideRepository(
      @Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc,
      @Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc,
      SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @Override
  public List<Map<String, Object>> list(String userId, String period, String searchQuery) {
    StringBuilder query = new StringBuilder(sql.get(QueryKeys.RIDE_SELECT)).append(" ").append(sql.get(QueryKeys.RIDE_LIST_BASE)).append(" ");
    if ("today".equals(period)) query.append(sql.get(QueryKeys.RIDE_LIST_TODAY)).append(" ");
    if ("month".equals(period)) query.append(sql.get(QueryKeys.RIDE_LIST_MONTH)).append(" ");
    if ("year".equals(period)) query.append(sql.get(QueryKeys.RIDE_LIST_YEAR)).append(" ");
    query.append(sql.get(QueryKeys.RIDE_LIST_SEARCH)).append(" ");
    query.append(sql.get(QueryKeys.RIDE_LIST_ORDER));
    String normalizedSearch = normalizeSearch(searchQuery);
    MapSqlParameterSource params = userParams(userId)
        .addValue("searchQuery", normalizedSearch)
        .addValue("searchPattern", "%" + normalizedSearch + "%");
    return readOnlyJdbc.query(query.toString(), params, (rs, rowNum) -> Rows.ride(rs));
  }

  @Override
  public Optional<Map<String, Object>> findOwnedRide(String userId, String rideId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.RIDE_SELECT) + " " + sql.get(QueryKeys.RIDE_BY_OWNER), rideParams(userId, rideId), rs -> rs.next() ? Optional.of(Rows.ride(rs)) : Optional.empty());
  }

  @Override
  public boolean ownedRideExists(String userId, String rideId) {
    return Boolean.TRUE.equals(readOnlyJdbc.query(sql.get(QueryKeys.RIDE_EXISTS), rideParams(userId, rideId), (ResultSetExtractor<Boolean>) rs -> rs.next()));
  }

  @Override
  public List<Map<String, Object>> points(String rideId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.RIDE_POINTS_FULL), rideParams(rideId), (rs, rowNum) -> Rows.point(rs));
  }

  @Override
  public List<Map<String, Object>> intelligencePoints(String rideId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.RIDE_POINTS_INTELLIGENCE), rideParams(rideId), (rs, rowNum) -> Rows.point(rs));
  }

  @Override
  public Map<String, Object> intelligenceStats(String userId) {
    return readOnlyJdbc.queryForMap(sql.get(QueryKeys.RIDE_INTELLIGENCE_STATS), userParams(userId));
  }

  @Override
  public List<Map<String, Object>> duplicates(String userId, String rideId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.RIDE_DUPLICATES), rideParams(userId, rideId), (rs, rowNum) -> Rows.ride(rs));
  }

  @Override
  @Transactional
  public Optional<Map<String, Object>> patch(String userId, String rideId, String title, String notes, boolean markReviewed) {
    MapSqlParameterSource params = rideParams(userId, rideId)
        .addValue("title", title)
        .addValue("notes", notes)
        .addValue("markReviewed", markReviewed);
    return readWriteJdbc.query(sql.get(QueryKeys.RIDE_PATCH), params, rs -> {
      if (!rs.next()) return Optional.empty();
      Map<String, Object> row = new java.util.LinkedHashMap<>();
      row.put("id", String.valueOf(rs.getObject("id")));
      row.put("title", rs.getString("title"));
      row.put("notes", rs.getString("notes"));
      row.put("reviewedAt", Rows.instantString(rs.getObject("reviewed_at")));
      return Optional.of(row);
    });
  }

  @Override
  public Optional<Map<String, Object>> findByClientRideId(String userId, String clientRideId) {
    MapSqlParameterSource params = userParams(userId).addValue("clientRideId", clientRideId);
    return readOnlyJdbc.query(sql.get(QueryKeys.RIDE_BY_CLIENT_ID), params, rs -> {
      if (!rs.next()) return Optional.empty();
      Map<String, Object> summary = new java.util.LinkedHashMap<>();
      summary.put("distanceM", Rows.numeric(rs.getObject("distance_m")));
      summary.put("durationS", Rows.numeric(rs.getObject("duration_s")));
      summary.put("topSpeedKmh", Rows.numeric(rs.getObject("top_speed_kmh")));
      summary.put("avgSpeedKmh", Rows.numeric(rs.getObject("avg_speed_kmh")));
      Map<String, Object> response = new java.util.LinkedHashMap<>();
      response.put("rideId", String.valueOf(rs.getObject("id")));
      response.put("duplicate", true);
      response.put("summary", summary);
      response.put("created", false);
      return Optional.of(response);
    });
  }

  @Override
  @Transactional
  public String insertRide(String userId, Map<String, Object> body, String rideClientId, String startedAt, String endedAt, List<Map<String, Object>> points, Map<String, Object> summary) {
    Map<String, Object> start = points.get(0);
    Map<String, Object> end = points.get(points.size() - 1);
    MapSqlParameterSource params = userParams(userId)
        .addValue("startLabel", body.get("startLabel"))
        .addValue("endLabel", body.get("endLabel"))
        .addValue("startLatitude", start.get("latitude"))
        .addValue("startLongitude", start.get("longitude"))
        .addValue("endLatitude", end.get("latitude"))
        .addValue("endLongitude", end.get("longitude"))
        .addValue("distanceM", summary.get("distanceM"))
        .addValue("durationS", summary.get("durationS"))
        .addValue("topSpeedKmh", summary.get("topSpeedKmh"))
        .addValue("avgSpeedKmh", summary.get("avgSpeedKmh"))
        .addValue("clientRideId", rideClientId)
        .addValue("startedAt", startedAt)
        .addValue("endedAt", endedAt);
    KeyHolder keyHolder = new GeneratedKeyHolder();
    readWriteJdbc.update(sql.get(QueryKeys.RIDE_INSERT), params, keyHolder, new String[] {"id"});
    Object id = keyHolder.getKeys() == null ? null : keyHolder.getKeys().get("id");
    return String.valueOf(id);
  }

  @Override
  @Transactional
  public void insertPoints(String rideId, List<Map<String, Object>> points) {
    MapSqlParameterSource[] batch = points.stream()
        .map(point -> rideParams(rideId)
            .addValue("latitude", point.get("latitude"))
            .addValue("longitude", point.get("longitude"))
            .addValue("altitudeM", point.get("altitudeM"))
            .addValue("accuracyM", point.get("accuracyM"))
            .addValue("speedKmh", point.get("speedKmh"))
            .addValue("recordedAt", point.get("recordedAt")))
        .toArray(MapSqlParameterSource[]::new);
    readWriteJdbc.batchUpdate(sql.get(QueryKeys.RIDE_INSERT_POINT), batch);
  }

  @Override
  @Transactional
  public void markAiPending(String userId, String rideId) {
    readWriteJdbc.update(sql.get(QueryKeys.RIDE_AI_MARK_PENDING), rideParams(userId, rideId));
  }

  @Override
  @Transactional
  public void saveAiIntelligence(String userId, String rideId, Map<String, Object> intelligence) {
    MapSqlParameterSource params = rideParams(userId, rideId)
        .addValue("aiTitle", text(intelligence.get("aiTitle")))
        .addValue("aiSummary", text(intelligence.get("aiSummary")))
        .addValue("rideKind", text(intelligence.get("rideKind")))
        .addValue("rideKindConfidence", number(intelligence.get("rideKindConfidence")))
        .addValue("rideKindReason", text(intelligence.get("rideKindReason")))
        .addValue("keyInsight", text(intelligence.get("keyInsight")))
        .addValue("bestMoment", text(intelligence.get("bestMoment")))
        .addValue("tripSuggestion", jsonText(intelligence.get("tripSuggestion")))
        .addValue("aiStatus", text(intelligence.get("aiStatus"), "fallback"));
    readWriteJdbc.update(sql.get(QueryKeys.RIDE_AI_SAVE), params);
  }

  @Override
  @Transactional
  public int delete(String userId, String rideId) {
    return readWriteJdbc.update(sql.get(QueryKeys.RIDE_DELETE), rideParams(userId, rideId));
  }

  @Override
  public List<Map<String, Object>> photos(String userId, String rideId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.RIDE_PHOTO_LIST), rideParams(userId, rideId), (rs, rowNum) -> RowMappers.ridePhoto(rs, true));
  }

  @Override
  @Transactional
  public Map<String, Object> insertPhoto(String userId, String rideId, NormalizedRidePhoto photo) {
    MapSqlParameterSource params = rideParams(userId, rideId)
        .addValue("imageData", photo.data())
        .addValue("mimeType", photo.mimeType())
        .addValue("fileName", photo.fileName())
        .addValue("createdAt", photo.createdAt())
        .addValue("importedAt", photo.importedAt())
        .addValue("latitude", photo.latitude())
        .addValue("longitude", photo.longitude())
        .addValue("hasLocation", photo.hasLocation());
    KeyHolder keyHolder = new GeneratedKeyHolder();
    readWriteJdbc.update(sql.get(QueryKeys.RIDE_PHOTO_INSERT), params, keyHolder, new String[] {"id"});
    Object photoId = keyHolder.getKeys() == null ? null : keyHolder.getKeys().get("id");
    return readWriteJdbc.query(
        sql.get(QueryKeys.RIDE_PHOTO_BY_ID),
        rideParams(userId, rideId).addValue("photoId", String.valueOf(photoId)),
        rs -> rs.next() ? RowMappers.ridePhoto(rs, true) : Map.of());
  }

  @Override
  @Transactional
  public int deletePhoto(String userId, String rideId, String photoId) {
    return readWriteJdbc.update(sql.get(QueryKeys.RIDE_PHOTO_DELETE), rideParams(userId, rideId).addValue("photoId", photoId));
  }

  private MapSqlParameterSource userParams(String userId) {
    return new MapSqlParameterSource("userId", userId);
  }

  private MapSqlParameterSource rideParams(String rideId) {
    return new MapSqlParameterSource("rideId", rideId);
  }

  private MapSqlParameterSource rideParams(String userId, String rideId) {
    return userParams(userId).addValue("rideId", rideId);
  }

  private static String normalizeSearch(String value) {
    if (value == null) return "";
    return value.trim().toLowerCase();
  }

  private static String text(Object value) {
    return text(value, null);
  }

  private static String text(Object value, String fallback) {
    if (value == null) return fallback;
    String text = String.valueOf(value).trim();
    return text.isBlank() ? fallback : text;
  }

  private static Double number(Object value) {
    if (value == null) return null;
    if (value instanceof Number number) return number.doubleValue();
    try {
      return Double.parseDouble(String.valueOf(value));
    } catch (NumberFormatException ignored) {
      return null;
    }
  }

  private static String jsonText(Object value) {
    if (value == null) return "{}";
    String text = String.valueOf(value).trim();
    return text.isBlank() ? "{}" : text;
  }
}
