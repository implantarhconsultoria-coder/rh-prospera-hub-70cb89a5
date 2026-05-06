import React from 'react';
import { Card } from '@/components/ui/card';
import { Wrench } from 'lucide-react';

const AppMecanicoEmReconstrucaoPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Wrench className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold font-display">App Mecânico em reconstrução</h1>
        <p className="text-sm text-muted-foreground">
          O App Mecânico está temporariamente desativado para reconstrução.
          Aguarde liberação do administrador.
        </p>
      </Card>
    </div>
  );
};

export default AppMecanicoEmReconstrucaoPage;
