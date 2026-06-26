const MAX_REASONABLE_SPEED_KMH = 250;

function decorateRide(ride, context = {}) {
  if (!ride) {
    return null;
  }

  const intelligence = buildRideIntelligence(ride, [], context);
  return {
    ...ride,
    badges: intelligence.badges,
    smartTitle: intelligence.suggestedTitle,
    summaryText: intelligence.summaryText,
    highlightReason: intelligence.highlightReason,
    memoryReason: buildMemoryReason(ride, intelligence),
    timeOfDayLabel: timeOfDayMood(ride?.startedAt).label,
    reviewPrompt: ride?.reviewedAt ? null : buildReviewPrompt(ride, intelligence),
    albumHint: buildAlbumHint(ride, intelligence)
  };
}

function decorateRides(rides, context = {}) {
  if (!Array.isArray(rides)) {
    return [];
  }
  return rides.map((ride) => decorateRide(ride, context)).filter(Boolean);
}

function buildJournal({ stats, recentRides, monthRides }) {
  const safeStats = normalizeStats(stats);
  const decoratedRecent = decorateRides(recentRides, safeStats);
  const decoratedMonth = decorateRides(monthRides, safeStats);
  const latestRide = decoratedRecent[0] || null;
  const bestRide = decoratedMonth.reduce((best, ride) => (
    !best || number(ride.distanceM) > number(best.distanceM) ? ride : best
  ), null);

  return {
    generatedAt: new Date().toISOString(),
    stats: safeStats,
    latestRide,
    monthlyRecap: {
      distanceM: safeStats.monthDistanceM,
      previousMonthDistanceM: safeStats.previousMonthDistanceM,
      distanceDeltaPercent: percentDelta(safeStats.monthDistanceM, safeStats.previousMonthDistanceM),
      rideCount: decoratedMonth.length,
      bestRide
    },
    highlights: buildHighlights(safeStats, latestRide, bestRide),
    recentRides: decoratedRecent,
    unreviewedCount: safeStats.unreviewedRides
  };
}

function buildHomeExperience({ stats, recentRides, monthRides }) {
  const journal = buildJournal({ stats, recentRides, monthRides });
  const pendingReviewSuggestions = journal.recentRides
    .filter((ride) => !ride.reviewedAt)
    .slice(0, 3)
    .map((ride) => ({
      rideId: ride.id,
      title: ride.smartTitle || "Untitled ride",
      prompt: ride.reviewPrompt || "Give this ride a title, note, or album pass."
    }));

  return {
    ...journal,
    generatedFor: "home",
    pendingReviewSuggestions,
    memorySeeds: buildMemorySeeds(journal)
  };
}

function buildRideIntelligence(ride, rawPoints = [], context = {}) {
  const safeRide = normalizeRide(ride);
  const points = normalizePoints(rawPoints);
  const midpoint = points.length ? points[Math.floor(points.length / 2)] : routeFallbackMidpoint(safeRide);
  const fastestSegment = findFastestSegment(points);
  const timeMood = timeOfDayMood(safeRide.startedAt);
  const distanceMood = distanceMoodForRide(safeRide.distanceM);
  const paceMood = paceMoodForRide(safeRide.avgSpeedKmh);
  const badges = buildRideBadges(safeRide, context, timeMood, distanceMood, paceMood);
  const suggestedTitle = buildSuggestedTitle(safeRide, timeMood);
  const highlightReason = buildHighlightReason(safeRide, context, fastestSegment, badges);
  const summaryText = buildSummaryText(safeRide, timeMood, distanceMood, paceMood, fastestSegment);

  return {
    suggestedTitle,
    summaryText,
    badges,
    highlightReason,
    fastestSegment,
    midpoint,
    comparisons: {
      distanceVsLongestM: context.longestRideDistanceM
        ? Math.round(safeRide.distanceM - number(context.longestRideDistanceM))
        : null,
      monthSharePercent: context.monthDistanceM
        ? Math.round((safeRide.distanceM / Math.max(1, number(context.monthDistanceM))) * 100)
        : null
    },
    chapters: buildChapters(safeRide, points, midpoint, fastestSegment)
  };
}

function buildHighlights(stats, latestRide, bestRide) {
  const highlights = [];
  if (latestRide) {
    highlights.push({
      id: "latest",
      type: "ride",
      title: "Latest escape",
      body: latestRide.summaryText || "Your newest route is ready to revisit.",
      rideId: latestRide.id,
      icon: "sparkles"
    });
  }

  if (bestRide) {
    highlights.push({
      id: "best-month",
      type: "ride",
      title: "Longest this month",
      body: `${formatKm(bestRide.distanceM)} across ${bestRide.startLabel || "the start"} → ${bestRide.endLabel || "the finish"}.`,
      rideId: bestRide.id,
      icon: "trophy"
    });
  }

  const monthDelta = percentDelta(stats.monthDistanceM, stats.previousMonthDistanceM);
  if (monthDelta != null) {
    highlights.push({
      id: "month-progress",
      type: "progress",
      title: monthDelta >= 0 ? "Month is moving up" : "A quieter month",
      body: `${monthDelta >= 0 ? "+" : ""}${monthDelta}% versus last month.`,
      icon: "trending-up"
    });
  }

  if (stats.unreviewedRides > 0) {
    highlights.push({
      id: "review-queue",
      type: "review",
      title: "Stories waiting",
      body: `${stats.unreviewedRides} ${stats.unreviewedRides === 1 ? "ride needs" : "rides need"} a title or note.`,
      icon: "create"
    });
  }

  if (isMilestone(stats.totalRides)) {
    highlights.push({
      id: "ride-count",
      type: "milestone",
      title: `${stats.totalRides} rides logged`,
      body: "A clean milestone in your RidePulse journal.",
      icon: "flag"
    });
  }

  return highlights.slice(0, 5);
}

function buildRideBadges(ride, context, timeMood, distanceMood, paceMood) {
  const badges = [timeMood.label];
  if (distanceMood.badge) badges.push(distanceMood.badge);
  if (paceMood.badge) badges.push(paceMood.badge);
  if (context.longestRideDistanceM && ride.distanceM >= number(context.longestRideDistanceM) * 0.999) {
    badges.unshift("Personal best");
  }
  if (!ride.reviewedAt) {
    badges.push("Needs story");
  }
  const uniqueBadges = [...new Set(badges)];
  if (!ride.reviewedAt && uniqueBadges.length > 4 && uniqueBadges.includes("Needs story")) {
    return [...uniqueBadges.filter((badge) => badge !== "Needs story").slice(0, 3), "Needs story"];
  }
  return uniqueBadges.slice(0, 4);
}

function buildSuggestedTitle(ride, timeMood) {
  if (ride.title?.trim()) {
    return ride.title.trim();
  }
  const destination = shortPlace(ride.endLabel) || "the finish";
  return `${timeMood.title} to ${destination}`;
}

function buildSummaryText(ride, timeMood, distanceMood, paceMood, fastestSegment) {
  const pace = fastestSegment?.speedKmh
    ? ` with a ${Math.round(fastestSegment.speedKmh)} km/h strongest section`
    : "";
  return `${distanceMood.copy} ${timeMood.copy} ${paceMood.copy}${pace}.`;
}

function buildHighlightReason(ride, context, fastestSegment, badges) {
  if (badges.includes("Personal best")) {
    return "Your longest ride so far.";
  }
  if (fastestSegment?.speedKmh && fastestSegment.speedKmh >= 80) {
    return "A route with a memorable fast section.";
  }
  if (!ride.reviewedAt) {
    return "Ready for a title, note, or photo pass.";
  }
  if (context.monthDistanceM && ride.distanceM / Math.max(1, number(context.monthDistanceM)) >= 0.35) {
    return "A big slice of this month’s riding.";
  }
  return "A route worth keeping in the front of the journal.";
}

function buildMemoryReason(ride, intelligence) {
  if (intelligence.badges.includes("Personal best")) {
    return "A personal-best route for your memory rail.";
  }
  if (!ride.reviewedAt) {
    return "Ready for photos, a title, and a proper recap.";
  }
  if (number(ride.distanceM) >= 30000) {
    return "A route with enough distance to feel like a chapter.";
  }
  return "A compact ride that still deserves a replay.";
}

function buildReviewPrompt(ride, intelligence) {
  const title = intelligence.suggestedTitle || "this ride";
  if (number(ride.distanceM) >= 30000) {
    return `Add notes to ${title} while the route is still fresh.`;
  }
  return `Give ${title} a quick title or memory note.`;
}

function buildAlbumHint(ride, intelligence) {
  if (intelligence.badges.includes("Night ride") || intelligence.badges.includes("Night run")) {
    return "Night rides look great with one cover photo.";
  }
  if (number(ride.distanceM) >= 30000) {
    return "Add a few photos to turn this route into an album memory.";
  }
  return "One photo is enough to make this ride feel like a memory.";
}

function buildMemorySeeds(journal) {
  const seeds = [];
  if (journal.latestRide) {
    seeds.push({
      id: `latest-${journal.latestRide.id}`,
      type: "latest",
      rideId: journal.latestRide.id,
      title: "Latest escape",
      subtitle: journal.latestRide.memoryReason || journal.latestRide.summaryText || "Ready to replay."
    });
  }
  if (journal.monthlyRecap.bestRide) {
    seeds.push({
      id: `best-month-${journal.monthlyRecap.bestRide.id}`,
      type: "best-month",
      rideId: journal.monthlyRecap.bestRide.id,
      title: "Best of the month",
      subtitle: `${formatKm(journal.monthlyRecap.bestRide.distanceM)} in one chapter.`
    });
  }
  if (journal.unreviewedCount > 0) {
    seeds.push({
      id: "review-queue",
      type: "review",
      title: "Stories waiting",
      subtitle: `${journal.unreviewedCount} ${journal.unreviewedCount === 1 ? "ride needs" : "rides need"} a title or note.`
    });
  }
  return seeds.slice(0, 5);
}

function buildChapters(ride, points, midpoint, fastestSegment) {
  const startPoint = points[0] || coordinateFromRide(ride, "start");
  const endPoint = points[points.length - 1] || coordinateFromRide(ride, "end");
  const chapters = [
    {
      id: "start",
      title: "Roll out",
      body: ride.startLabel || "Start point",
      timestamp: ride.startedAt,
      coordinate: startPoint
    }
  ];

  if (fastestSegment?.coordinate) {
    chapters.push({
      id: "pace",
      title: "Strongest pace",
      body: `${Math.round(fastestSegment.speedKmh)} km/h over ${formatKm(fastestSegment.distanceM)}.`,
      timestamp: fastestSegment.startedAt,
      coordinate: fastestSegment.coordinate
    });
  }

  if (midpoint) {
    chapters.push({
      id: "midpoint",
      title: "Mid-route pulse",
      body: "The ride’s visual midpoint.",
      timestamp: midpoint.recordedAt || null,
      coordinate: midpoint
    });
  }

  chapters.push({
    id: "finish",
    title: "Finish",
    body: ride.endLabel || "End point",
    timestamp: ride.endedAt || null,
    coordinate: endPoint
  });

  return chapters.filter((chapter) => chapter.coordinate).slice(0, 4);
}

function findFastestSegment(points) {
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const startedAtMs = Date.parse(previous.recordedAt || "");
    const endedAtMs = Date.parse(current.recordedAt || "");
    const durationS = (endedAtMs - startedAtMs) / 1000;
    if (!Number.isFinite(durationS) || durationS < 5 || durationS > 600) {
      continue;
    }

    const distanceM = distanceMeters(previous, current);
    if (distanceM < 20) {
      continue;
    }

    const speedKmh = (distanceM / 1000) / (durationS / 3600);
    if (!Number.isFinite(speedKmh) || speedKmh < 1 || speedKmh > MAX_REASONABLE_SPEED_KMH) {
      continue;
    }

    if (!best || speedKmh > best.speedKmh) {
      best = {
        speedKmh,
        distanceM: Math.round(distanceM),
        durationS: Math.round(durationS),
        startedAt: previous.recordedAt,
        endedAt: current.recordedAt,
        coordinate: current
      };
    }
  }
  return best ? { ...best, speedKmh: Math.round(best.speedKmh * 10) / 10 } : null;
}

function normalizeStats(stats = {}) {
  return {
    todayDistanceM: number(stats.todayDistanceM),
    monthDistanceM: number(stats.monthDistanceM),
    yearDistanceM: number(stats.yearDistanceM),
    totalRides: number(stats.totalRides),
    unreviewedRides: number(stats.unreviewedRides),
    bestTopSpeedKmh: number(stats.bestTopSpeedKmh),
    averageSpeedKmh: number(stats.averageSpeedKmh),
    previousMonthDistanceM: number(stats.previousMonthDistanceM),
    longestRideDistanceM: number(stats.longestRideDistanceM)
  };
}

function normalizeRide(ride = {}) {
  return {
    ...ride,
    id: String(ride.id || ""),
    startLabel: String(ride.startLabel || "Start point"),
    endLabel: String(ride.endLabel || "End point"),
    distanceM: number(ride.distanceM),
    durationS: number(ride.durationS),
    topSpeedKmh: number(ride.topSpeedKmh),
    avgSpeedKmh: number(ride.avgSpeedKmh),
    startedAt: typeof ride.startedAt === "string" || ride.startedAt instanceof Date ? ride.startedAt : null,
    endedAt: typeof ride.endedAt === "string" || ride.endedAt instanceof Date ? ride.endedAt : null
  };
}

function normalizePoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .map((point) => {
      const latitude = Number(point?.latitude);
      const longitude = Number(point?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return null;
      }
      return {
        latitude,
        longitude,
        speedKmh: optionalNumber(point?.speedKmh),
        recordedAt: typeof point?.recordedAt === "string" || point?.recordedAt instanceof Date ? point.recordedAt : null
      };
    })
    .filter(Boolean);
}

function distanceMoodForRide(distanceM) {
  if (distanceM >= 80000) return { badge: "Big day", copy: "A serious long-form ride." };
  if (distanceM >= 30000) return { badge: "Open road", copy: "A proper open-road chapter." };
  if (distanceM >= 8000) return { badge: "City escape", copy: "A compact ride with enough road to remember." };
  return { badge: "Quick spin", copy: "A short, sharp entry in the journal." };
}

function paceMoodForRide(avgSpeedKmh) {
  if (avgSpeedKmh >= 70) return { badge: "Fast flow", copy: "The pace stayed energetic" };
  if (avgSpeedKmh >= 35) return { badge: "Steady cruise", copy: "The rhythm felt steady" };
  return { badge: "Easy roll", copy: "The tempo stayed relaxed" };
}

function timeOfDayMood(value) {
  const hour = Number.isFinite(Date.parse(value || "")) ? new Date(value).getHours() : 12;
  if (hour < 5) return { label: "Night run", title: "Night run", copy: "under quiet late-night roads." };
  if (hour < 11) return { label: "Morning ride", title: "Morning ride", copy: "with a morning-road feel." };
  if (hour < 16) return { label: "Day ride", title: "Day ride", copy: "through the bright part of the day." };
  if (hour < 20) return { label: "Evening ride", title: "Evening ride", copy: "as the day started to soften." };
  return { label: "Night ride", title: "Night ride", copy: "after dark." };
}

function routeFallbackMidpoint(ride) {
  const start = coordinateFromRide(ride, "start");
  const end = coordinateFromRide(ride, "end");
  if (!start || !end) {
    return null;
  }
  return {
    latitude: (start.latitude + end.latitude) / 2,
    longitude: (start.longitude + end.longitude) / 2,
    recordedAt: null
  };
}

function coordinateFromRide(ride, edge) {
  const latitude = Number(ride[`${edge}Latitude`]);
  const longitude = Number(ride[`${edge}Longitude`]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude, recordedAt: edge === "start" ? ride.startedAt : ride.endedAt };
}

function shortPlace(label) {
  return String(label || "")
    .split(",")[0]
    .replace(/\([^)]*\)/g, "")
    .trim()
    .slice(0, 36);
}

function percentDelta(current, previous) {
  const safePrevious = number(previous);
  if (safePrevious <= 0) {
    return null;
  }
  return Math.round(((number(current) - safePrevious) / safePrevious) * 100);
}

function isMilestone(count) {
  return [1, 5, 10, 25, 50, 100, 250, 500].includes(number(count));
}

function formatKm(distanceM) {
  return `${(number(distanceM) / 1000).toFixed(number(distanceM) >= 10000 ? 0 : 1)} km`;
}

function distanceMeters(a, b) {
  const earthRadiusM = 6371000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function optionalNumber(value) {
  if (value == null) return null;
  const safe = Number(value);
  return Number.isFinite(safe) ? safe : null;
}

function number(value) {
  const safe = Number(value);
  return Number.isFinite(safe) ? safe : 0;
}

module.exports = {
  buildHomeExperience,
  buildJournal,
  buildRideIntelligence,
  decorateRide,
  decorateRides
};
