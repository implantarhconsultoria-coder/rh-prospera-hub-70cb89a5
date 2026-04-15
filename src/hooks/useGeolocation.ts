import { useState, useCallback } from 'react';

interface GeoData {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

export const useGeolocation = () => {
  const [geo, setGeo] = useState<GeoData>({ latitude: null, longitude: null, loading: false, error: null });

  const getLocation = useCallback((): Promise<{ latitude: number | null; longitude: number | null }> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setGeo({ latitude: null, longitude: null, loading: false, error: 'Geolocalização não disponível' });
        resolve({ latitude: null, longitude: null });
        return;
      }
      setGeo(prev => ({ ...prev, loading: true, error: null }));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setGeo({ latitude, longitude, loading: false, error: null });
          resolve({ latitude, longitude });
        },
        (err) => {
          setGeo({ latitude: null, longitude: null, loading: false, error: err.message });
          resolve({ latitude: null, longitude: null });
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);

  return { ...geo, getLocation };
};
