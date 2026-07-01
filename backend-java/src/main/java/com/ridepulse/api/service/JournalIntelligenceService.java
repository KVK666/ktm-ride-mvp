package com.ridepulse.api.service;

import com.ridepulse.api.constants.Messages;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class JournalIntelligenceService {
  private static final double MAX_REASONABLE_SPEED_KMH = 250;
  private final RideMathService rideMathService;

  JournalIntelligenceService(RideMathService rideMathService) {
    this.rideMathService = rideMathService;
  }

  public Map<String, Object> decorateRide(Map<String, Object> ride, Map<String, Object> context) {
    if (ride == null) return null;
    Map<String, Object> intelligence = buildRideIntelligence(ride, List.of(), context);
    Map<String, Object> decorated = new LinkedHashMap<>(ride);
    decorated.put("badges", intelligence.get("badges"));
    decorated.put("smartTitle", intelligence.get("suggestedTitle"));
    decorated.put("summaryText", intelligence.get("summaryText"));
    decorated.put("highlightReason", intelligence.get("highlightReason"));
    decorated.put("memoryReason", buildMemoryReason(ride, intelligence));
    decorated.put("timeOfDayLabel", timeOfDayMood(ride.get("startedAt")).get("label"));
    decorated.put("reviewPrompt", ride.get("reviewedAt") == null ? buildReviewPrompt(ride, intelligence) : null);
    decorated.put("albumHint", buildAlbumHint(ride, intelligence));
    return decorated;
  }

  public List<Map<String, Object>> decorateRides(List<Map<String, Object>> rides, Map<String, Object> context) {
    if (rides == null) return List.of();
    List<Map<String, Object>> decorated = new ArrayList<>();
    for (Map<String, Object> ride : rides) {
      Map<String, Object> value = decorateRide(ride, context == null ? Map.of() : context);
      if (value != null) decorated.add(value);
    }
    return decorated;
  }

  public Map<String, Object> buildJournal(Map<String, Object> stats, List<Map<String, Object>> recentRides, List<Map<String, Object>> monthRides) {
    Map<String, Object> safeStats = normalizeStats(stats);
    List<Map<String, Object>> decoratedRecent = decorateRides(recentRides, safeStats);
    List<Map<String, Object>> decoratedMonth = decorateRides(monthRides, safeStats);
    Map<String, Object> latestRide = decoratedRecent.isEmpty() ? null : decoratedRecent.get(0);
    Map<String, Object> bestRide = null;
    for (Map<String, Object> ride : decoratedMonth) {
      if (bestRide == null || number(ride.get("distanceM")) > number(bestRide.get("distanceM"))) {
        bestRide = ride;
      }
    }
    Map<String, Object> monthlyRecap = new LinkedHashMap<>();
    monthlyRecap.put("distanceM", safeStats.get("monthDistanceM"));
    monthlyRecap.put("previousMonthDistanceM", safeStats.get("previousMonthDistanceM"));
    monthlyRecap.put("distanceDeltaPercent", percentDelta(safeStats.get("monthDistanceM"), safeStats.get("previousMonthDistanceM")));
    monthlyRecap.put("rideCount", decoratedMonth.size());
    monthlyRecap.put("bestRide", bestRide);

    Map<String, Object> journal = new LinkedHashMap<>();
    journal.put("generatedAt", Instant.now().toString());
    journal.put("stats", safeStats);
    journal.put("latestRide", latestRide);
    journal.put("monthlyRecap", monthlyRecap);
    journal.put("highlights", buildHighlights(safeStats, latestRide, bestRide));
    journal.put("recentRides", decoratedRecent);
    journal.put("unreviewedCount", safeStats.get("unreviewedRides"));
    return journal;
  }

  public Map<String, Object> buildHomeExperience(Map<String, Object> stats, List<Map<String, Object>> recentRides, List<Map<String, Object>> monthRides) {
    Map<String, Object> journal = new LinkedHashMap<>(buildJournal(stats, recentRides, monthRides));
    List<Map<String, Object>> pending = new ArrayList<>();
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> recent = (List<Map<String, Object>>) journal.get("recentRides");
    for (Map<String, Object> ride : recent) {
      if (ride.get("reviewedAt") == null && pending.size() < 3) {
        pending.add(Map.of(
            "rideId", ride.get("id"),
            "title", stringOrDefault(ride.get("smartTitle"), "Untitled ride"),
            "prompt", stringOrDefault(ride.get("reviewPrompt"), "Give this ride a title, note, or album pass.")));
      }
    }
    journal.put("generatedFor", "home");
    journal.put("pendingReviewSuggestions", pending);
    journal.put("memorySeeds", buildMemorySeeds(journal));
    return journal;
  }

  public Map<String, Object> buildRideIntelligence(Map<String, Object> ride, List<Map<String, Object>> rawPoints, Map<String, Object> context) {
    Map<String, Object> safeRide = normalizeRide(ride);
    List<Map<String, Object>> points = normalizePoints(rawPoints);
    Map<String, Object> midpoint = points.isEmpty() ? routeFallbackMidpoint(safeRide) : points.get(points.size() / 2);
    Map<String, Object> fastestSegment = findFastestSegment(points);
    Map<String, Object> timeMood = timeOfDayMood(safeRide.get("startedAt"));
    Map<String, Object> distanceMood = distanceMoodForRide(number(safeRide.get("distanceM")));
    Map<String, Object> paceMood = paceMoodForRide(number(safeRide.get("avgSpeedKmh")));
    List<String> badges = buildRideBadges(safeRide, context == null ? Map.of() : context, timeMood, distanceMood, paceMood);

    Map<String, Object> comparisons = new LinkedHashMap<>();
    comparisons.put("distanceVsLongestM", number(context == null ? null : context.get("longestRideDistanceM")) > 0
        ? Math.round(number(safeRide.get("distanceM")) - number(context.get("longestRideDistanceM")))
        : null);
    comparisons.put("monthSharePercent", number(context == null ? null : context.get("monthDistanceM")) > 0
        ? Math.round((number(safeRide.get("distanceM")) / Math.max(1, number(context.get("monthDistanceM")))) * 100)
        : null);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("suggestedTitle", buildSuggestedTitle(safeRide, timeMood));
    result.put("summaryText", buildSummaryText(safeRide, timeMood, distanceMood, paceMood, fastestSegment));
    result.put("badges", badges);
    result.put("highlightReason", buildHighlightReason(safeRide, context == null ? Map.of() : context, fastestSegment, badges));
    result.put("fastestSegment", fastestSegment);
    result.put("midpoint", midpoint);
    result.put("comparisons", comparisons);
    result.put("chapters", buildChapters(safeRide, points, midpoint, fastestSegment));
    return result;
  }

  private List<Map<String, Object>> buildHighlights(Map<String, Object> stats, Map<String, Object> latestRide, Map<String, Object> bestRide) {
    List<Map<String, Object>> highlights = new ArrayList<>();
    if (latestRide != null) {
      highlights.add(highlight("latest", "ride", "Latest escape", stringOrDefault(latestRide.get("summaryText"), "Your newest route is ready to revisit."), latestRide.get("id"), "sparkles"));
    }
    if (bestRide != null) {
      highlights.add(highlight("best-month", "ride", "Longest this month", formatKm(bestRide.get("distanceM")) + " across " + stringOrDefault(bestRide.get("startLabel"), "the start") + " -> " + stringOrDefault(bestRide.get("endLabel"), "the finish") + ".", bestRide.get("id"), "trophy"));
    }
    Integer delta = percentDelta(stats.get("monthDistanceM"), stats.get("previousMonthDistanceM"));
    if (delta != null) {
      highlights.add(highlight("month-progress", "progress", delta >= 0 ? "Month is moving up" : "A quieter month", (delta >= 0 ? "+" : "") + delta + "% versus last month.", null, "trending-up"));
    }
    if (number(stats.get("unreviewedRides")) > 0) {
      int count = (int) number(stats.get("unreviewedRides"));
      highlights.add(highlight("review-queue", "review", "Stories waiting", count + " " + (count == 1 ? "ride needs" : "rides need") + " a title or note.", null, "create"));
    }
    if (isMilestone((int) number(stats.get("totalRides")))) {
      highlights.add(highlight("ride-count", "milestone", ((int) number(stats.get("totalRides"))) + " rides logged", "A clean milestone in your RidePulse journal.", null, "flag"));
    }
    return highlights.size() > 5 ? highlights.subList(0, 5) : highlights;
  }

  private Map<String, Object> highlight(String id, String type, String title, String body, Object rideId, String icon) {
    Map<String, Object> highlight = new LinkedHashMap<>();
    highlight.put("id", id);
    highlight.put("type", type);
    highlight.put("title", title);
    highlight.put("body", body);
    if (rideId != null) highlight.put("rideId", rideId);
    highlight.put("icon", icon);
    return highlight;
  }

  private List<String> buildRideBadges(Map<String, Object> ride, Map<String, Object> context, Map<String, Object> timeMood, Map<String, Object> distanceMood, Map<String, Object> paceMood) {
    Set<String> badges = new LinkedHashSet<>();
    badges.add(String.valueOf(timeMood.get("label")));
    addBadge(badges, distanceMood.get("badge"));
    addBadge(badges, paceMood.get("badge"));
    if (number(context.get("longestRideDistanceM")) > 0 && number(ride.get("distanceM")) >= number(context.get("longestRideDistanceM")) * 0.999) {
      List<String> reordered = new ArrayList<>(badges);
      reordered.add(0, "Personal best");
      badges = new LinkedHashSet<>(reordered);
    }
    if (ride.get("reviewedAt") == null) badges.add("Needs story");
    List<String> list = new ArrayList<>(badges);
    if (ride.get("reviewedAt") == null && list.size() > 4 && list.contains("Needs story")) {
      list.remove("Needs story");
      list = new ArrayList<>(list.subList(0, Math.min(3, list.size())));
      list.add("Needs story");
    }
    return list.size() > 4 ? list.subList(0, 4) : list;
  }

  private String buildSuggestedTitle(Map<String, Object> ride, Map<String, Object> timeMood) {
    String title = string(ride.get("title")).trim();
    if (!title.isBlank()) return title;
    String destination = shortPlace(ride.get("endLabel"));
    return timeMood.get("title") + " to " + (destination.isBlank() ? "the finish" : destination);
  }

  private String buildSummaryText(Map<String, Object> ride, Map<String, Object> timeMood, Map<String, Object> distanceMood, Map<String, Object> paceMood, Map<String, Object> fastestSegment) {
    String pace = fastestSegment != null && number(fastestSegment.get("speedKmh")) > 0
        ? " with a " + Math.round(number(fastestSegment.get("speedKmh"))) + " km/h strongest section"
        : "";
    return distanceMood.get("copy") + " " + timeMood.get("copy") + " " + paceMood.get("copy") + pace + ".";
  }

  private String buildHighlightReason(Map<String, Object> ride, Map<String, Object> context, Map<String, Object> fastestSegment, List<String> badges) {
    if (badges.contains("Personal best")) return "Your longest ride so far.";
    if (fastestSegment != null && number(fastestSegment.get("speedKmh")) >= 80) return "A route with a memorable fast section.";
    if (ride.get("reviewedAt") == null) return "Ready for a title, note, or photo pass.";
    if (number(context.get("monthDistanceM")) > 0 && number(ride.get("distanceM")) / Math.max(1, number(context.get("monthDistanceM"))) >= 0.35) {
      return "A big slice of this month's riding.";
    }
    return "A route worth keeping in the front of the journal.";
  }

  private String buildMemoryReason(Map<String, Object> ride, Map<String, Object> intelligence) {
    @SuppressWarnings("unchecked")
    List<String> badges = (List<String>) intelligence.getOrDefault("badges", List.of());
    if (badges.contains("Personal best")) return "A personal-best route for your memory rail.";
    if (ride.get("reviewedAt") == null) return "Ready for photos, a title, and a proper recap.";
    if (number(ride.get("distanceM")) >= 30000) return "A route with enough distance to feel like a chapter.";
    return "A compact ride that still deserves a replay.";
  }

  private String buildReviewPrompt(Map<String, Object> ride, Map<String, Object> intelligence) {
    String title = stringOrDefault(intelligence.get("suggestedTitle"), "this ride");
    if (number(ride.get("distanceM")) >= 30000) return "Add notes to " + title + " while the route is still fresh.";
    return "Give " + title + " a quick title or memory note.";
  }

  private String buildAlbumHint(Map<String, Object> ride, Map<String, Object> intelligence) {
    @SuppressWarnings("unchecked")
    List<String> badges = (List<String>) intelligence.getOrDefault("badges", List.of());
    if (badges.contains("Night ride") || badges.contains("Night run")) return "Night rides look great with one cover photo.";
    if (number(ride.get("distanceM")) >= 30000) return "Add a few photos to turn this route into an album memory.";
    return "One photo is enough to make this ride feel like a memory.";
  }

  private List<Map<String, Object>> buildMemorySeeds(Map<String, Object> journal) {
    List<Map<String, Object>> seeds = new ArrayList<>();
    @SuppressWarnings("unchecked")
    Map<String, Object> latestRide = (Map<String, Object>) journal.get("latestRide");
    if (latestRide != null) {
      seeds.add(Map.of(
          "id", "latest-" + latestRide.get("id"),
          "type", "latest",
          "rideId", latestRide.get("id"),
          "title", "Latest escape",
          "subtitle", stringOrDefault(latestRide.get("memoryReason"), stringOrDefault(latestRide.get("summaryText"), "Ready to replay."))));
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> monthly = (Map<String, Object>) journal.get("monthlyRecap");
    @SuppressWarnings("unchecked")
    Map<String, Object> bestRide = monthly == null ? null : (Map<String, Object>) monthly.get("bestRide");
    if (bestRide != null) {
      seeds.add(Map.of("id", "best-month-" + bestRide.get("id"), "type", "best-month", "rideId", bestRide.get("id"), "title", "Best of the month", "subtitle", formatKm(bestRide.get("distanceM")) + " in one chapter."));
    }
    if (number(journal.get("unreviewedCount")) > 0) {
      int count = (int) number(journal.get("unreviewedCount"));
      seeds.add(Map.of("id", "review-queue", "type", "review", "title", "Stories waiting", "subtitle", count + " " + (count == 1 ? "ride needs" : "rides need") + " a title or note."));
    }
    return seeds.size() > 5 ? seeds.subList(0, 5) : seeds;
  }

  private List<Map<String, Object>> buildChapters(Map<String, Object> ride, List<Map<String, Object>> points, Map<String, Object> midpoint, Map<String, Object> fastestSegment) {
    List<Map<String, Object>> chapters = new ArrayList<>();
    Map<String, Object> start = points.isEmpty() ? coordinateFromRide(ride, "start") : points.get(0);
    Map<String, Object> end = points.isEmpty() ? coordinateFromRide(ride, "end") : points.get(points.size() - 1);
    addChapter(chapters, "start", "Roll out", stringOrDefault(ride.get("startLabel"), Messages.DEFAULT_START_LABEL), ride.get("startedAt"), start);
    if (fastestSegment != null && fastestSegment.get("coordinate") != null) {
      addChapter(chapters, "pace", "Strongest pace", Math.round(number(fastestSegment.get("speedKmh"))) + " km/h over " + formatKm(fastestSegment.get("distanceM")) + ".", fastestSegment.get("startedAt"), fastestSegment.get("coordinate"));
    }
    if (midpoint != null) {
      addChapter(chapters, "midpoint", "Mid-route pulse", "The ride's visual midpoint.", midpoint.get("recordedAt"), midpoint);
    }
    addChapter(chapters, "finish", "Finish", stringOrDefault(ride.get("endLabel"), Messages.DEFAULT_END_LABEL), ride.get("endedAt"), end);
    return chapters.size() > 4 ? chapters.subList(0, 4) : chapters;
  }

  private void addChapter(List<Map<String, Object>> chapters, String id, String title, String body, Object timestamp, Object coordinate) {
    if (coordinate == null) return;
    Map<String, Object> chapter = new LinkedHashMap<>();
    chapter.put("id", id);
    chapter.put("title", title);
    chapter.put("body", body);
    chapter.put("timestamp", timestamp);
    chapter.put("coordinate", coordinate);
    chapters.add(chapter);
  }

  private Map<String, Object> findFastestSegment(List<Map<String, Object>> points) {
    Map<String, Object> best = null;
    for (int index = 1; index < points.size(); index += 1) {
      Map<String, Object> previous = points.get(index - 1);
      Map<String, Object> current = points.get(index);
      Long started = RideMathService.timestampMs(previous.get("recordedAt"));
      Long ended = RideMathService.timestampMs(current.get("recordedAt"));
      if (started == null || ended == null) continue;
      double durationS = (ended - started) / 1000d;
      if (!Double.isFinite(durationS) || durationS < 5 || durationS > 600) continue;
      double distanceM = rideMathService.distanceMeters(previous, current);
      if (distanceM < 20) continue;
      double speedKmh = (distanceM / 1000) / (durationS / 3600);
      if (!Double.isFinite(speedKmh) || speedKmh < 1 || speedKmh > MAX_REASONABLE_SPEED_KMH) continue;
      if (best == null || speedKmh > number(best.get("speedKmh"))) {
        best = new LinkedHashMap<>();
        best.put("speedKmh", Math.round(speedKmh * 10) / 10d);
        best.put("distanceM", Math.round(distanceM));
        best.put("durationS", Math.round(durationS));
        best.put("startedAt", previous.get("recordedAt"));
        best.put("endedAt", current.get("recordedAt"));
        best.put("coordinate", current);
      }
    }
    return best;
  }

  private Map<String, Object> normalizeStats(Map<String, Object> stats) {
    Map<String, Object> safe = new LinkedHashMap<>();
    for (String key : List.of("todayDistanceM", "monthDistanceM", "yearDistanceM", "totalRides", "unreviewedRides", "bestTopSpeedKmh", "averageSpeedKmh", "previousMonthDistanceM", "longestRideDistanceM")) {
      safe.put(key, number(stats == null ? null : stats.get(key)));
    }
    return safe;
  }

  private Map<String, Object> normalizeRide(Map<String, Object> ride) {
    Map<String, Object> safe = new LinkedHashMap<>(ride == null ? Map.of() : ride);
    safe.put("id", stringOrDefault(safe.get("id"), ""));
    safe.put("startLabel", stringOrDefault(safe.get("startLabel"), Messages.DEFAULT_START_LABEL));
    safe.put("endLabel", stringOrDefault(safe.get("endLabel"), Messages.DEFAULT_END_LABEL));
    safe.put("distanceM", number(safe.get("distanceM")));
    safe.put("durationS", number(safe.get("durationS")));
    safe.put("topSpeedKmh", number(safe.get("topSpeedKmh")));
    safe.put("avgSpeedKmh", number(safe.get("avgSpeedKmh")));
    return safe;
  }

  private List<Map<String, Object>> normalizePoints(List<Map<String, Object>> points) {
    if (points == null) return List.of();
    List<Map<String, Object>> safe = new ArrayList<>();
    for (Map<String, Object> point : points) {
      Double latitude = RideMathService.optionalNumber(point.get("latitude"));
      Double longitude = RideMathService.optionalNumber(point.get("longitude"));
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
      Map<String, Object> normalized = new LinkedHashMap<>();
      normalized.put("latitude", latitude);
      normalized.put("longitude", longitude);
      if (RideMathService.optionalNumber(point.get("speedKmh")) != null) normalized.put("speedKmh", RideMathService.optionalNumber(point.get("speedKmh")));
      normalized.put("recordedAt", point.get("recordedAt") instanceof String ? point.get("recordedAt") : null);
      safe.add(normalized);
    }
    return safe;
  }

  private Map<String, Object> distanceMoodForRide(double distanceM) {
    if (distanceM >= 80000) return Map.of("badge", "Big day", "copy", "A serious long-form ride.");
    if (distanceM >= 30000) return Map.of("badge", "Open road", "copy", "A proper open-road chapter.");
    if (distanceM >= 8000) return Map.of("badge", "City escape", "copy", "A compact ride with enough road to remember.");
    return Map.of("badge", "Quick spin", "copy", "A short, sharp entry in the journal.");
  }

  private Map<String, Object> paceMoodForRide(double avgSpeedKmh) {
    if (avgSpeedKmh >= 70) return Map.of("badge", "Fast flow", "copy", "The pace stayed energetic");
    if (avgSpeedKmh >= 35) return Map.of("badge", "Steady cruise", "copy", "The rhythm felt steady");
    return Map.of("badge", "Easy roll", "copy", "The tempo stayed relaxed");
  }

  private Map<String, Object> timeOfDayMood(Object value) {
    int hour = 12;
    try {
      hour = Instant.parse(String.valueOf(value)).atZone(ZoneId.systemDefault()).getHour();
    } catch (Exception ignored) {
    }
    if (hour < 5) return Map.of("label", "Night run", "title", "Night run", "copy", "under quiet late-night roads.");
    if (hour < 11) return Map.of("label", "Morning ride", "title", "Morning ride", "copy", "with a morning-road feel.");
    if (hour < 16) return Map.of("label", "Day ride", "title", "Day ride", "copy", "through the bright part of the day.");
    if (hour < 20) return Map.of("label", "Evening ride", "title", "Evening ride", "copy", "as the day started to soften.");
    return Map.of("label", "Night ride", "title", "Night ride", "copy", "after dark.");
  }

  private Map<String, Object> routeFallbackMidpoint(Map<String, Object> ride) {
    Map<String, Object> start = coordinateFromRide(ride, "start");
    Map<String, Object> end = coordinateFromRide(ride, "end");
    if (start == null || end == null) return null;
    Map<String, Object> midpoint = new LinkedHashMap<>();
    midpoint.put("latitude", (number(start.get("latitude")) + number(end.get("latitude"))) / 2);
    midpoint.put("longitude", (number(start.get("longitude")) + number(end.get("longitude"))) / 2);
    midpoint.put("recordedAt", null);
    return midpoint;
  }

  private Map<String, Object> coordinateFromRide(Map<String, Object> ride, String edge) {
    Double latitude = RideMathService.optionalNumber(ride.get(edge + "Latitude"));
    Double longitude = RideMathService.optionalNumber(ride.get(edge + "Longitude"));
    if (latitude == null || longitude == null) return null;
    Map<String, Object> coordinate = new LinkedHashMap<>();
    coordinate.put("latitude", latitude);
    coordinate.put("longitude", longitude);
    coordinate.put("recordedAt", "start".equals(edge) ? ride.get("startedAt") : ride.get("endedAt"));
    return coordinate;
  }

  private String shortPlace(Object value) {
    String label = string(value).split(",", 2)[0].replaceAll("\\([^)]*\\)", "").trim();
    return label.length() > 36 ? label.substring(0, 36) : label;
  }

  private Integer percentDelta(Object current, Object previous) {
    double safePrevious = number(previous);
    if (safePrevious <= 0) return null;
    return (int) Math.round(((number(current) - safePrevious) / safePrevious) * 100);
  }

  private boolean isMilestone(int count) {
    return Set.of(1, 5, 10, 25, 50, 100, 250, 500).contains(count);
  }

  private String formatKm(Object distanceM) {
    double distance = number(distanceM);
    return String.format(java.util.Locale.US, distance >= 10000 ? "%.0f km" : "%.1f km", distance / 1000);
  }

  private void addBadge(Set<String> badges, Object badge) {
    String value = string(badge);
    if (!value.isBlank()) badges.add(value);
  }

  private static String stringOrDefault(Object value, String fallback) {
    String text = string(value);
    return text.isBlank() ? fallback : text;
  }

  private static String string(Object value) {
    return value == null ? "" : String.valueOf(value);
  }

  private static double number(Object value) {
    Double safe = RideMathService.optionalNumber(value);
    return safe == null ? 0 : safe;
  }
}
