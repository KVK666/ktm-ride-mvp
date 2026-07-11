package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.AnalyticsRepository;
import com.ridepulse.api.utility.Rows;
import com.ridepulse.api.utility.SqlQueries;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAnalyticsRepository implements AnalyticsRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final SqlQueries sql;

  public JdbcAnalyticsRepository(@Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc, SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.sql = sql;
  }

  @Override
  public List<Map<String, Object>> distance(String userId, String grain) {
    MapSqlParameterSource params = new MapSqlParameterSource().addValue("userId", userId).addValue("grain", grain);
    return readOnlyJdbc.query(sql.get(QueryKeys.ANALYTICS_DISTANCE), params, (rs, rowNum) -> {
      Map<String, Object> point = new LinkedHashMap<>();
      point.put("bucket", Rows.instantString(rs.getObject("bucket")));
      point.put("distanceM", Rows.numeric(rs.getObject("distance_m")));
      point.put("rideCount", Rows.integer(rs.getObject("ride_count")));
      point.put("durationS", Rows.numeric(rs.getObject("duration_s")));
      point.put("topSpeedKmh", Rows.numeric(rs.getObject("top_speed_kmh")));
      point.put("avgSpeedKmh", Rows.numeric(rs.getObject("avg_speed_kmh")));
      return point;
    });
  }

  @Override
  public List<Map<String, Object>> speed(String rideId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.ANALYTICS_SPEED), new MapSqlParameterSource("rideId", rideId), (rs, rowNum) -> Rows.speedPoint(rs));
  }

  @Override
  public List<Map<String, Object>> insightRides(String userId) {
    return readOnlyJdbc.query(
        sql.get(QueryKeys.ANALYTICS_INSIGHT_RIDES),
        new MapSqlParameterSource("userId", userId),
        (rs, rowNum) -> {
          Map<String, Object> ride = new LinkedHashMap<>();
          ride.put("distanceM", Rows.numeric(rs.getObject("distance_m")));
          ride.put("durationS", Rows.numeric(rs.getObject("duration_s")));
          ride.put("topSpeedKmh", Rows.numeric(rs.getObject("top_speed_kmh")));
          ride.put("reviewedAt", Rows.instantString(rs.getObject("reviewed_at")));
          ride.put("startedAt", Rows.instantString(rs.getObject("started_at")));
          return ride;
        });
  }
}
