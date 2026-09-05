package com.ridepulse.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
@EnableScheduling
public class RideAiConfig {
  @Bean("rideAiExecutor")
  ThreadPoolTaskExecutor rideAiExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(2);
    executor.setMaxPoolSize(2);
    // The database is the queue; never accumulate GPS payloads in memory.
    executor.setQueueCapacity(0);
    executor.setThreadNamePrefix("ride-ai-");
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(30);
    return executor;
  }
}
