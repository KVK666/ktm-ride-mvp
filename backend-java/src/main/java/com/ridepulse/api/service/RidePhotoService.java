package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.pojo.PhotoRow;
import com.ridepulse.api.repository.RideRepository;
import com.ridepulse.api.dto.NormalizedRidePhoto;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RidePhotoService {
  private final RideRepository rideRepository;
  private final PhotoValidationService photoValidationService;

  RidePhotoService(RideRepository rideRepository, PhotoValidationService photoValidationService) {
    this.rideRepository = rideRepository;
    this.photoValidationService = photoValidationService;
  }

  public Map<String, Object> photos(String userId, String rideId) {
    return photos(userId, rideId, true);
  }

  public Map<String, Object> photos(String userId, String rideId, boolean includeData) {
    requireOwnedRide(userId, rideId);
    return Map.of("photos", rideRepository.photos(userId, rideId, includeData));
  }

  public PhotoRow photo(String userId, String rideId, String photoId) {
    return rideRepository.photo(userId, rideId, photoId)
        .filter(row -> row.data() != null && row.mimeType() != null && !row.mimeType().isBlank())
        .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_PHOTO_NOT_FOUND));
  }

  @Transactional
  public Map<String, Object> addPhoto(String userId, String rideId, Map<String, Object> body) {
    requireOwnedRide(userId, rideId);
    NormalizedRidePhoto photo = photoValidationService.normalizeRidePhotoPayload(body);
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("photo", rideRepository.insertPhoto(userId, rideId, photo));
    return response;
  }

  @Transactional
  public void deletePhoto(String userId, String rideId, String photoId) {
    int deleted = rideRepository.deletePhoto(userId, rideId, photoId);
    if (deleted == 0) throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_PHOTO_NOT_FOUND);
  }

  private void requireOwnedRide(String userId, String rideId) {
    if (!rideRepository.ownedRideExists(userId, rideId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.RIDE_NOT_FOUND);
    }
  }

}
