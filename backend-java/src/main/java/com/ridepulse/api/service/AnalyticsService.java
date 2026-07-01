package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.AnalyticsRepository;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class AnalyticsService {
  private final AnalyticsRepository analyticsRepository;
  private final RideService rideService;

  AnalyticsService(AnalyticsRepository analyticsRepository, RideService rideService) {
    this.analyticsRepository = analyticsRepository;
    this.rideService = rideService;
  }

  public Map<String, Object> distance(String userId, String bucket) {
    String grain = switch (bucket) {
      case "monthly" -> "month";
      case "yearly" -> "year";
      default -> "day";
    };
    return Map.of("points", analyticsRepository.distance(userId, grain));
  }

  public Map<String, Object> speed(String userId, String rideId) {
    if (!rideService.ownedRideExists(userId, rideId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND);
    }
    return Map.of("points", analyticsRepository.speed(rideId));
  }
}
