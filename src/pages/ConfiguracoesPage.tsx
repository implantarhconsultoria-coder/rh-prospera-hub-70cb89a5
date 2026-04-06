import React from 'react';
import { useApp } from '@/context/AppContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Settings } from 'lucide-react';
import { toast } from 'sonner';

const ConfiguracoesPage: React.FC = () => {
  const { config, setConfig } = useApp();

  const update = (field: string, value: any) => setConfig(prev => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold font-display text-foreground">Configurações</h1>
      </div>

      <div className="card-premium p-6 space-y-5">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Nome da Plataforma</label>
          <Input value={config.platformName} onChange={e => update('platformName', e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Percentual Padrão do Adiantamento (%)</label>
          <Input type="number" value={config.pctAdiantamento} onChange={e => update('pctAdiantamento', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Valor Padrão Insalubridade (R$)</label>
          <Input type="number" step="0.01" value={config.valorInsalubridade} onChange={e => update('valorInsalubridade', Number(e.target.value))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Mensagem Institucional</label>
          <textarea value={config.mensagemInstitucional} onChange={e => update('mensagemInstitucional', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[80px]" />
        </div>

        <div className="pt-2 border-t">
          <h3 className="text-sm font-semibold font-display text-foreground mb-2">Branding</h3>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="w-16 h-16 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-bold text-accent-foreground font-display">T</span>
            </div>
            <p className="text-sm font-semibold text-foreground">{config.platformName}</p>
            <p className="text-xs text-muted-foreground">{config.mensagemInstitucional}</p>
          </div>
        </div>

        <Button onClick={() => toast.success('Configurações salvas!')} className="gradient-primary text-primary-foreground">
          <Save className="w-4 h-4 mr-2" /> Salvar Configurações
        </Button>
      </div>
    </div>
  );
};

export default ConfiguracoesPage;
