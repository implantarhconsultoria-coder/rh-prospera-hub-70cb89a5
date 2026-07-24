import { ExternalLink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const APP_OPERACIONAL_URL = "https://746ce5953133175295.v2.appdeploy.ai/";

export default function AppMecanicoAdminPage() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 no-print">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold">App Operacional</h1>
            <p className="text-xs text-muted-foreground">O aplicativo permanece dentro da Central TOPAC para permitir a troca de módulo sem novo login.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={APP_OPERACIONAL_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir em nova aba
          </a>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-background" style={{ height: 'calc(100vh - 185px)' }}>
        <iframe
          src={APP_OPERACIONAL_URL}
          title="TOPAC Operacional"
          className="h-full w-full border-0"
          allow="camera; geolocation; microphone; clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
