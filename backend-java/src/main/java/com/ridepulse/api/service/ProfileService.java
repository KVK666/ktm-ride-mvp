package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.repository.ProfileRepository;
import com.ridepulse.api.service.PhotoValidationService.NormalizedPhoto;
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
}
