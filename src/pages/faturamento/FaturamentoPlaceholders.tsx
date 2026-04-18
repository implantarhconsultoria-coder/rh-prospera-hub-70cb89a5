import React from 'react';
import { Wallet } from 'lucide-react';

const FaturamentoPlaceholder: React.FC<{ titulo: string }> = ({ titulo }) => (
  <div className="space-y-4 animate-fade-in">
    <h1 className="text-2xl font-bold font-display flex items-center gap-2">
      <Wallet className="w-6 h-6 text-primary" /> {titulo}
    </h1>
    <div className="card-premium p-8 text-center">
      <p className="text-muted-foreground">Em construção — será entregue no Bloco B (próxima mensagem).</p>
    </div>
  </div>
);

export const FaturasPage = () => <FaturamentoPlaceholder titulo="Faturas / Cobranças" />;
export const MedicoesPage = () => <FaturamentoPlaceholder titulo="Medições / Apurações" />;
export const ReajustesPage = () => <FaturamentoPlaceholder titulo="Reajustes" />;
export const PendenciasPage = () => <FaturamentoPlaceholder titulo="Pendências" />;
