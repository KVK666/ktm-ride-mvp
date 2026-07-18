package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.repository.ProfileRepository;
import com.ridepulse.api.service.PhotoValidationService.NormalizedPhoto;
import com.ridepulse.api.utility.RowMappers;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {
  private final ProfileRepository profileRepository;
  private final PhotoValidationService photoValidationService;

  ProfileService(ProfileRepository profileRepository, PhotoValidationService photoValidationService) {
    this.profileRepository = profileRepository;
    this.photoValidationService = photoValidationService;
  }

  @Transactional
  public Map<String, Object> update(String userId, Map<String, Object> body) {
    boolean updateName = body.containsKey("name");
    boolean updateBikeModel = body.containsKey("bikeModel");
    if (!updateName && !updateBikeModel) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.PROFILE_UPDATE_REQUIRED);
    }
    String name = updateName ? requiredText(body.get("name"), 120, Messages.PROFILE_NAME_REQUIRED) : null;
    String bikeModel = updateBikeModel ? requiredText(body.get("bikeModel"), 120, Messages.PROFILE_BIKE_MODEL_REQUIRED) : null;
    return Map.of("user", RowMappers.safeUser(profileRepository.update(userId, updateName, name, updateBikeModel, bikeModel)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND))));
  }

  public Map<String, Object> preferences(String userId) {
    int goal = profileRepository.monthlyDistanceGoalKm(userId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND));
    Map<String, Object> preferences = new LinkedHashMap<>();
    preferences.put("monthlyDistanceGoalKm", goal == 0 ? null : goal);
    return Map.of("preferences", preferences);
  }

  @Transactional
  public Map<String, Object> updatePreferences(String userId, Map<String, Object> body) {
    int goal = monthlyGoal(body.get("monthlyDistanceGoalKm"));
    int saved = profileRepository.updateMonthlyDistanceGoalKm(userId, goal)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND));
    return Map.of("preferences", Map.of("monthlyDistanceGoalKm", saved));
  }

  public PhotoRow photo(String userId) {
    PhotoRow row = profileRepository.findProfilePhoto(userId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND));
    if (row.data() == null || row.mimeType() == null || row.mimeType().isBlank()) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.PROFILE_PHOTO_NOT_FOUND);
    }
    return row;
  }

  @Transactional
  public Map<String, Object> updatePhoto(String userId, Map<String, Object> body) {
    NormalizedPhoto photo = photoValidationService.normalizeProfilePhotoPayload(body);
    return profileRepository.updateProfilePhoto(userId, photo.data(), photo.mimeType())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND));
  }

  @Transactional
  public Map<String, Object> deletePhoto(String userId) {
    return profileRepository.deleteProfilePhoto(userId)
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.USER_NOT_FOUND));
  }

  private static String requiredText(Object value, int maxLength, String message) {
    String normalized = value == null ? "" : String.valueOf(value).trim();
    if (normalized.isBlank() || normalized.length() > maxLength) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, message);
    }
    return normalized;
  }

  private static int monthlyGoal(Object value) {
    int goal;
    if (value instanceof Number number) {
      double raw = number.doubleValue();
      if (!Double.isFinite(raw) || raw != Math.rint(raw)) {
        throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.MONTHLY_GOAL_INVALID);
      }
      goal = number.intValue();
    } else {
      try {
        goal = Integer.parseInt(value == null ? "" : String.valueOf(value).trim());
      } catch (NumberFormatException ignored) {
        throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.MONTHLY_GOAL_INVALID);
      }
    }
    if (goal < 10 || goal > 5000) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.MONTHLY_GOAL_INVALID);
    }
    return goal;
  }
}
