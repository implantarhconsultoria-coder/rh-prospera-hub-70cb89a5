import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const getMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || '');
  return 'Erro inesperado no carregamento da plataforma.';
};

const GlobalErrorCatcher: React.FC = () => {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('[GlobalError]', event.error || event.message);
      setMessage(getMessage(event.error || event.message));
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[UnhandledRejection]', event.reason);
      setMessage(getMessage(event.reason));
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  const details = useMemo(() => message.slice(0, 260), [message]);
  if (!message) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[9999] mx-auto max-w-xl rounded-xl border border-destructive/30 bg-background p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">A plataforma recuperou um erro de carregamento.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A aplicacao continuou aberta. Tente recarregar a tela ou volte ao inicio.
          </p>
          {details && <p className="mt-2 break-all rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">{details}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.location.reload()} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Recarregar
            </Button>
            <Button size="sm" variant="outline" onClick={() => { window.location.href = '/'; }} className="gap-2">
              <Home className="h-4 w-4" /> Inicio
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMessage('')}>Ocultar</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalErrorCatcher;
