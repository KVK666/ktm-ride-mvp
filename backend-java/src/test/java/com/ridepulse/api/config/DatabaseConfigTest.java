package com.ridepulse.api.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class DatabaseConfigTest {
  @Test
  void convertsPostgresUrlWithSslAndSchema() {
    String jdbcUrl = DatabaseConfig.toJdbcUrl("postgresql://user:pass@example.com/ridepulse", true, "ridepulse_db, public");

    assertEquals("jdbc:postgresql://example.com:5432/ridepulse?sslmode=require&currentSchema=ridepulse_db,public", jdbcUrl);
  }

  @Test
  void preservesExistingJdbcCurrentSchema() {
    String jdbcUrl = DatabaseConfig.toJdbcUrl("jdbc:postgresql://example.com:5432/ridepulse?currentSchema=public", true, "ridepulse_db");

    assertEquals("jdbc:postgresql://example.com:5432/ridepulse?currentSchema=public&sslmode=require", jdbcUrl);
  }

  @Test
  void rejectsInvalidSchemaName() {
    assertThrows(IllegalStateException.class, () -> DatabaseConfig.toJdbcUrl("postgresql://user:pass@example.com/ridepulse", true, "bad-schema"));
  }

  @Test
  void canonicalDatabaseUrlWinsOverLegacySplitOverrides() {
    MockEnvironment environment = new MockEnvironment()
        .withProperty("DATABASE_URL", "postgresql://canonical/ridepulse")
        .withProperty("READ_ONLY_DATABASE_URL", "postgresql://stale-reader/ridepulse");

    assertEquals("postgresql://canonical/ridepulse", DatabaseConfig.databaseUrl(environment, "READ_ONLY_DATABASE_URL"));
  }
}
