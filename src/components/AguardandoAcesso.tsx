import React from 'react';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';

const AguardandoAcesso: React.FC = () => {
  const { logout, session } = useApp();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Aguardando Liberação</h1>
          <p className="text-muted-foreground mt-2">
            Seu cadastro foi realizado com sucesso. O administrador precisa liberar seu acesso à plataforma.
          </p>
        </div>
        <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
          <p>Conectado como: <span className="font-medium text-foreground">{session?.user?.email}</span></p>
        </div>
        <Button variant="outline" onClick={logout} className="gap-2">
          <LogOut className="w-4 h-4" />
          Sair
        </Button>
      </div>
    </div>
  );
};

export default AguardandoAcesso;
