package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.pojo.AuthUserRow;
import com.ridepulse.api.repository.ProfileRepository;
import com.ridepulse.api.utility.RowMappers;
import com.ridepulse.api.utility.SqlQueries;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcProfileRepository implements ProfileRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  public JdbcProfileRepository(
      @Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc,
      @Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc,
      SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @Override
  @Transactional
  public Optional<AuthUserRow> update(String userId, boolean updateName, String name, boolean updateBikeModel, String bikeModel) {
    MapSqlParameterSource params = new MapSqlParameterSource("userId", userId)
        .addValue("updateName", updateName)
        .addValue("name", name)
        .addValue("updateBikeModel", updateBikeModel)
        .addValue("bikeModel", bikeModel);
    return readWriteJdbc.query(sql.get(QueryKeys.PROFILE_UPDATE), params,
        rs -> rs.next() ? Optional.of(RowMappers.authUser(rs)) : Optional.empty());
  }

  @Override
  public Optional<Integer> monthlyDistanceGoalKm(String userId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.PROFILE_PREFERENCES), new MapSqlParameterSource("userId", userId),
        rs -> rs.next() ? Optional.of(rs.getInt("monthly_distance_goal_km")) : Optional.empty());
  }

  @Override
  @Transactional
  public Optional<Integer> updateMonthlyDistanceGoalKm(String userId, int monthlyDistanceGoalKm) {
    MapSqlParameterSource params = new MapSqlParameterSource("userId", userId)
        .addValue("monthlyDistanceGoalKm", monthlyDistanceGoalKm);
    return readWriteJdbc.query(sql.get(QueryKeys.PROFILE_UPDATE_PREFERENCES), params,
        rs -> rs.next() ? Optional.of(rs.getInt("monthly_distance_goal_km")) : Optional.empty());
  }

  @Override
  public Optional<PhotoRow> findProfilePhoto(String userId) {
    return readOnlyJdbc.query(sql.get(QueryKeys.PROFILE_PHOTO), new MapSqlParameterSource("userId", userId), rs -> rs.next() ? Optional.of(RowMappers.profilePhoto(rs)) : Optional.empty());
  }

  @Override
  @Transactional
  public Optional<Map<String, Object>> updateProfilePhoto(String userId, byte[] data, String mimeType) {
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("userId", userId)
        .addValue("imageData", data)
        .addValue("mimeType", mimeType);
    return readWriteJdbc.query(sql.get(QueryKeys.PROFILE_UPDATE_PHOTO), params, rs -> rs.next() ? Optional.of(RowMappers.photoMetadata(rs)) : Optional.empty());
  }

  @Override
  @Transactional
  public Optional<Map<String, Object>> deleteProfilePhoto(String userId) {
    return readWriteJdbc.query(sql.get(QueryKeys.PROFILE_DELETE_PHOTO), new MapSqlParameterSource("userId", userId), rs -> rs.next() ? Optional.of(RowMappers.photoMetadata(rs)) : Optional.empty());
  }
}
