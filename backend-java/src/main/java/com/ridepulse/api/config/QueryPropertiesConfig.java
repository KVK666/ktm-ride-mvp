package com.ridepulse.api.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

@Configuration
@PropertySource("classpath:db-queries.properties")
public class QueryPropertiesConfig {}
