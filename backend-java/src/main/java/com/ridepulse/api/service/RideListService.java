package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.dto.RideListCursor;
import com.ridepulse.api.dto.RideListQuery;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.RideRepository;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class RideListService {
  private final RideRepository rideRepository;
  private final RoutePreviewService routePreviewService;
  private final JournalIntelligenceService journalIntelligenceService;

  RideListService(RideRepository rideRepository, RoutePreviewService routePreviewService, JournalIntelligenceService journalIntelligenceService) {
    this.rideRepository = rideRepository;
    this.routePreviewService = routePreviewService;
    this.journalIntelligenceService = journalIntelligenceService;
  }

  public Map<String, Object> list(String userId, String period, String query) {
    return list(userId, period, query, null, null, null, null);
  }

  public Map<String, Object> list(
      String userId,
      String period,
      String query,
      Integer requestedLimit,
      String encodedCursor,
      String requestedReviewStatus,
      String requestedSort) {
    return list(userId, period, query, requestedLimit, encodedCursor, requestedReviewStatus, requestedSort, null, null);
  }

  public Map<String, Object> list(
      String userId,
      String period,
      String query,
      Integer requestedLimit,
      String encodedCursor,
      String requestedReviewStatus,
      String requestedSort,
      String requestedStartedFrom,
      String requestedStartedBefore) {
    boolean paginationRequested = requestedLimit != null || (encodedCursor != null && !encodedCursor.isBlank());
    int limit = paginationRequested ? normalizeLimit(requestedLimit) : 100;
    String reviewStatus = normalizeReviewStatus(requestedReviewStatus);
    String sort = normalizeSort(requestedSort);
    String startedFrom = normalizeOptionalInstant(requestedStartedFrom);
    String startedBefore = normalizeOptionalInstant(requestedStartedBefore);
    if (startedFrom != null && startedBefore != null && !Instant.parse(startedBefore).isAfter(Instant.parse(startedFrom))) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, "Ride date range is invalid");
    }
    RideListCursor cursor = decodeCursor(encodedCursor, sort);
    List<Map<String, Object>> rows = rideRepository.list(
        userId,
        new RideListQuery(period, query, reviewStatus, sort, startedFrom, startedBefore, paginationRequested ? limit + 1 : limit, cursor));
    boolean hasMore = paginationRequested && rows.size() > limit;
    List<Map<String, Object>> pageRows = hasMore ? new ArrayList<>(rows.subList(0, limit)) : rows;
    List<Map<String, Object>> rides = journalIntelligenceService.decorateRides(
        routePreviewService.attachRoutePreviews(pageRows),
        Map.of());
    Map<String, Object> response = new LinkedHashMap<>();
    response.put("rides", rides);
    if (paginationRequested) {
      Map<String, Object> pageInfo = new LinkedHashMap<>();
      pageInfo.put("hasMore", hasMore);
      pageInfo.put("nextCursor", hasMore && !pageRows.isEmpty() ? encodeCursor(pageRows.get(pageRows.size() - 1), sort) : null);
      response.put("pageInfo", pageInfo);
    }
    return response;
  }

  private static int normalizeLimit(Integer value) {
    int limit = value == null ? 50 : value;
    if (limit < 1 || limit > 100) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.RIDE_LIST_LIMIT_INVALID);
    }
    return limit;
  }

  private static String normalizeReviewStatus(String value) {
    if (value == null || value.isBlank() || "all".equalsIgnoreCase(value)) return "all";
    String normalized = value.trim().toLowerCase().replace('-', '_');
    if ("needsreview".equals(normalized) || "unreviewed".equals(normalized)) normalized = "needs_review";
    if (!"needs_review".equals(normalized) && !"cleanup".equals(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.RIDE_LIST_FILTER_INVALID);
    }
    return normalized;
  }

  private static String normalizeSort(String value) {
    if (value == null || value.isBlank()) return "newest";
    String normalized = value.trim().toLowerCase();
    if (!Set.of("newest", "longest", "fastest").contains(normalized)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.RIDE_LIST_SORT_INVALID);
    }
    return normalized;
  }

  private static String normalizeOptionalInstant(String value) {
    if (value == null || value.isBlank()) return null;
    try {
      return Instant.parse(value.trim()).toString();
    } catch (Exception ignored) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, "Ride date range is invalid");
    }
  }

  private static RideListCursor decodeCursor(String value, String sort) {
    if (value == null || value.isBlank()) return null;
    try {
      String decoded = new String(Base64.getUrlDecoder().decode(value.trim()), StandardCharsets.UTF_8);
      String[] parts = decoded.split("\\|", -1);
      if (parts.length != 5 || !"v1".equals(parts[0]) || !sort.equals(parts[1])) throw new IllegalArgumentException();
      double sortValue = Double.parseDouble(parts[2]);
      if (!Double.isFinite(sortValue)) throw new IllegalArgumentException();
      String startedAt = Instant.parse(parts[3]).toString();
      String rideId = UUID.fromString(parts[4]).toString();
      return new RideListCursor(sort, sortValue, startedAt, rideId);
    } catch (Exception ignored) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ProgramCodes.BAD_REQUEST, Messages.RIDE_LIST_CURSOR_INVALID);
    }
  }

  private static String encodeCursor(Map<String, Object> ride, String sort) {
    String startedAt = Instant.parse(String.valueOf(ride.get("startedAt"))).toString();
    String rideId = UUID.fromString(String.valueOf(ride.get("id"))).toString();
    double sortValue = switch (sort) {
      case "longest" -> numeric(ride.get("distanceM"));
      case "fastest" -> numeric(ride.get("topSpeedKmh"));
      default -> 0d;
    };
    String value = String.join("|", "v1", sort, Double.toString(sortValue), startedAt, rideId);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  private static double numeric(Object value) {
    Double number = RideMathService.optionalNumber(value);
    return number == null || !Double.isFinite(number) ? 0d : number;
  }

}
