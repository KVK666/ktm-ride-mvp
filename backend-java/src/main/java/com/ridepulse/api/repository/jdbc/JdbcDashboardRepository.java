package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.DashboardRepository;
import com.ridepulse.api.utility.Rows;
import com.ridepulse.api.utility.SqlQueries;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcDashboardRepository implements DashboardRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final SqlQueries sql;

  public JdbcDashboardRepository(@Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc, SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.sql = sql;
  }

  @Override
  public Map<String, Object> stats(String userId) {
    return readOnlyJdbc.queryForMap(sql.get(QueryKeys.STATS_DASHBOARD), userParams(userId));
  }

  @Override
  public List<Map<String, Object>> recentRides(String userId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.DASHBOARD_RECENT), userParams(userId), (rs, rowNum) -> Rows.ride(rs));
  }

  @Override
  public List<Map<String, Object>> journalRecentRides(String userId, int limit) {
    return readOnlyJdbc.query(sql.get(QueryKeys.JOURNAL_RECENT), userParams(userId).addValue("limit", limit), (rs, rowNum) -> Rows.ride(rs));
  }

  @Override
  public List<Map<String, Object>> journalMonthRides(String userId, int limit) {
    return readOnlyJdbc.query(sql.get(QueryKeys.JOURNAL_MONTH), userParams(userId).addValue("limit", limit), (rs, rowNum) -> Rows.ride(rs));
  }

  private MapSqlParameterSource userParams(String userId) {
    return new MapSqlParameterSource("userId", userId);
  }
}
