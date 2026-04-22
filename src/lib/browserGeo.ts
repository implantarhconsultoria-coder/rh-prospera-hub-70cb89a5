/**
 * Browser geolocation hook (one-shot).
 * Returns latitude/longitude or nulls if permission denied.
 */
export const getBrowserLocation = (): Promise<{ latitude: number | null; longitude: number | null }> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ latitude: null, longitude: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({ latitude: null, longitude: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
};
