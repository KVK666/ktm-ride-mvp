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
  pendingReviewSuggestions?: { rideId: string; title: string; prompt: string }[];
  memorySeeds?: { id: string; type: string; rideId?: string; title: string; subtitle: string }[];
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
};

export type RideAlbumPhoto = Coordinate & {
  id: string;
  rideId?: string;
  fileName?: string | null;
  mimeType: string;
  imageBase64: string;
  createdAt: string;
  importedAt: string;
  hasLocation: boolean;
};

export type DirectionStep = {
  instruction: string;
  distanceText: string;
  durationText: string;
  start: Coordinate;
  end: Coordinate;
};

export type RouteDetails = {
  coordinates: Coordinate[];
  steps: DirectionStep[];
  distanceText: string;
  durationText: string;
  distanceM: number;
  durationS: number;
};

export type AnalyticsPoint = {
  bucket: string;
  distanceM: number;
  rideCount: number;
  durationS: number;
  topSpeedKmh: number;
  avgSpeedKmh?: number;
};

export type ReportResponse = {
  period: string;
  generatedAt: string;
  summary: {
    rideCount: number;
    distanceM: number;
    durationS: number;
    averageSpeedKmh: number;
    topSpeedKmh: number;
  };
  routes: {
    from: string;
    to: string;
    distanceM: number;
    durationS: number;
    topSpeedKmh: number;
    startedAt: string;
  }[];
};
