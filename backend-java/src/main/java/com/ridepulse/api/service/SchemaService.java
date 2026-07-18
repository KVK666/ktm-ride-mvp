package com.ridepulse.api.service;

import com.ridepulse.api.constants.BeanNames;
import com.ridepulse.api.constants.QueryKeys;
import com.ridepulse.api.utility.SqlQueries;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SchemaService {
  private final NamedParameterJdbcTemplate readWriteJdbc;
  private final SqlQueries sql;

  SchemaService(@Qualifier(BeanNames.READ_WRITE_NAMED_JDBC) NamedParameterJdbcTemplate readWriteJdbc, SqlQueries sql) {
    this.readWriteJdbc = readWriteJdbc;
    this.sql = sql;
  }

  @EventListener(ApplicationReadyEvent.class)
  void ensureAdditiveSchema() {
    for (String queryKey : schemaQueryKeys()) {
      readWriteJdbc.update(sql.get(queryKey), new MapSqlParameterSource());
    }
  }

  private List<String> schemaQueryKeys() {
    return List.of(
        QueryKeys.SCHEMA_UUID_EXTENSION,
        QueryKeys.SCHEMA_PGCRYPTO_EXTENSION,
        QueryKeys.SCHEMA_USER_PROFILE_DATA,
        QueryKeys.SCHEMA_USER_PROFILE_MIME,
        QueryKeys.SCHEMA_USER_PROFILE_UPDATED,
        QueryKeys.SCHEMA_USER_MONTHLY_DISTANCE_GOAL,
        QueryKeys.SCHEMA_USERS_ID_UNIQUE_INDEX,
        QueryKeys.SCHEMA_PASSWORD_RESET_TABLE,
        QueryKeys.SCHEMA_PASSWORD_RESET_DEFAULTS,
        QueryKeys.SCHEMA_PASSWORD_RESET_USER_FK,
        QueryKeys.SCHEMA_RIDE_ALBUM_TABLE,
        QueryKeys.SCHEMA_TRIPS_TABLE,
        QueryKeys.SCHEMA_TRIP_RIDES_TABLE,
        QueryKeys.SCHEMA_SAVED_PLACES_TABLE,
        QueryKeys.SCHEMA_SAVED_PLACES_DEFAULTS,
        QueryKeys.SCHEMA_SAVED_PLACES_USER_FK,
        QueryKeys.SCHEMA_RIDE_AI_TITLE,
        QueryKeys.SCHEMA_RIDE_AI_SUMMARY,
        QueryKeys.SCHEMA_RIDE_KIND,
        QueryKeys.SCHEMA_RIDE_KIND_CONFIDENCE,
        QueryKeys.SCHEMA_RIDE_KIND_REASON,
        QueryKeys.SCHEMA_RIDE_KEY_INSIGHT,
        QueryKeys.SCHEMA_RIDE_BEST_MOMENT,
        QueryKeys.SCHEMA_RIDE_TRIP_SUGGESTION,
        QueryKeys.SCHEMA_RIDE_AI_STATUS,
        QueryKeys.SCHEMA_RIDE_AI_GENERATED_AT,
        QueryKeys.SCHEMA_PASSWORD_RESET_USER_INDEX,
        QueryKeys.SCHEMA_PASSWORD_RESET_EXPIRES_INDEX,
        QueryKeys.SCHEMA_RIDE_PHOTO_RIDE_INDEX,
        QueryKeys.SCHEMA_RIDE_PHOTO_USER_INDEX,
        QueryKeys.SCHEMA_RIDE_PHOTO_CLIENT_ID,
        QueryKeys.SCHEMA_RIDE_PHOTO_CLIENT_ID_INDEX,
        QueryKeys.SCHEMA_TRIPS_USER_INDEX,
        QueryKeys.SCHEMA_TRIP_RIDES_RIDE_INDEX,
        QueryKeys.SCHEMA_SAVED_PLACES_USER_LABEL_INDEX,
        QueryKeys.SCHEMA_RIDES_USER_STARTED_INDEX);
  }
}
