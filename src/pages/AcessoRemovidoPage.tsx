import React from 'react';
import { ShieldOff } from 'lucide-react';

const AcessoRemovidoPage: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl border border-border bg-card shadow-premium">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
        <ShieldOff className="w-7 h-7 text-destructive" />
      </div>
      <h1 className="text-xl font-bold font-display text-foreground">Acesso removido</h1>
      <p className="text-sm text-muted-foreground">
        Acesso removido pelo administrador.
      </p>
      <a
        href="/admin"
        className="inline-block text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition"
      >
        Ir para /admin
      </a>
    </div>
  </div>
);

export default AcessoRemovidoPage;
