import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import EpiDailyDeliveryPage from '@/pages/EpiDailyDeliveryPage';
import EPIManagementPage from '@/pages/EPIManagementPage';

const EPIPage: React.FC = () => {
  const [mode, setMode] = useState<'daily' | 'management'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('ficha') || params.has('solicitacao') ? 'management' : 'daily';
  });

  return (
    <div className="space-y-4">
      <div className="card-premium p-3 flex flex-wrap gap-2 no-print">
        <Button variant={mode === 'daily' ? 'default' : 'outline'} onClick={() => setMode('daily')}>
          Entrega diária de EPI
        </Button>
        <Button variant={mode === 'management' ? 'default' : 'outline'} onClick={() => setMode('management')}>
          Gestão semestral / fichas
        </Button>
      </div>

      {mode === 'daily' ? <EpiDailyDeliveryPage /> : <EPIManagementPage />}
    </div>
  );
};

export default EPIPage;
