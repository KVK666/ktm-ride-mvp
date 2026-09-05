package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.dto.RideAiJob;
import com.ridepulse.api.repository.RideAiJobRepository;
import com.ridepulse.api.utility.SqlQueries;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcRideAiJobRepository implements RideAiJobRepository {
  private final NamedParameterJdbcTemplate jdbc;
  private final SqlQueries sql;

  public JdbcRideAiJobRepository(@Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate jdbc, SqlQueries sql) {
    this.jdbc = jdbc;
    this.sql = sql;
  }

  // Historical refresh requests must persist independently of the read request.
  @Override
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public boolean enqueue(String userId, String rideId, int contextVersion) {
    return jdbc.update(sql.get(QueryKeys.RIDE_AI_ENQUEUE),
        Map.of("userId", userId, "rideId", rideId, "contextVersion", contextVersion)) > 0;
  }

  @Override
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public Optional<RideAiJob> claimNext() {
    return jdbc.query(sql.get(QueryKeys.RIDE_AI_CLAIM), Map.of(), rs -> rs.next()
        ? Optional.of(new RideAiJob(rs.getString("user_id"), rs.getString("id"), rs.getString("ai_job_token")))
        : Optional.empty());
  }

  @Override
  public boolean lockForCompletion(RideAiJob job) {
    return jdbc.query(sql.get(QueryKeys.RIDE_AI_LOCK), params(job), rs -> { return rs.next(); });
  }

  @Override
  public void complete(RideAiJob job) {
    jdbc.update(sql.get(QueryKeys.RIDE_AI_COMPLETE), params(job));
  }

  private Map<String, Object> params(RideAiJob job) {
    return Map.of("rideId", job.rideId(), "userId", job.userId(), "token", job.token());
  }
}
