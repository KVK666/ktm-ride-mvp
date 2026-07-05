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
