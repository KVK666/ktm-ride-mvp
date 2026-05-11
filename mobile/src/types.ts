export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type RidePoint = Coordinate & {
  altitudeM?: number | null;
  speedKmh?: number | null;
  recordedAt: string;
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
  startedAt: string;
  endedAt?: string;
  points?: RidePoint[];
};

export type DashboardStats = {
  todayDistanceM: number;
  monthDistanceM: number;
  yearDistanceM: number;
  totalRides: number;
  bestTopSpeedKmh: number;
  averageSpeedKmh: number;
};
