package com.ridepulse.api.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class WebConfig {
  @Bean
  CorsFilter corsFilter(@Value("${ridepulse.cors-origin:*}") String corsOrigin) {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    if ("*".equals(corsOrigin.trim())) {
      config.addAllowedOriginPattern("*");
    } else {
      for (String origin : corsOrigin.split(",")) {
        if (!origin.isBlank()) {
          config.addAllowedOrigin(origin.trim());
        }
      }
    }

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return new CorsFilter(source);
  }
}
