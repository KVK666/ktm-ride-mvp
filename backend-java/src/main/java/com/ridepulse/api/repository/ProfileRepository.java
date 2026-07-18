package com.ridepulse.api.repository;

import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.pojo.AuthUserRow;
import java.util.Map;
import java.util.Optional;

public interface ProfileRepository {
  Optional<AuthUserRow> update(String userId, boolean updateName, String name, boolean updateBikeModel, String bikeModel);

  Optional<Integer> monthlyDistanceGoalKm(String userId);

  Optional<Integer> updateMonthlyDistanceGoalKm(String userId, int monthlyDistanceGoalKm);

  Optional<PhotoRow> findProfilePhoto(String userId);

  Optional<Map<String, Object>> updateProfilePhoto(String userId, byte[] data, String mimeType);

  Optional<Map<String, Object>> deleteProfilePhoto(String userId);
}
