package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import com.ridepulse.api.constants.ProgramCodes;
import com.ridepulse.api.dto.AnalyticsInsights;
import com.ridepulse.api.http.ApiException;
import com.ridepulse.api.repository.AnalyticsRepository;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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

  public Map<String, Object> insights(String userId) {
    return insights(userId, "UTC");
  }

  public Map<String, Object> insights(String userId, String timezone) {
    return Map.of(
        "insights",
        calculateInsights(analyticsRepository.insightRides(userId), Instant.now(), zoneId(timezone)));
  }

  AnalyticsInsights calculateInsights(List<Map<String, Object>> rides, Instant now) {
    return calculateInsights(rides, now, ZoneOffset.UTC);
  }

  AnalyticsInsights calculateInsights(List<Map<String, Object>> rides, Instant now, ZoneId timezone) {
    Instant safeNow = now == null ? Instant.now() : now;
    ZoneId safeTimezone = timezone == null ? ZoneOffset.UTC : timezone;
    Instant currentWindowStart = safeNow.minus(30, ChronoUnit.DAYS);
    Instant previousWindowStart = safeNow.minus(60, ChronoUnit.DAYS);
    LocalDate today = safeNow.atZone(safeTimezone).toLocalDate();
    LocalDate monthStart = today.withDayOfMonth(1);

    List<RideSummary> validRides = new ArrayList<>();
    for (Map<String, Object> ride : rides == null ? List.<Map<String, Object>>of() : rides) {
      RideSummary summary = normalize(ride);
      if (summary != null && !summary.startedAt().isAfter(safeNow)) validRides.add(summary);
    }

    List<RideSummary> currentRides = new ArrayList<>();
    double previousDistanceM = 0;
    double longestRideM = 0;
    double monthDistanceM = 0;
    int reviewedCount = 0;
    int cleanupCandidateCount = 0;
    Set<LocalDate> allRideDays = new HashSet<>();

    for (RideSummary ride : validRides) {
      LocalDate rideDay = ride.startedAt().atZone(safeTimezone).toLocalDate();
      allRideDays.add(rideDay);
      longestRideM = Math.max(longestRideM, ride.distanceM());
      if (ride.reviewed()) reviewedCount += 1;
      if (RideCleanupPolicy.isCandidate(ride.distanceM(), ride.durationS(), ride.reviewedAt())) {
        cleanupCandidateCount += 1;
      }
      if (!rideDay.isBefore(monthStart)) monthDistanceM += ride.distanceM();
      if (!ride.startedAt().isBefore(currentWindowStart)) {
        currentRides.add(ride);
      } else if (!ride.startedAt().isBefore(previousWindowStart)) {
        previousDistanceM += ride.distanceM();
      }
    }

    double currentDistanceM = currentRides.stream().mapToDouble(RideSummary::distanceM).sum();
    double averageDistanceM = average(currentRides.stream().mapToDouble(RideSummary::distanceM).toArray());
    double averageDurationS = average(currentRides.stream().mapToDouble(RideSummary::durationS).toArray());
    double averageTopSpeedKmh = average(currentRides.stream().mapToDouble(RideSummary::topSpeedKmh).toArray());
    Set<LocalDate> activeDays = new HashSet<>();
    Map<DayOfWeek, Integer> weekdayCounts = new EnumMap<>(DayOfWeek.class);
    Map<TimeOfDay, Integer> timeCounts = new EnumMap<>(TimeOfDay.class);
    for (RideSummary ride : currentRides) {
      var started = ride.startedAt().atZone(safeTimezone);
      activeDays.add(started.toLocalDate());
      weekdayCounts.merge(started.getDayOfWeek(), 1, Integer::sum);
      timeCounts.merge(TimeOfDay.fromHour(started.getHour()), 1, Integer::sum);
    }

    Double distanceTrendPercent = previousDistanceM <= 0
        ? null
        : roundOneDecimal(((currentDistanceM - previousDistanceM) / previousDistanceM) * 100);
    double reviewCompletionPercent = validRides.isEmpty()
        ? 0
        : roundOneDecimal(reviewedCount * 100d / validRides.size());
    YearMonth currentMonth = YearMonth.from(today);
    double projectedMonthDistanceM = monthDistanceM <= 0
        ? 0
        : roundOneDecimal(monthDistanceM * currentMonth.lengthOfMonth() / today.getDayOfMonth());

    return new AnalyticsInsights(
        safeNow.toString(),
        currentRides.size(),
        roundOneDecimal(currentDistanceM),
        roundOneDecimal(previousDistanceM),
        roundOneDecimal(monthDistanceM),
        distanceTrendPercent,
        activeDays.size(),
        currentStreak(allRideDays, today),
        roundOneDecimal(longestRideM),
        roundOneDecimal(averageDistanceM),
        roundOneDecimal(averageDurationS),
        roundOneDecimal(averageTopSpeedKmh),
        favoriteWeekday(weekdayCounts),
        favoriteTimeOfDay(timeCounts),
        reviewCompletionPercent,
        cleanupCandidateCount,
        projectedMonthDistanceM);
  }

  private static ZoneId zoneId(String value) {
    if (value == null || value.isBlank() || value.length() > 80) return ZoneOffset.UTC;
    try {
      return ZoneId.of(value.trim());
    } catch (Exception ignored) {
      return ZoneOffset.UTC;
    }
  }

  private static RideSummary normalize(Map<String, Object> ride) {
    if (ride == null) return null;
    Instant startedAt = instant(ride.get("startedAt"));
    if (startedAt == null) return null;
    return new RideSummary(
        startedAt,
        nonNegativeNumber(ride.get("distanceM")),
        nonNegativeNumber(ride.get("durationS")),
        reasonableSpeed(ride.get("topSpeedKmh")),
        ride.get("reviewedAt"));
  }

  private static Instant instant(Object value) {
    if (value instanceof Instant instant) return instant;
    if (value == null) return null;
    try {
      return Instant.parse(String.valueOf(value));
    } catch (Exception ignored) {
      return null;
    }
  }

  private static double nonNegativeNumber(Object value) {
    Double number = RideMathService.optionalNumber(value);
    return number == null || !Double.isFinite(number) || number < 0 ? 0 : number;
  }

  private static double reasonableSpeed(Object value) {
    double speed = nonNegativeNumber(value);
    return speed <= 250 ? speed : 0;
  }

  private static double average(double[] values) {
    if (values.length == 0) return 0;
    double sum = 0;
    for (double value : values) sum += value;
    return sum / values.length;
  }

  private static int currentStreak(Set<LocalDate> rideDays, LocalDate today) {
    LocalDate cursor = rideDays.contains(today) ? today : today.minusDays(1);
    int streak = 0;
    while (rideDays.contains(cursor)) {
      streak += 1;
      cursor = cursor.minusDays(1);
    }
    return streak;
  }

  private static String favoriteWeekday(Map<DayOfWeek, Integer> counts) {
    DayOfWeek favorite = null;
    int bestCount = 0;
    for (DayOfWeek day : DayOfWeek.values()) {
      int count = counts.getOrDefault(day, 0);
      if (count > bestCount) {
        favorite = day;
        bestCount = count;
      }
    }
    return favorite == null ? null : favorite.getDisplayName(TextStyle.FULL, Locale.ENGLISH);
  }

  private static String favoriteTimeOfDay(Map<TimeOfDay, Integer> counts) {
    TimeOfDay favorite = null;
    int bestCount = 0;
    for (TimeOfDay time : TimeOfDay.values()) {
      int count = counts.getOrDefault(time, 0);
      if (count > bestCount) {
        favorite = time;
        bestCount = count;
      }
    }
    return favorite == null ? null : favorite.label;
  }

  private static double roundOneDecimal(double value) {
    return Math.round(value * 10) / 10d;
  }

  private record RideSummary(
      Instant startedAt,
      double distanceM,
      double durationS,
      double topSpeedKmh,
      Object reviewedAt) {
    boolean reviewed() {
      return reviewedAt != null;
    }
  }

  private enum TimeOfDay {
    MORNING("Morning"),
    AFTERNOON("Afternoon"),
    EVENING("Evening"),
    NIGHT("Night");

    private final String label;

    TimeOfDay(String label) {
      this.label = label;
    }

    static TimeOfDay fromHour(int hour) {
      if (hour >= 5 && hour < 12) return MORNING;
      if (hour >= 12 && hour < 17) return AFTERNOON;
      if (hour >= 17 && hour < 21) return EVENING;
      return NIGHT;
    }
  }
}
