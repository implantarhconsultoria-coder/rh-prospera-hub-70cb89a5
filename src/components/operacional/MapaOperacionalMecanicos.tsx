import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock3, LocateFixed, MapPin, RefreshCw, Signal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface MechanicLocationRow {
  acesso_id: string;
  funcionario_id: string | null;
  nome: string;
  empresa: string | null;
  filial: string | null;
  latitude: number;
  longitude: number;
  precisao_metros: number | null;
  velocidade_mps: number | null;
  direcao_graus: number | null;
  em_movimento: boolean;
  origem: string;
  ultimo_sinal_timestamp: string;
  atualizado_em: string;
}

declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_CSS_ID = 'topac-leaflet-css';
const LEAFLET_SCRIPT_ID = 'topac-leaflet-script';
const LEAFLET_VERSION = '1.9.4';

const loadLeaflet = async () => {
  if (window.L) return window.L;

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_ID;
    link.rel = 'stylesheet';
    link.href = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
    document.head.appendChild(link);
  }

  const existing = document.getElementById(LEAFLET_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.L) return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar o mapa.')), { once: true });
    });
    return window.L;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = LEAFLET_SCRIPT_ID;
    script.src = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar o mapa.'));
    document.body.appendChild(script);
  });

  return window.L;
};

const ageMinutes = (timestamp: string, now: number) => Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 60_000));

const relativeSignal = (timestamp: string, now: number) => {
  const minutes = ageMinutes(timestamp, now);
  if (minutes < 1) return 'Atualizado agora';
  if (minutes === 1) return 'Atualizado há 1 min';
  if (minutes < 60) return `Atualizado há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'Atualizado há 1 h';
  if (hours < 24) return `Atualizado há ${hours} h`;
  return `Último sinal em ${new Date(timestamp).toLocaleDateString('pt-BR')}`;
};

const signalColor = (timestamp: string, now: number) => {
  const minutes = ageMinutes(timestamp, now);
  if (minutes <= 10) return '#10b981';
  if (minutes <= 30) return '#f59e0b';
  return '#64748b';
};

const locationClient = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      order: (column: string, options: { ascending: boolean }) => Promise<{
        data: MechanicLocationRow[] | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export default function MapaOperacionalMecanicos() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const fittedRef = useRef(false);
  const [locations, setLocations] = useState<MechanicLocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadLocations = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setError('');

    const { data, error: queryError } = await locationClient
      .from('app_mecanico_localizacao_atual')
      .select('acesso_id,funcionario_id,nome,empresa,filial,latitude,longitude,precisao_metros,velocidade_mps,direcao_graus,em_movimento,origem,ultimo_sinal_timestamp,atualizado_em')
      .order('ultimo_sinal_timestamp', { ascending: false });

    if (queryError) {
      setError(queryError.message || 'Não foi possível carregar as localizações.');
    } else {
      setLocations(data || []);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadLocations();
    const fallback = window.setInterval(() => void loadLocations(), 30_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);

    const channel = supabase
      .channel('topac-mapa-operacional-mecanicos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_mecanico_localizacao_atual' }, () => {
        void loadLocations();
      })
      .subscribe();

    return () => {
      window.clearInterval(fallback);
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [loadLocations]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !L || !mapContainerRef.current || mapRef.current) return;

        leafletRef.current = L;
        const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: true })
          .setView([-15.77972, -47.92972], 4);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);

        mapRef.current = map;
      } catch (loadError) {
        console.error('[mapa-operacional] falha ao carregar Leaflet', loadError);
        if (!cancelled) setMapError('O mapa não pôde ser carregado. A lista de sinais continua disponível.');
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const activeIds = new Set(locations.map((location) => location.acesso_id));
    markersRef.current.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    const bounds: [number, number][] = [];

    locations.forEach((location) => {
      const latitude = Number(location.latitude);
      const longitude = Number(location.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      bounds.push([latitude, longitude]);
      const color = signalColor(location.ultimo_sinal_timestamp, now);
      const popup = `
        <div style="min-width:190px;font-family:Arial,sans-serif">
          <strong style="font-size:14px">${location.nome}</strong><br/>
          <span>${location.filial || location.empresa || 'TOPAC'}</span><br/>
          <span>${relativeSignal(location.ultimo_sinal_timestamp, now)}</span><br/>
          <span>${location.em_movimento ? 'Em deslocamento' : 'Sem movimento detectado'}</span>
        </div>
      `;

      const existing = markersRef.current.get(location.acesso_id);
      if (existing) {
        existing.setLatLng([latitude, longitude]);
        existing.setStyle({ color, fillColor: color });
        existing.setPopupContent(popup);
        return;
      }

      const marker = L.circleMarker([latitude, longitude], {
        radius: 10,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 3,
      })
        .addTo(map)
        .bindTooltip(location.nome, { direction: 'top', offset: [0, -8] })
        .bindPopup(popup);

      markersRef.current.set(location.acesso_id, marker);
    });

    if (!fittedRef.current && bounds.length) {
      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      fittedRef.current = true;
    }
  }, [locations, now]);

  const activeCount = useMemo(
    () => locations.filter((location) => ageMinutes(location.ultimo_sinal_timestamp, now) <= 10).length,
    [locations, now],
  );

  const delayedCount = locations.length - activeCount;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-4 w-4" /> Mecânicos no mapa</div>
          <div className="mt-2 text-2xl font-bold">{locations.length}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Signal className="h-4 w-4 text-emerald-500" /> Sinal recente</div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{activeCount}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4 text-amber-500" /> Atrasado ou offline</div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{delayedCount}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><LocateFixed className="h-5 w-5 text-primary" /> Mapa Operacional</h2>
          <p className="text-xs text-muted-foreground">Atualização automática por Realtime, com consulta de segurança a cada 30 segundos.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadLocations(true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar agora
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border bg-muted/20">
          <div ref={mapContainerRef} className="h-[62vh] min-h-[460px] w-full" />
          {mapError && <div className="border-t p-3 text-sm text-amber-700">{mapError}</div>}
        </div>

        <div className="max-h-[62vh] min-h-[460px] space-y-2 overflow-y-auto rounded-xl border bg-card p-3">
          {loading && <div className="p-6 text-center text-sm text-muted-foreground">Carregando sinais...</div>}
          {!loading && locations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum mecânico enviou localização ainda. O primeiro pin aparecerá após a autorização no TOPAC Field.
            </div>
          )}
          {locations.map((location) => {
            const minutes = ageMinutes(location.ultimo_sinal_timestamp, now);
            const fresh = minutes <= 10;
            return (
              <button
                key={location.acesso_id}
                type="button"
                onClick={() => mapRef.current?.setView([Number(location.latitude), Number(location.longitude)], 16)}
                className="w-full rounded-xl border p-3 text-left transition hover:bg-muted/60"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${fresh ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-500'}`}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{location.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{location.filial || location.empresa || 'TOPAC'}</div>
                    <div className={`mt-1 text-xs ${fresh ? 'text-emerald-600' : minutes <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
                      {relativeSignal(location.ultimo_sinal_timestamp, now)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {location.em_movimento ? 'Em deslocamento' : 'Parado'}
                      {location.precisao_metros ? ` • precisão ${Math.round(location.precisao_metros)} m` : ''}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
