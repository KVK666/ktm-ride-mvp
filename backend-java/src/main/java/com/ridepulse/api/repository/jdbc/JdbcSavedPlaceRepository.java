package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.SavedPlaceRepository;
import com.ridepulse.api.utility.Rows;
import com.ridepulse.api.utility.SqlQueries;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcSavedPlaceRepository implements SavedPlaceRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  public JdbcSavedPlaceRepository(
      @Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc,
      @Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc,
      SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @Override
  public List<Map<String, Object>> list(String userId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.SAVED_PLACE_LIST), userParams(userId), (rs, rowNum) -> place(rs));
  }

  @Override
  public Optional<Map<String, Object>> find(String userId, String placeId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.SAVED_PLACE_BY_ID), placeParams(userId, placeId),
        rs -> rs.next() ? Optional.of(place(rs)) : Optional.empty());
  }

  @Override
  public int count(String userId) {
    Integer count = readOnlyJdbc.queryForObject(sql.get(QueryKeys.SAVED_PLACE_COUNT), userParams(userId), Integer.class);
    return count == null ? 0 : count;
  }

  @Override
  public Map<String, Object> create(String userId, String label, String kind, double latitude, double longitude, int radiusM) {
    return readWriteJdbc.query(sql.get(QueryKeys.SAVED_PLACE_INSERT), values(userId, label, kind, latitude, longitude, radiusM),
        rs -> {
          if (!rs.next()) throw new IllegalStateException("Saved place was not returned");
          return place(rs);
        });
  }

  @Override
  public Optional<Map<String, Object>> update(String userId, String placeId, String label, String kind, double latitude, double longitude, int radiusM) {
    return readWriteJdbc.query(sql.get(QueryKeys.SAVED_PLACE_UPDATE),
        values(userId, label, kind, latitude, longitude, radiusM).addValue("placeId", placeId),
        rs -> rs.next() ? Optional.of(place(rs)) : Optional.empty());
  }

  @Override
  public int delete(String userId, String placeId) {
    return readWriteJdbc.update(sql.get(QueryKeys.SAVED_PLACE_DELETE), placeParams(userId, placeId));
  }

  private Map<String, Object> place(ResultSet rs) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", String.valueOf(rs.getObject("id")));
    row.put("label", rs.getString("label"));
    row.put("kind", rs.getString("kind"));
    row.put("latitude", Rows.numeric(rs.getObject("latitude")));
    row.put("longitude", Rows.numeric(rs.getObject("longitude")));
    row.put("radiusM", Rows.integer(rs.getObject("radius_m")));
    row.put("createdAt", Rows.instantString(rs.getObject("created_at")));
    row.put("updatedAt", Rows.instantString(rs.getObject("updated_at")));
    return row;
  }

  private MapSqlParameterSource values(String userId, String label, String kind, double latitude, double longitude, int radiusM) {
    return userParams(userId)
        .addValue("label", label)
        .addValue("kind", kind)
        .addValue("latitude", latitude)
        .addValue("longitude", longitude)
        .addValue("radiusM", radiusM);
  }

  private MapSqlParameterSource userParams(String userId) {
    return new MapSqlParameterSource("userId", userId);
  }

  private MapSqlParameterSource placeParams(String userId, String placeId) {
    return userParams(userId).addValue("placeId", placeId);
  }
}
