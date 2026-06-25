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

export type User = {
  id: string;
  email: string;
  name: string;
  bikeModel: string;
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
};
