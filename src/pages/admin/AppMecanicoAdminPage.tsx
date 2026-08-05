import { useState } from 'react';
import { ExternalLink, MapPinned, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MapaOperacionalMecanicos from '@/components/operacional/MapaOperacionalMecanicos';

const APP_OPERACIONAL_URL = 'https://746ce5953133175295.v2.appdeploy.ai/';

type ViewMode = 'mapa' | 'app';

export default function AppMecanicoAdminPage() {
  const [view, setView] = useState<ViewMode>('mapa');

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 no-print sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {view === 'mapa' ? <MapPinned className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
          </div>
          <div>
            <h1 className="font-semibold">Operação dos Mecânicos</h1>
            <p className="text-xs text-muted-foreground">Mapa em tempo real e acesso à gestão do TOPAC Field.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={view === 'mapa' ? 'default' : 'outline'} size="sm" onClick={() => setView('mapa')}>
            <MapPinned className="mr-2 h-4 w-4" /> Mapa Operacional
          </Button>
          <Button variant={view === 'app' ? 'default' : 'outline'} size="sm" onClick={() => setView('app')}>
            <Wrench className="mr-2 h-4 w-4" /> Gestão do App
          </Button>
          {view === 'app' && (
            <Button variant="outline" size="sm" asChild>
              <a href={APP_OPERACIONAL_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir em nova aba
              </a>
            </Button>
          )}
        </div>
      </div>

      {view === 'mapa' ? (
        <MapaOperacionalMecanicos />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-background" style={{ height: 'calc(100vh - 185px)' }}>
          <iframe
            src={APP_OPERACIONAL_URL}
            title="TOPAC Operacional"
            className="h-full w-full border-0"
            allow="camera; geolocation; microphone; clipboard-read; clipboard-write"
          />
        </div>
      )}
    </div>
  );
}
