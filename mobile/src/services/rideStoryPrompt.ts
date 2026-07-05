import { Ride } from "../types";
import { duration, km, kmh, shortDate, time } from "../utils/format";
import { diagnosticDetails, logDiagnostic } from "./diagnostics";

export type StoryPromptVariantId =
  | "cinematic"
  | "performance"
  | "rainy-monsoon"
  | "sunrise-sunset"
  | "night-city"
  | "highway-run"
  | "mountain-ghat"
  | "minimal-stat"
  | "photo-real-travel";

export type WeatherMood = "clear" | "cloudy" | "rainy" | "stormy" | "windy" | "hot" | "cool" | "unknown";

export type RideWeatherMood = {
  mood: WeatherMood;
  label: string;
  temperatureC?: number;
  windKmh?: number;
  cloudCover?: number;
  precipitationMm?: number;
  weatherCode?: number;
  observedAt?: string;
  source: "open-meteo";
};

export type StoryPromptVariant = {
  id: StoryPromptVariantId;
  label: string;
  description: string;
  visualDirection: string;
  angles: string[];
};

type RidePromptContext = {
  timeMood: "dawn" | "day" | "sunset" | "night";
  placeMood: "highway" | "city" | "hills" | "lake" | "beach" | "forest" | "cafe" | "unknown";
  rideMood: "relaxed" | "quick commute" | "long ride" | "fast run" | "endurance ride";
};

const WEATHER_TIMEOUT_MS = 6500;

export const STORY_PROMPT_VARIANTS: StoryPromptVariant[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Movie-poster lighting with dramatic road atmosphere",
    visualDirection: "cinematic motorcycle travel poster, deep contrast, realistic road textures, dramatic light, premium editorial composition",
    angles: [
      "make it feel like the final frame of a memorable ride",
      "compose it like a high-energy road-trip poster",
      "use strong shadows and clean electric-cyan highlights"
    ]
  },
  {
    id: "performance",
    label: "Performance",
    description: "Sharp, brand-neutral performance energy",
    visualDirection: "unbranded motorcycle performance poster, graphite and electric-cyan palette, sharp panels, speed lines, technical dashboard energy",
    angles: [
      "make the ride feel precise, fast, and mechanical",
      "use angular shapes inspired by a street motorcycle cockpit",
      "build a bold performance poster around the route stats"
    ]
  },
  {
    id: "rainy-monsoon",
    label: "Rainy",
    description: "Wet road, reflections, cloudy monsoon mood",
    visualDirection: "rainy monsoon motorcycle story, wet asphalt reflections, moody clouds, glowing street lights, realistic water spray",
    angles: [
      "make the road feel freshly rained on without hiding the text",
      "lean into reflective puddles and a stormy riding mood",
      "use mist, rain streaks, and restrained cyan highlights"
    ]
  },
  {
    id: "sunrise-sunset",
    label: "Golden Hour",
    description: "Warm dawn or sunset travel image",
    visualDirection: "golden-hour motorcycle travel story, warm sky, long road, soft sunlight, premium adventure photography mood",
    angles: [
      "make the ride feel calm, open, and worth remembering",
      "use a glowing horizon and clean space for stats",
      "give it a sunrise or sunset touring atmosphere"
    ]
  },
  {
    id: "night-city",
    label: "Night City",
    description: "Urban night ride with neon and street light",
    visualDirection: "night city motorcycle ride, neon reflections, dark urban streets, cinematic street lights, high contrast graphite and cyan details",
    angles: [
      "make it feel like a late-night city run",
      "use clean neon accents but keep the stats readable",
      "show motion through light trails and glossy road texture"
    ]
  },
  {
    id: "highway-run",
    label: "Highway",
    description: "Open road and fast touring energy",
    visualDirection: "open highway motorcycle story, long vanishing-point road, motion blur, distant horizon, sporty touring mood",
    angles: [
      "make the route feel fast and open",
      "use a wide highway perspective and strong sense of movement",
      "build the image around distance, speed, and route flow"
    ]
  },
  {
    id: "mountain-ghat",
    label: "Ghat",
    description: "Mountain curves and scenic elevation mood",
    visualDirection: "mountain ghat motorcycle ride, winding road, layered hills, misty curves, adventure touring atmosphere",
    angles: [
      "make the route feel twisty and scenic",
      "show curved roads and layered hills without inventing exact geography",
      "use a premium travel-poster mood with cyan route energy"
    ]
  },
  {
    id: "minimal-stat",
    label: "Minimal",
    description: "Clean graphic poster with strong stat hierarchy",
    visualDirection: "minimal modern Instagram story poster, graphite background, cyan route line, clean typography blocks, simple premium dashboard style",
    angles: [
      "make the route line the hero",
      "keep the layout simple, bold, and easy to read",
      "use lots of clean negative space around the stats"
    ]
  },
  {
    id: "photo-real-travel",
    label: "Travel",
    description: "Photo-real road-trip story image",
    visualDirection: "photo-realistic motorcycle travel story, natural road scene, realistic light, documentary ride memory, premium mobile wallpaper composition",
    angles: [
      "make it feel like a real memory from this ride",
      "keep the motorcycle-travel mood grounded and believable",
      "use natural colors with subtle RidePulse cyan accents"
    ]
  }
];

export async function fetchRideWeatherMood(ride: Ride): Promise<RideWeatherMood | null> {
  const latitude = Number(ride.startLatitude);
  const longitude = Number(ride.startLongitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !ride.startedAt) {
    return null;
  }

  const startedAt = new Date(ride.startedAt);
  if (Number.isNaN(startedAt.getTime())) {
    return null;
  }

  const date = startedAt.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m",
    start_date: date,
    end_date: date,
    timezone: "GMT",
    wind_speed_unit: "kmh"
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    const hourly = body?.hourly;
    if (!hourly?.time?.length) {
      return null;
    }

    const index = nearestWeatherIndex(hourly.time, startedAt.getTime());
    const temperatureC = numberAt(hourly.temperature_2m, index);
    const windKmh = numberAt(hourly.wind_speed_10m, index);
    const cloudCover = numberAt(hourly.cloud_cover, index);
    const precipitationMm = numberAt(hourly.precipitation, index);
    const weatherCode = numberAt(hourly.weather_code, index);
    const mood = classifyWeatherMood({ temperatureC, windKmh, cloudCover, precipitationMm, weatherCode });

    return {
      mood,
      label: weatherLabel(mood, { temperatureC, windKmh, cloudCover, precipitationMm }),
      temperatureC,
      windKmh,
      cloudCover,
      precipitationMm,
      weatherCode,
      observedAt: hourly.time[index],
      source: "open-meteo"
    };
  } catch (error) {
    await logDiagnostic({
      level: "warn",
      area: "ride-story",
      message: "Ride story weather lookup failed",
      details: diagnosticDetails(error)
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function rankStoryPromptVariants(ride: Ride, weather?: RideWeatherMood | null) {
  const context = analyzeRidePromptContext(ride);
  const scored = STORY_PROMPT_VARIANTS.map((variant, index) => ({
    ...variant,
    score: scoreVariant(variant.id, context, weather) + (STORY_PROMPT_VARIANTS.length - index) / 100
  }));

  return scored.sort((left, right) => right.score - left.score);
}

export function recommendedStoryPromptVariant(ride: Ride, weather?: RideWeatherMood | null) {
  return rankStoryPromptVariants(ride, weather)[0]?.id || "cinematic";
}

export function buildRideStoryPrompt(
  ride: Ride,
  variantId: StoryPromptVariantId,
  weather?: RideWeatherMood | null,
  seed = 0
) {
  const variant = STORY_PROMPT_VARIANTS.find((item) => item.id === variantId) || STORY_PROMPT_VARIANTS[0];
  const context = analyzeRidePromptContext(ride);
  const angle = variant.angles[Math.abs(seed) % variant.angles.length];
  const routeLine = routePromptLine(ride);
  const insightLine = [ride.aiSummary, ride.keyInsight, ride.rideKindReason].map((value) => value?.trim()).find(Boolean);
  const weatherLine = weather
    ? `${weather.label} from Open-Meteo near ride start`
    : "Weather unavailable, infer only a general mood from time and place";

  return [
    "Create a vertical 9:16 Instagram Story image for a motorcycle ride.",
    "",
    "Use these ride facts exactly. Do not invent or change any distance, speed, date, time, location, or bike detail:",
    `Ride title: ${rideTitle(ride)}`,
    `Date and start time: ${shortDate(ride.startedAt)} at ${time(ride.startedAt)}`,
    `Route: ${routeLine}`,
    `Distance: ${km(ride.distanceM)}`,
    `Duration: ${duration(ride.durationS)}`,
    `Top speed: ${kmh(ride.topSpeedKmh)}`,
    `Average speed: ${kmh(ride.avgSpeedKmh)}`,
    insightLine ? `RidePulse insight: ${insightLine}` : null,
    "",
    "Mood cues:",
    `Time mood: ${context.timeMood}`,
    `Place mood: ${context.placeMood}`,
    `Ride mood: ${context.rideMood}`,
    `Weather mood: ${weatherLine}`,
    "",
    "Visual direction:",
    variant.visualDirection,
    angle,
    "",
    "Composition rules:",
    "Make it premium and shareable, like a polished motorcycle story poster.",
    "Keep the image vertical, phone-story friendly, and readable on a small screen.",
    "Use black, dark graphite, white, and electric-cyan RidePulse accents.",
    "Leave clean space for the ride stats, or include the stats using the exact text above.",
    "Do not use official motorcycle manufacturer logos. A generic unbranded motorcycle silhouette is okay.",
    "Do not add extra claims, fake sponsors, random rider names, license plates, or unsafe riding behavior."
  ].filter((line): line is string => line != null).join("\n");
}

function analyzeRidePromptContext(ride: Ride): RidePromptContext {
  const startedAt = new Date(ride.startedAt);
  const hour = Number.isNaN(startedAt.getTime()) ? 12 : startedAt.getHours();
  const distanceKm = ride.distanceM / 1000;
  const allLabels = `${cleanRouteLabel(ride.startLabel) || ""} ${cleanRouteLabel(ride.endLabel) || ""} ${ride.title || ""} ${ride.aiTitle || ""} ${ride.aiSummary || ""}`.toLowerCase();

  return {
    timeMood: timeMood(hour),
    placeMood: placeMood(allLabels),
    rideMood: rideMood(distanceKm, ride.durationS, ride.topSpeedKmh)
  };
}

function timeMood(hour: number): RidePromptContext["timeMood"] {
  if (hour >= 4 && hour < 7) {
    return "dawn";
  }
  if (hour >= 17 && hour < 19) {
    return "sunset";
  }
  if (hour >= 19 || hour < 4) {
    return "night";
  }
  return "day";
}

function placeMood(labels: string): RidePromptContext["placeMood"] {
  if (containsAny(labels, ["highway", "expressway", "ring road", "bypass", "nh ", "sh "])) {
    return "highway";
  }
  if (containsAny(labels, ["ghat", "hill", "hills", "mount", "mountain", "valley", "viewpoint"])) {
    return "hills";
  }
  if (containsAny(labels, ["lake", "reservoir", "dam", "river"])) {
    return "lake";
  }
  if (containsAny(labels, ["beach", "sea", "coast", "shore"])) {
    return "beach";
  }
  if (containsAny(labels, ["forest", "woods", "wildlife", "sanctuary"])) {
    return "forest";
  }
  if (containsAny(labels, ["cafe", "coffee", "home", "breakfast", "restaurant"])) {
    return "cafe";
  }
  if (containsAny(labels, ["city", "town", "metro", "road", "street", "layout", "nagar", "circle"])) {
    return "city";
  }
  return "unknown";
}

function rideMood(distanceKm: number, durationS: number, topSpeedKmh: number): RidePromptContext["rideMood"] {
  if (distanceKm >= 180 || durationS >= 4 * 60 * 60) {
    return "endurance ride";
  }
  if (distanceKm >= 75) {
    return "long ride";
  }
  if (topSpeedKmh >= 95) {
    return "fast run";
  }
  if (distanceKm <= 12 && durationS <= 45 * 60) {
    return "quick commute";
  }
  return "relaxed";
}

function scoreVariant(
  variantId: StoryPromptVariantId,
  context: RidePromptContext,
  weather?: RideWeatherMood | null
) {
  let score = variantId === "cinematic" ? 3 : 1;

  if (context.timeMood === "night" && variantId === "night-city") score += 7;
  if ((context.timeMood === "dawn" || context.timeMood === "sunset") && variantId === "sunrise-sunset") score += 7;
  if (context.placeMood === "highway" && variantId === "highway-run") score += 7;
  if (context.placeMood === "hills" && variantId === "mountain-ghat") score += 7;
  if (context.placeMood === "city" && variantId === "night-city") score += context.timeMood === "night" ? 3 : 2;
  if (context.rideMood === "fast run" && (variantId === "performance" || variantId === "highway-run")) score += 4;
  if ((context.rideMood === "long ride" || context.rideMood === "endurance ride") && variantId === "photo-real-travel") score += 4;
  if (context.rideMood === "relaxed" && variantId === "minimal-stat") score += 2;

  if (weather?.mood === "rainy" && variantId === "rainy-monsoon") score += 8;
  if (weather?.mood === "stormy" && variantId === "rainy-monsoon") score += 7;
  if (weather?.mood === "clear" && variantId === "sunrise-sunset") score += 2;
  if (weather?.mood === "cloudy" && variantId === "cinematic") score += 2;
  if (weather?.mood === "windy" && variantId === "highway-run") score += 2;
  if (weather?.mood === "hot" && variantId === "performance") score += 2;
  if (weather?.mood === "cool" && variantId === "photo-real-travel") score += 2;

  return score;
}

function classifyWeatherMood({
  temperatureC,
  windKmh,
  cloudCover,
  precipitationMm,
  weatherCode
}: {
  temperatureC?: number;
  windKmh?: number;
  cloudCover?: number;
  precipitationMm?: number;
  weatherCode?: number;
}): WeatherMood {
  if (weatherCode != null && weatherCode >= 95) {
    return "stormy";
  }
  if ((weatherCode != null && weatherCode >= 51 && weatherCode <= 86) || (precipitationMm || 0) > 0.3) {
    return "rainy";
  }
  if ((windKmh || 0) >= 35) {
    return "windy";
  }
  if ((temperatureC || 0) >= 32) {
    return "hot";
  }
  if (temperatureC != null && temperatureC <= 18) {
    return "cool";
  }
  if ((cloudCover || 0) >= 65 || (weatherCode != null && weatherCode >= 2 && weatherCode <= 48)) {
    return "cloudy";
  }
  if (weatherCode === 0 || (cloudCover != null && cloudCover < 35)) {
    return "clear";
  }
  return "unknown";
}

function weatherLabel(
  mood: WeatherMood,
  weather: {
    temperatureC?: number;
    windKmh?: number;
    cloudCover?: number;
    precipitationMm?: number;
  }
) {
  const details = [
    weather.temperatureC == null ? null : `${Math.round(weather.temperatureC)} C`,
    weather.windKmh == null ? null : `${Math.round(weather.windKmh)} km/h wind`,
    weather.precipitationMm == null || weather.precipitationMm <= 0 ? null : `${weather.precipitationMm.toFixed(1)} mm rain`,
    weather.cloudCover == null ? null : `${Math.round(weather.cloudCover)}% cloud`
  ].filter(Boolean);

  return `${mood}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function nearestWeatherIndex(times: string[], targetMs: number) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  times.forEach((value, index) => {
    const currentMs = Date.parse(`${value}Z`);
    const distance = Math.abs(currentMs - targetMs);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function numberAt(values: unknown, index: number) {
  if (!Array.isArray(values)) {
    return undefined;
  }
  const value = Number(values[index]);
  return Number.isFinite(value) ? value : undefined;
}

function containsAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function rideTitle(ride: Ride) {
  return ride.title?.trim() || ride.aiTitle?.trim() || ride.smartTitle?.trim() || `${shortDate(ride.startedAt)} ride`;
}

function routePromptLine(ride: Ride) {
  const start = cleanRouteLabel(ride.startLabel);
  const end = cleanRouteLabel(ride.endLabel);
  if (start && end) {
    return `${start} to ${end}`;
  }
  if (start || end) {
    return start || end;
  }
  return "Saved RidePulse route, exact GPS trace kept private";
}

function cleanRouteLabel(value?: string | null) {
  const label = String(value || "").replace(/\([^)]*\)/g, "").trim();
  const lower = label.toLowerCase();
  if (!label || lower.startsWith("auto start") || lower.startsWith("auto end") || /-?\d+\.\d{3,}/.test(label)) {
    return "";
  }
  return label.length > 72 ? label.slice(0, 72) : label;
}
