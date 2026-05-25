import React, { useEffect, useState } from 'react';
import { AlertTriangle, Home, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StableLoadingProps {
  label?: string;
  timeoutMs?: number;
}

const StableLoading: React.FC<StableLoadingProps> = ({ label = 'Carregando...', timeoutMs = 12000 }) => {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  if (!timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold">A tela demorou para carregar.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A conexao com a sessao ou banco ficou lenta. Voce pode tentar novamente sem perder os dados.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = '/'; }} className="gap-2">
            <Home className="h-4 w-4" /> Voltar ao inicio
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StableLoading;
