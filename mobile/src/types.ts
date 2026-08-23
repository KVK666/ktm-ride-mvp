export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RidePoint = Coordinate & {
  altitudeM?: number | null;
  accuracyM?: number | null;
  speedKmh?: number | null;
  recordedAt: string;
};

/**
 * A normalized, local-only representation of a Google Timeline vehicle
 * segment. The importer deliberately keeps only route data needed to create
 * a Ride; the original export is never sent to the API or stored in the
 * JavaScript bundle.
 */
export type GoogleTimelineCandidate = {
  id: string;
  source: "google_timeline";
  activityType: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  startLabel: string;
  endLabel: string;
  distanceM: number;
  durationS: number;
  points: RidePoint[];
  sourceSegmentIds: string[];
  selected?: boolean;
};

export type GoogleTimelineGroup = {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  candidates: GoogleTimelineCandidate[];
  selected: boolean;
  albumEnabled: boolean;
};

export type GoogleTimelineBackup = {
  version: 1;
  importId: string;
  sourceHash: string;
  createdAt: string;
  sourceFileSizeBytes?: number;
  rawJsonUri?: string | null;
  candidates: GoogleTimelineCandidate[];
  groups: GoogleTimelineGroup[];
};

export type GoogleTimelineUploadState = {
  importId: string;
  sourceHash: string;
  phase: "ready" | "checking" | "uploading" | "complete" | "failed";
  checked: boolean;
  uploadedCandidateIds: string[];
  skippedCandidateIds: string[];
  rideIdsByCandidateId: Record<string, string>;
  tripIdsByGroupId: Record<string, string>;
  failedCandidateId?: string | null;
  error?: string | null;
  updatedAt: string;
};

export type RidePhoto = Coordinate & {
  id: string;
  uri: string;
  createdAt: string;
  hasLocation: boolean;
};

export type RideAlbumPhoto = RidePhoto & {
  originalUri?: string | null;
  fileName?: string | null;
  backendPhotoId?: string | null;
  importedAt: string;
  syncState?: "local" | "syncing" | "synced" | "failed";
};

export type RideAlbum = {
  rideId: string;
  title?: string | null;
  coverUri?: string | null;
  photos: RideAlbumPhoto[];
  updatedAt: string;
};

export type RideMemory = {
  id: string;
  type: "album" | "route" | "recap" | "review";
  title: string;
  subtitle: string;
  rideId?: string;
  coverUri?: string | null;
  ride?: Ride | null;
  photoCount?: number;
};

export type OnboardingSlide = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  bikeModel: string;
  hasProfilePhoto?: boolean;
  profilePhotoUpdatedAt?: string | null;
};

export type Ride = {
  id: string;
  source?: "ridepulse" | "google_timeline" | string;
  sourceActivityType?: string | null;
  speedDataQuality?: "recorded" | "estimated" | "unavailable" | string | null;
  startLabel: string;
  endLabel: string;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  distanceM: number;
  durationS: number;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  title?: string | null;
  notes?: string | null;
  reviewedAt?: string | null;
  startedAt: string;
  endedAt?: string;
  createdAt?: string;
  points?: RidePoint[];
  routePreview?: Coordinate[];
  badges?: string[];
  smartTitle?: string;
  summaryText?: string;
  highlightReason?: string;
  memoryReason?: string;
  timeOfDayLabel?: string;
  reviewPrompt?: string | null;
  albumHint?: string;
  aiTitle?: string | null;
  aiSummary?: string | null;
  rideKind?: string | null;
  rideKindConfidence?: number | null;
  rideKindReason?: string | null;
  keyInsight?: string | null;
  bestMoment?: string | null;
  tripSuggestion?: TripSuggestion | string | null;
  aiStatus?: "pending" | "ready" | "fallback" | "failed" | string | null;
  aiGeneratedAt?: string | null;
  destinationName?: string | null;
  destinationCategory?: string | null;
  destinationAddress?: string | null;
  aiContextVersion?: number | null;
  cleanupCandidate?: boolean;
  cleanupReason?: string | null;
};

export type TripSuggestion = {
  action: "none" | "suggest" | "auto_add" | "auto_create" | "auto_added" | "auto_created" | string;
  confidence?: number | null;
  title?: string | null;
  reason?: string | null;
  tripId?: string | null;
};

export type Trip = {
  id: string;
  title: string;
  description?: string | null;
  coverRideId?: string | null;
  rideCount: number;
  distanceM: number;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TripDetail = {
  trip: Trip;
  rides: Ride[];
};

export type SavedPlace = {
  id: string;
  label: string;
  kind: "home" | "office" | "other" | string;
  latitude: number;
  longitude: number;
  radiusM: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardStats = {
  todayDistanceM: number;
  monthDistanceM: number;
  yearDistanceM: number;
  totalRides: number;
  unreviewedRides?: number;
  bestTopSpeedKmh: number;
  averageSpeedKmh: number;
  previousMonthDistanceM?: number;
  longestRideDistanceM?: number;
};

export type RiderPulseInsights = {
  generatedAt: string;
  ridesLast30Days: number;
  distanceLast30DaysM: number;
  distancePrevious30DaysM: number;
  distanceCurrentMonthM: number;
  distanceTrendPercent: number | null;
  activeDaysLast30Days: number;
  currentRideDayStreak: number;
  longestRideM: number;
  averageRideDistanceM: number;
  averageRideDurationS: number;
  averageTopSpeedKmh: number;
  favoriteWeekday: string | null;
  favoriteTimeOfDay: string | null;
  reviewCompletionPercent: number;
  cleanupCandidateCount: number;
  projectedMonthDistanceM: number;
};

export type RideChapter = {
  id: string;
  title: string;
  body: string;
  timestamp?: string | null;
  coordinate?: Coordinate | null;
};

export type RideIntelligence = {
  suggestedTitle: string;
  summaryText: string;
  badges: string[];
  highlightReason?: string;
  fastestSegment?: {
    speedKmh: number;
    distanceM: number;
    durationS: number;
    startedAt?: string | null;
    endedAt?: string | null;
    coordinate?: Coordinate | null;
  } | null;
  midpoint?: Coordinate | null;
  comparisons?: {
    distanceVsLongestM?: number | null;
    monthSharePercent?: number | null;
  };
  chapters: RideChapter[];
  classification?: {
    rideKind?: string | null;
    label?: string | null;
    confidence?: number | null;
    reason?: string | null;
    status?: string | null;
  };
  keyInsight?: string | null;
  bestMoment?: string | null;
  tripAutomation?: TripSuggestion | null;
  cleanupCandidate?: boolean;
  cleanupReason?: string | null;
};

export type JournalHighlight = {
  id: string;
  type: string;
  title: string;
  body: string;
  rideId?: string;
  icon?: string;
};

export type JournalResponse = {
  generatedAt: string;
  generatedFor?: string;
  stats: DashboardStats;
  latestRide?: Ride | null;
  monthlyRecap: {
    distanceM: number;
    previousMonthDistanceM: number;
    distanceDeltaPercent?: number | null;
    rideCount: number;
    bestRide?: Ride | null;
  };
  highlights: JournalHighlight[];
  recentRides: Ride[];
  unreviewedCount: number;
  pendingReviewSuggestions?: {
    rideId: string;
    title: string;
    prompt: string;
  }[];
  memorySeeds?: {
    id: string;
    type: string;
    rideId?: string;
    title: string;
    subtitle: string;
  }[];
};
