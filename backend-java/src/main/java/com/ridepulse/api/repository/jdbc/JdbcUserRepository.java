package com.ridepulse.api.repository.jdbc;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.pojo.AuthUserRow;
import com.ridepulse.api.repository.UserRepository;
import com.ridepulse.api.utility.RowMappers;
import com.ridepulse.api.utility.SqlQueries;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcUserRepository implements UserRepository {
  private final NamedParameterJdbcTemplate readOnlyJdbc;
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  public JdbcUserRepository(
      @Qualifier(BeanNames.READ_ONLY_NAMED_JDBC) NamedParameterJdbcTemplate readOnlyJdbc,
      @Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc,
      SqlQueries sql) {
    this.readOnlyJdbc = readOnlyJdbc;
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @Override
  @Transactional
  public AuthUserRow create(String email, String passwordHash, String name, String bikeModel) {
    MapSqlParameterSource params = new MapSqlParameterSource()
        .addValue("email", email)
        .addValue("passwordHash", passwordHash)
        .addValue("name", name)
        .addValue("bikeModel", bikeModel);
    KeyHolder keyHolder = new GeneratedKeyHolder();
    readWriteJdbc.update(sql.get(QueryKeys.USER_INSERT), params, keyHolder, new String[] {"id"});
    Object id = keyHolder.getKeys() == null ? null : keyHolder.getKeys().get("id");
    return findById(readWriteJdbc, String.valueOf(id)).orElseThrow(() -> new IllegalStateException("Inserted user was not returned"));
  }

  @Override
  public Optional<AuthUserRow> findByEmail(String email) {
    MapSqlParameterSource params = new MapSqlParameterSource("email", email);
    return readOnlyJdbc.query(sql.get(QueryKeys.USER_BY_EMAIL), params, rs -> rs.next() ? Optional.of(RowMappers.authUser(rs)) : Optional.empty());
  }

  @Override
  public Optional<AuthUserRow> findById(String userId) {
    return findById(readOnlyJdbc, userId);
  }

  private Optional<AuthUserRow> findById(NamedParameterJdbcTemplate jdbc, String userId) {
    MapSqlParameterSource params = new MapSqlParameterSource("userId", userId);
    return jdbc.query(sql.get(QueryKeys.USER_BY_ID), params, rs -> rs.next() ? Optional.of(RowMappers.authUser(rs)) : Optional.empty());
  }
}
