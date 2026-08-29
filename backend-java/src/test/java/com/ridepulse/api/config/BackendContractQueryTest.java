package com.ridepulse.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.util.Properties;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class BackendContractQueryTest {
  private static final Properties SQL = new Properties();

  @BeforeAll
  static void loadQueries() throws Exception {
    try (InputStream stream = BackendContractQueryTest.class.getResourceAsStream("/db-queries.properties")) {
      assertThat(stream).isNotNull();
      SQL.load(stream);
    }
  }

  @Test
  void rideSearchIncludesAiFieldsAndStableKeysetOrdering() {
    assertThat(query("sql.ride.list-search"))
        .contains("r.ai_title", "r.ai_summary", "r.ride_kind", "r.key_insight");
    assertThat(query("sql.ride.list-date-range"))
        .contains("cast(:startedfrom as timestamptz) is null", "cast(:startedbefore as timestamptz) is null")
        .doesNotContain(":startedfrom is null", ":startedbefore is null");
    assertThat(query("sql.ride.list-order-newest"))
        .contains("r.started_at desc", "r.id desc");
    assertThat(query("sql.ride.list-cursor-newest"))
        .contains("r.started_at", "r.id", ":cursorstartedat", ":cursorrideid");
  }

  @Test
  void metadataPhotoQueryDoesNotReadBlobsAndBinaryQueryIsOwnerScoped() {
    assertThat(query("sql.ride-photo.list-metadata")).doesNotContain("image_data");
    assertThat(query("sql.ride-photo.binary-by-id"))
        .contains("image_data", ":photoid", ":rideid", ":userid");
  }

  @Test
  void photoUploadAndReportsExposeTheNewContracts() {
    assertThat(query("sql.ride-photo.insert"))
        .contains("gen_random_uuid()", "client_photo_id", "on conflict", "returning id");
    assertThat(query("sql.schema.ride-album-defaults"))
        .contains("alter column id set default gen_random_uuid()", "alter column imported_at set default now()");
    assertThat(query("sql.reports.routes"))
        .contains("id", "title", "ai_title");
  }

  @Test
  void googleTimelineImportQueriesAreOwnerScopedAndIdempotent() {
    assertThat(query("sql.ride.select"))
        .contains("r.source", "r.source_activity_type", "r.speed_data_quality");
    assertThat(query("sql.ride.import-insert"))
        .contains("google_timeline", "client_ride_id", "on conflict", "do nothing", "returning id");
    assertThat(query("sql.ride.overlaps"))
        .contains("rides", "user_id", ":startedat", ":endedat");
    assertThat(query("sql.ride.overlaps-range"))
        .contains("rides", "user_id", ":startedat", ":endedat")
        .doesNotContain("limit");
    assertThat(query("sql.trip.import-insert"))
        .contains("gen_random_uuid()", "client_trip_id", "on conflict", "returning id");
    assertThat(query("sql.trip.insert"))
        .contains("gen_random_uuid()", "returning id");
    assertThat(query("sql.schema.trips-defaults"))
        .contains("alter column id set default gen_random_uuid()", "alter column created_at set default now()", "alter column updated_at set default now()");
    assertThat(query("sql.schema.trip-rides-defaults"))
        .contains("alter column sort_order set default 0", "alter column added_at set default now()");
    assertThat(query("sql.schema.trip-rides-membership-index"))
        .contains("create unique index", "trip_rides", "trip_id", "ride_id");
    assertThat(query("sql.trip.add-ride"))
        .contains("on conflict (trip_id, ride_id) do nothing");
  }

  private static String query(String key) {
    return SQL.getProperty(key, "").toLowerCase();
  }
}
