import React, { useState } from 'react';
import { ClipboardList, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProtocoloCriacaoPage from '@/pages/ProtocoloCriacaoPage';
import LevantamentoLocacao from '@/components/protocolo/LevantamentoLocacao';

type ProtocoloView = 'criar' | 'levantamento';

const ProtocoloPage: React.FC = () => {
  const [view, setView] = useState<ProtocoloView>('criar');

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="card-premium p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={view === 'criar' ? 'default' : 'outline'}
            onClick={() => setView('criar')}
            className="min-w-[190px]"
          >
            <FileCheck className="mr-2 h-4 w-4" />
            Criar Protocolo
          </Button>
          <Button
            type="button"
            variant={view === 'levantamento' ? 'default' : 'outline'}
            onClick={() => setView('levantamento')}
            className="min-w-[230px]"
          >
            <ClipboardList className="mr-2 h-4 w-4" />
            Levantamento de Locação
          </Button>
        </div>
      </section>

      {view === 'criar' ? <ProtocoloCriacaoPage /> : <LevantamentoLocacao />}
    </div>
  );
};

export default ProtocoloPage;
