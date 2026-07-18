package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.TripRepository;
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
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcTripRepository implements TripRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  public JdbcTripRepository(
      @Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc,
      @Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc,
      SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @Override
  public List<Map<String, Object>> list(String userId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.TRIP_LIST), userParams(userId), (rs, rowNum) -> trip(rs));
  }

  @Override
  public List<Map<String, Object>> listForRide(String userId, String rideId) {
    return readOnlyJdbc.query(
        sql.get(QueryKeys.TRIP_LIST_FOR_RIDE),
        userParams(userId).addValue("rideId", rideId),
        (rs, rowNum) -> trip(rs));
  }

  @Override
  public Optional<Map<String, Object>> find(String userId, String tripId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.TRIP_BY_ID), tripParams(userId, tripId), rs -> rs.next() ? Optional.of(trip(rs)) : Optional.empty());
  }

  @Override
  public Optional<Map<String, Object>> findFresh(String userId, String tripId) {
    return readWriteJdbc.query(sql.get(QueryKeys.TRIP_BY_ID), tripParams(userId, tripId), rs -> rs.next() ? Optional.of(trip(rs)) : Optional.empty());
  }

  @Override
  public List<Map<String, Object>> rides(String userId, String tripId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.TRIP_RIDES), tripParams(userId, tripId), (rs, rowNum) -> Rows.ride(rs));
  }

  @Override
  public List<Map<String, Object>> ridesFresh(String userId, String tripId) {
    return readWriteJdbc.query(sql.get(QueryKeys.TRIP_RIDES), tripParams(userId, tripId), (rs, rowNum) -> Rows.ride(rs));
  }

  @Override
  @Transactional
  public String create(String userId, String title, String description) {
    MapSqlParameterSource params = userParams(userId)
        .addValue("title", title)
        .addValue("description", description);
    return readWriteJdbc.query(sql.get(QueryKeys.TRIP_INSERT), params, rs -> rs.next() ? String.valueOf(rs.getObject("id")) : null);
  }

  @Override
  @Transactional
  public int update(String userId, String tripId, String title, String description) {
    return readWriteJdbc.update(sql.get(QueryKeys.TRIP_UPDATE), tripParams(userId, tripId).addValue("title", title).addValue("description", description));
  }

  @Override
  @Transactional
  public int delete(String userId, String tripId) {
    return readWriteJdbc.update(sql.get(QueryKeys.TRIP_DELETE), tripParams(userId, tripId));
  }

  @Override
  @Transactional
  public int addRide(String tripId, String rideId) {
    return readWriteJdbc.update(sql.get(QueryKeys.TRIP_ADD_RIDE), rideParams(tripId, rideId));
  }

  @Override
  @Transactional
  public int addRides(String tripId, List<String> rideIds) {
    if (rideIds == null || rideIds.isEmpty()) return 0;
    int added = 0;
    for (String rideId : rideIds) {
      added += addRide(tripId, rideId);
    }
    return added;
  }

  @Override
  @Transactional
  public int removeRide(String tripId, String rideId) {
    return readWriteJdbc.update(sql.get(QueryKeys.TRIP_REMOVE_RIDE), rideParams(tripId, rideId));
  }

  @Override
  @Transactional
  public int touch(String userId, String tripId) {
    return readWriteJdbc.update(sql.get(QueryKeys.TRIP_TOUCH), tripParams(userId, tripId));
  }

  private Map<String, Object> trip(ResultSet rs) throws SQLException {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("id", String.valueOf(rs.getObject("id")));
    row.put("title", rs.getString("title"));
    row.put("description", rs.getString("description"));
    row.put("coverRideId", rs.getObject("cover_ride_id") == null ? null : String.valueOf(rs.getObject("cover_ride_id")));
    row.put("rideCount", Rows.integer(rs.getObject("ride_count")));
    row.put("distanceM", Rows.integer(rs.getObject("distance_m")));
    row.put("startedAt", Rows.instantString(rs.getObject("started_at")));
    row.put("endedAt", Rows.instantString(rs.getObject("ended_at")));
    row.put("createdAt", Rows.instantString(rs.getObject("created_at")));
    row.put("updatedAt", Rows.instantString(rs.getObject("updated_at")));
    return row;
  }

  private MapSqlParameterSource userParams(String userId) {
    return new MapSqlParameterSource("userId", userId);
  }

  private MapSqlParameterSource tripParams(String userId, String tripId) {
    return userParams(userId).addValue("tripId", tripId);
  }

  private MapSqlParameterSource rideParams(String tripId, String rideId) {
    return new MapSqlParameterSource("tripId", tripId).addValue("rideId", rideId);
  }
}
