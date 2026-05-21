import React from 'react';
import { LockKeyhole } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DIRECTOR_BLOCKED_MESSAGE } from '@/lib/directorPermissions';

const DirectorBlocked: React.FC = () => (
  <div className="max-w-3xl mx-auto py-16">
    <Card className="p-8 text-center space-y-4 border-amber-500/40 bg-amber-500/5">
      <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center">
        <LockKeyhole className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-xl font-bold font-display">Acesso de edicao bloqueado</h1>
        <p className="text-sm text-muted-foreground mt-2">{DIRECTOR_BLOCKED_MESSAGE}</p>
      </div>
    </Card>
  </div>
);

export default DirectorBlocked;
