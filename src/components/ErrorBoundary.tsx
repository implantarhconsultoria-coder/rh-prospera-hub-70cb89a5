import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary global — evita tela branca quando algum componente lança erro
 * durante o render (comum após salvar/atualizar e a UI tentar acessar dado nulo).
 *
 * Mostra mensagem clara e oferece "Tentar de novo" / "Ir para o início".
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  goHome = () => {
    this.reset();
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl shadow-lg p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Algo deu errado nesta tela</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A operação foi concluída no servidor, mas a tela não conseguiu renderizar.
              Seus dados estão seguros.
            </p>
            {this.state.error?.message && (
              <p className="text-[11px] text-muted-foreground/70 mt-2 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={this.reset}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <RefreshCw className="w-4 h-4" /> Tentar de novo
            </button>
            <button
              onClick={this.goHome}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-muted text-foreground hover:bg-muted/80"
            >
              <Home className="w-4 h-4" /> Ir para o início
            </button>
          </div>
        </div>
      </div>
    );
  }
}
