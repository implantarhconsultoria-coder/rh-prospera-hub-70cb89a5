export interface LocationPoint {
  latitude: number;
  longitude: number;
}

export interface LocationDecisionInput {
  current: LocationPoint;
  previous: LocationPoint | null;
  lastSentAt: number | null;
  now?: number;
  minDistanceMeters?: number;
  maxIntervalMs?: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (value: number) => (value * Math.PI) / 180;

export const distanceMeters = (from: LocationPoint, to: LocationPoint) => {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const shouldSendLocation = ({
  current,
  previous,
  lastSentAt,
  now = Date.now(),
  minDistanceMeters = 500,
  maxIntervalMs = 4 * 60 * 1000,
}: LocationDecisionInput) => {
  if (!previous || !lastSentAt) return true;
  if (now - lastSentAt >= maxIntervalMs) return true;
  return distanceMeters(previous, current) >= minDistanceMeters;
};
