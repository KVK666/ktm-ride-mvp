package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.pojo.ResetTokenRow;
import com.ridepulse.api.pojo.ResetUserRow;
import com.ridepulse.api.repository.PasswordResetRepository;
import com.ridepulse.api.utility.RowMappers;
import com.ridepulse.api.utility.SqlQueries;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcPasswordResetRepository implements PasswordResetRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  public JdbcPasswordResetRepository(
      @Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc,
      @Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc,
      SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @Override
  public Optional<ResetUserRow> findUserByEmail(String email) {
    return readOnlyJdbc.query(sql.get(QueryKeys.PASSWORD_RESET_USER_BY_EMAIL), new MapSqlParameterSource("email", email), rs -> rs.next() ? Optional.of(RowMappers.resetUser(rs)) : Optional.empty());
  }

  @Override
  @Transactional
  public void markExistingTokensUsed(String userId) {
    readWriteJdbc.update(sql.get(QueryKeys.PASSWORD_RESET_MARK_EXISTING_USED), new MapSqlParameterSource("userId", userId));
  }

  @Override
  @Transactional
  public void createToken(String userId, String tokenHash, String expiresAt) {
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("userId", userId)
        .addValue("tokenHash", tokenHash)
        .addValue("expiresAt", expiresAt);
    readWriteJdbc.update(sql.get(QueryKeys.PASSWORD_RESET_INSERT), params);
  }

  @Override
  public Optional<ResetTokenRow> findValidTokenForUpdate(String tokenHash) {
    return readWriteJdbc.query(sql.get(QueryKeys.PASSWORD_RESET_VALID_TOKEN), new MapSqlParameterSource("tokenHash", tokenHash), rs -> rs.next() ? Optional.of(RowMappers.resetToken(rs)) : Optional.empty());
  }

  @Override
  @Transactional
  public void updatePassword(String userId, String passwordHash) {
    readWriteJdbc.update(sql.get(QueryKeys.PASSWORD_RESET_UPDATE_PASSWORD), new MapSqlParameterSource().addValue("userId", userId).addValue("passwordHash", passwordHash));
  }

  @Override
  @Transactional
  public void markTokenUsed(String tokenId) {
    readWriteJdbc.update(sql.get(QueryKeys.PASSWORD_RESET_MARK_TOKEN_USED), new MapSqlParameterSource("tokenId", tokenId));
  }
}
