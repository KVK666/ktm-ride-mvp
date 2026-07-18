package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.ReportsRepository;
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
public class JdbcReportsRepository implements ReportsRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final SqlQueries sql;

  public JdbcReportsRepository(@Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc, SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.sql = sql;
  }

  @Override
  public Map<String, Object> summary(String userId, String grain, String anchor) {
    return readOnlyJdbc.queryForMap(sql.get(QueryKeys.REPORTS_SUMMARY), params(userId, grain, anchor));
  }

  @Override
  public List<Map<String, Object>> routes(String userId, String grain, String anchor) {
    return readOnlyJdbc.query(sql.get(QueryKeys.REPORTS_ROUTES), params(userId, grain, anchor), (rs, rowNum) -> {
      Map<String, Object> route = new LinkedHashMap<>();
      route.put("rideId", String.valueOf(rs.getObject("id")));
      route.put("title", rs.getString("title"));
      route.put("aiTitle", rs.getString("ai_title"));
      route.put("from", rs.getString("start_label"));
      route.put("to", rs.getString("end_label"));
      route.put("distanceM", Rows.integer(rs.getObject("distance_m")));
      route.put("durationS", Rows.integer(rs.getObject("duration_s")));
      route.put("topSpeedKmh", Rows.numeric(rs.getObject("top_speed_kmh")));
      route.put("startedAt", Rows.instantString(rs.getObject("started_at")));
      return route;
    });
  }

  private MapSqlParameterSource params(String userId, String grain, String anchor) {
    return new MapSqlParameterSource().addValue("userId", userId).addValue("grain", grain).addValue("anchor", anchor);
  }
}
