package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.repository.RoutePreviewRepository;
import com.ridepulse.api.utility.Rows;
import com.ridepulse.api.utility.SqlQueries;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcRoutePreviewRepository implements RoutePreviewRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final SqlQueries sql;

  public JdbcRoutePreviewRepository(@Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc, SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.sql = sql;
  }

  @Override
  public Map<String, List<Map<String, Object>>> findPreviews(List<String> rideIds) {
    Map<String, List<Map<String, Object>>> previews = new LinkedHashMap<>();
    if (rideIds == null || rideIds.isEmpty()) {
      return previews;
    }
    List<UUID> ids = rideIds.stream().map(UUID::fromString).toList();
    readOnlyJdbc.query(sql.get(QueryKeys.ROUTE_PREVIEW), new MapSqlParameterSource("rideIds", ids), rs -> {
      String rideId = String.valueOf(rs.getObject("ride_id"));
      double latitude = Rows.numeric(rs.getObject("latitude"));
      double longitude = Rows.numeric(rs.getObject("longitude"));
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      List<Map<String, Object>> preview = previews.computeIfAbsent(rideId, ignored -> new ArrayList<>());
      if (preview.size() < 48) {
        preview.add(Map.of("latitude", latitude, "longitude", longitude));
      }
    });
    return previews;
  }
}
