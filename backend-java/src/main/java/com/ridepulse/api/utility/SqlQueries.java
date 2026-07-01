package com.ridepulse.api.utility;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class SqlQueries {
  private final Environment env;

  SqlQueries(Environment env) {
    this.env = env;
  }

  public String get(String key) {
    String value = env.getProperty("sql." + key);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException("Missing SQL query property: sql." + key);
    }
    return value;
  }
}
