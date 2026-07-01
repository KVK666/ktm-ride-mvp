package com.ridepulse.api.repository;

import com.ridepulse.api.pojo.PhotoRow;
import java.util.Map;
import java.util.Optional;

public interface ProfileRepository {
  Optional<PhotoRow> findProfilePhoto(String userId);

  Optional<Map<String, Object>> updateProfilePhoto(String userId, byte[] data, String mimeType);

  Optional<Map<String, Object>> deleteProfilePhoto(String userId);
}
