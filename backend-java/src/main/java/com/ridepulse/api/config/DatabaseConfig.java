package com.ridepulse.api.config;

import com.ridepulse.api.constants.BeanNames;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

@Configuration
public class DatabaseConfig {
  @Bean(BeanNames.READ_WRITE_DATA_SOURCE)
  @Primary
  DataSource readWriteDataSource(Environment env) {
    String rawUrl = firstNonBlank(env.getProperty("READ_WRITE_DATABASE_URL"), env.getProperty("DATABASE_URL"), env.getProperty("SPRING_DATASOURCE_URL"));
    if (rawUrl == null) {
      throw new IllegalStateException("DATABASE_URL is not configured");
    }
    return hikari(rawUrl, env, false);
  }

  @Bean(BeanNames.READ_ONLY_DATA_SOURCE)
  DataSource readOnlyDataSource(Environment env) {
    String rawUrl = firstNonBlank(env.getProperty("READ_ONLY_DATABASE_URL"), env.getProperty("DATABASE_URL"), env.getProperty("SPRING_DATASOURCE_URL"));
    if (rawUrl == null) {
      throw new IllegalStateException("DATABASE_URL is not configured");
    }
    return hikari(rawUrl, env, true);
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
    config.setJdbcUrl(toJdbcUrl(rawUrl, sslRequired(env)));
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

  private static String toJdbcUrl(String rawUrl, boolean sslRequired) {
    if (rawUrl.startsWith("jdbc:")) {
      return withSslMode(rawUrl, sslRequired);
    }
    if (!rawUrl.startsWith("postgres://") && !rawUrl.startsWith("postgresql://")) {
      return rawUrl;
    }
    URI uri = URI.create(rawUrl);
    String query = uri.getRawQuery();
    String jdbc = "jdbc:postgresql://" + uri.getHost() + ":" + effectivePort(uri) + uri.getPath();
    if (query != null && !query.isBlank()) {
      jdbc += "?" + query;
    }
    return withSslMode(jdbc, sslRequired);
  }

  private static String withSslMode(String jdbcUrl, boolean sslRequired) {
    if (!sslRequired || jdbcUrl.toLowerCase().contains("sslmode=")) {
      return jdbcUrl;
    }
    return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "sslmode=require";
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
