package com.ridepulse.api.repository;

import com.ridepulse.api.dto.RideAiJob;
import java.util.Optional;

public interface RideAiJobRepository {
  boolean enqueue(String userId, String rideId, int contextVersion);
  Optional<RideAiJob> claimNext();
  boolean lockForCompletion(RideAiJob job);
  void complete(RideAiJob job);
}
