package com.ridepulse.api.config;

import com.ridepulse.api.constants.BeanNames;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@Configuration
public class DatabaseConfig {
  private static final Pattern POSTGRES_IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

  @Bean(BeanNames.READ_WRITE_DATA_SOURCE)
  @Primary
  DataSource readWriteDataSource(Environment env) {
    String rawUrl = databaseUrl(env, "READ_WRITE_DATABASE_URL");
    if (rawUrl == null) {
      throw new IllegalStateException("DATABASE_URL is not configured");
    }
    return hikari(rawUrl, env, false);
  }

  @Bean(BeanNames.READ_ONLY_DATA_SOURCE)
  DataSource readOnlyDataSource(Environment env) {
    String rawUrl = databaseUrl(env, "READ_ONLY_DATABASE_URL");
    if (rawUrl == null) {
      throw new IllegalStateException("DATABASE_URL is not configured");
    }
    return hikari(rawUrl, env, true);
  }

  static String databaseUrl(Environment env, String legacyOverrideKey) {
    // DATABASE_URL is the documented production source of truth. Prefer it so
    // stale legacy read/write overrides cannot silently split account reads
    // from owner-scoped writes and violate foreign keys.
    return firstNonBlank(
        env.getProperty("DATABASE_URL"),
        env.getProperty(legacyOverrideKey),
        env.getProperty("SPRING_DATASOURCE_URL"));
  }

  @Bean(BeanNames.READ_ONLY_NAMED_JDBC)
  NamedParameterJdbcTemplate readOnlyNamedJdbcTemplate(@Qualifier(BeanNames.READ_ONLY_DATA_SOURCE) DataSource dataSource) {
    return new NamedParameterJdbcTemplate(dataSource);
  }

  @Bean(BeanNames.READ_WRITE_NAMED_JDBC)
  NamedParameterJdbcTemplate readWriteNamedJdbcTemplate(@Qualifier(BeanNames.READ_WRITE_DATA_SOURCE) DataSource dataSource) {
    return new NamedParameterJdbcTemplate(dataSource);
  }

  private static DataSource hikari(String rawUrl, Environment env, boolean readOnly) {
    HikariConfig config = new HikariConfig();
    config.setJdbcUrl(toJdbcUrl(rawUrl, sslRequired(env), env.getProperty("DB_SCHEMA")));
    Credentials credentials = credentials(rawUrl);
    if (credentials.user() != null) {
      config.setUsername(credentials.user());
      config.setPassword(credentials.password());
    }
    config.setMaximumPoolSize(Math.max(1, parseInt(env.getProperty("DB_POOL_MAX"), 5)));
    config.setConnectionTimeout(10000);
    config.setIdleTimeout(30000);
    config.setKeepaliveTime(30000);
    config.setReadOnly(readOnly);
    return new HikariDataSource(config);
  }

  static String toJdbcUrl(String rawUrl, boolean sslRequired, String schema) {
    String jdbcUrl;
    if (rawUrl.startsWith("jdbc:")) {
      jdbcUrl = rawUrl;
    } else if (rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://")) {
      URI uri = URI.create(rawUrl);
      String query = uri.getRawQuery();
      jdbcUrl = "jdbc:postgresql://" + uri.getHost() + ":" + effectivePort(uri) + uri.getPath();
      if (query != null && !query.isBlank()) {
        jdbcUrl += "?" + query;
      }
    } else {
      jdbcUrl = rawUrl;
    }
    String configuredJdbcUrl = withSslMode(jdbcUrl, sslRequired);
    if (!configuredJdbcUrl.startsWith("jdbc:postgresql:")) {
      return configuredJdbcUrl;
    }
    return withCurrentSchema(configuredJdbcUrl, schema);
  }

  private static String withSslMode(String jdbcUrl, boolean sslRequired) {
    if (!sslRequired || jdbcUrl.toLowerCase().contains("sslmode=")) {
      return jdbcUrl;
    }
    return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "sslmode=require";
  }

  private static String withCurrentSchema(String jdbcUrl, String schema) {
    if (schema == null || schema.isBlank() || containsQueryParam(jdbcUrl, "currentSchema")) {
      return jdbcUrl;
    }
    String trimmedSchema = schema.trim();
    for (String schemaPart : trimmedSchema.split(",")) {
      String trimmedPart = schemaPart.trim();
      if (trimmedPart.isBlank() || !POSTGRES_IDENTIFIER.matcher(trimmedPart).matches()) {
        throw new IllegalStateException("DB_SCHEMA must be a comma-separated list of valid PostgreSQL identifiers");
      }
    }
    return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "currentSchema=" + trimmedSchema.replace(" ", "");
  }

  private static boolean containsQueryParam(String jdbcUrl, String paramName) {
    String lowerUrl = jdbcUrl.toLowerCase();
    String lowerParam = paramName.toLowerCase();
    int queryStart = lowerUrl.indexOf('?');
    if (queryStart < 0) {
      return false;
    }
    String query = lowerUrl.substring(queryStart + 1);
    return query.equals(lowerParam) || query.startsWith(lowerParam + "=") || query.contains("&" + lowerParam + "=");
  }

  private static boolean sslRequired(Environment env) {
    String value = env.getProperty("DATABASE_SSL");
    return value != null && (value.equalsIgnoreCase("true") || value.equalsIgnoreCase("require"));
  }

  private static int effectivePort(URI uri) {
    return uri.getPort() > 0 ? uri.getPort() : 5432;
  }

  private static Credentials credentials(String rawUrl) {
    if (rawUrl.startsWith("jdbc:")) {
      return new Credentials(null, null);
    }
    URI uri = URI.create(rawUrl);
    String userInfo = uri.getRawUserInfo();
    if (userInfo == null || userInfo.isBlank()) {
      return new Credentials(null, null);
    }
    String[] parts = userInfo.split(":", 2);
    String user = URLDecoder.decode(parts[0], StandardCharsets.UTF_8);
    String password = parts.length > 1 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
    return new Credentials(user, password);
  }

  private static String firstNonBlank(String first, String second) {
    if (first != null && !first.isBlank()) return first;
    if (second != null && !second.isBlank()) return second;
    return null;
  }

  private static String firstNonBlank(String first, String second, String third) {
    String value = firstNonBlank(first, second);
    return value != null ? value : firstNonBlank(third, null);
  }

  private static int parseInt(String value, int fallback) {
    try {
      return value == null ? fallback : Integer.parseInt(value);
    } catch (NumberFormatException ignored) {
      return fallback;
    }
  }

  private record Credentials(String user, String password) {}
}
