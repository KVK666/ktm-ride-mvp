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
};

export type DashboardStats = {
  todayDistanceM: number;
  monthDistanceM: number;
  yearDistanceM: number;
  totalRides: number;
  unreviewedRides?: number;
  bestTopSpeedKmh: number;
  averageSpeedKmh: number;
};
