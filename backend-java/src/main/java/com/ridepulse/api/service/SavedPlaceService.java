package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.SavedPlaceRepository;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SavedPlaceService {
  private static final int MAX_PLACES = 20;
  private static final String UNIQUE_VIOLATION = "23505";
  private static final Logger log = LoggerFactory.getLogger(SavedPlaceService.class);
  private final SavedPlaceRepository savedPlaceRepository;

  SavedPlaceService(SavedPlaceRepository savedPlaceRepository) {
    this.savedPlaceRepository = savedPlaceRepository;
  }

  public Map<String, Object> list(String userId) {
    return Map.of("places", savedPlaceRepository.list(userId));
  }

  @Transactional
  public Map<String, Object> create(String userId, Map<String, Object> body) {
    if (savedPlaceRepository.count(userId) >= MAX_PLACES) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.SAVED_PLACE_LIMIT);
    }
    PlaceInput input = input(body);
    try {
      return Map.of("place", savedPlaceRepository.create(
          userId, input.label(), input.kind(), input.latitude(), input.longitude(), input.radiusM()));
    } catch (DataIntegrityViolationException error) {
      throw translateIntegrityViolation("create", error);
    }
  }

  @Transactional
  public Map<String, Object> update(String userId, String placeId, Map<String, Object> body) {
    PlaceInput input = input(body);
    try {
      Map<String, Object> place = savedPlaceRepository.update(
              userId, placeId, input.label(), input.kind(), input.latitude(), input.longitude(), input.radiusM())
          .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.SAVED_PLACE_NOT_FOUND));
      return Map.of("place", place);
    } catch (DataIntegrityViolationException error) {
      throw translateIntegrityViolation("update", error);
    }
  }

  @Transactional
  public void delete(String userId, String placeId) {
    if (savedPlaceRepository.delete(userId, placeId) == 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, ProgramCodes.NOT_FOUND, Messages.SAVED_PLACE_NOT_FOUND);
    }
  }

  private static PlaceInput input(Map<String, Object> body) {
    String label = text(body == null ? null : body.get("label"));
    if (label.isBlank() || label.length() > 60) {
      throw badRequest(Messages.SAVED_PLACE_LABEL_REQUIRED);
    }
    String kind = text(body.get("kind")).toLowerCase();
    if (!List.of("home", "office", "other").contains(kind)) kind = "other";
    double latitude = coordinate(body.get("latitude"), true);
    double longitude = coordinate(body.get("longitude"), false);
    int radiusM = integer(body.get("radiusM"), 180);
    if (radiusM < 50 || radiusM > 1000) {
      throw badRequest(Messages.SAVED_PLACE_RADIUS_INVALID);
    }
    return new PlaceInput(label, kind, latitude, longitude, radiusM);
  }

  private static double coordinate(Object value, boolean latitude) {
    try {
      double number = Double.parseDouble(String.valueOf(value));
      double limit = latitude ? 90 : 180;
      if (Double.isFinite(number) && Math.abs(number) <= limit) return number;
    } catch (Exception ignored) {
      // Rejected below with a stable API message.
    }
    throw badRequest(Messages.SAVED_PLACE_COORDINATES_INVALID);
  }

  private static int integer(Object value, int fallback) {
    if (value == null) return fallback;
    try {
      return (int) Math.round(Double.parseDouble(String.valueOf(value)));
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private static String text(Object value) {
    return value == null ? "" : String.valueOf(value).trim();
  }

  private static ApiException badRequest(String message) {
    return new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, message);
  }

  private static RuntimeException translateIntegrityViolation(String operation, DataIntegrityViolationException error) {
    SQLException sqlError = sqlError(error);
    if (sqlError != null && UNIQUE_VIOLATION.equals(sqlError.getSQLState())) {
      return new ApiException(HttpStatus.CONFLICT, ProgramCodes.CONFLICT, Messages.SAVED_PLACE_DUPLICATE);
    }
    log.warn("saved place {} failed integrity check sqlState={} detail={}", operation,
        sqlError == null ? "unknown" : sqlError.getSQLState(), error.getMostSpecificCause().getMessage());
    return error;
  }

  private static SQLException sqlError(Throwable error) {
    Throwable current = error;
    while (current != null) {
      if (current instanceof SQLException sqlException) return sqlException;
      current = current.getCause();
    }
    return null;
  }

  private record PlaceInput(String label, String kind, double latitude, double longitude, int radiusM) {}
}
