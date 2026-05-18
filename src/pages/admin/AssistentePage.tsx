import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AssistenteChat from '@/components/assistente/AssistenteChat';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, Sparkles, Bot } from 'lucide-react';
import { openCorrectionAnalysis, openSuccessAnalysis } from '@/components/ai-analysis/analysis-modal-service';

interface Conv { id: string; titulo: string; updated_at: string; }

const AssistentePage: React.FC = () => {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('assistente_conversas')
      .select('id, titulo, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);
    setConvs(data || []);
  };

  useEffect(() => { load(); }, []);

  const testarAnaliseComPendencia = () => {
    openCorrectionAnalysis({
      status: 'warning',
      title: 'Análise concluída',
      subtitle: 'Identificamos pontos que precisam de atenção antes da liberação completa do sistema.',
      affectedModules: ['App Mecânico', 'Abastecimento', 'Chamados'],
      issues: [
        {
          module: 'App Mecânico',
          problem: 'Fluxo precisa de validação final antes de liberar uso operacional.',
          impact: 'Mecânico pode usar uma tela ainda não confirmada pelo AI Factory.',
          risk: 'Médio',
          correction: 'Executar auditoria do fluxo mobile, validar botões principais e registrar status final.',
          estimatedTime: '10 minutos',
        },
        {
          module: 'Abastecimento',
          problem: 'QR Code precisa confirmar vínculo entre veículo, mecânico e registro.',
          impact: 'Pode gerar abastecimento sem rastreabilidade completa.',
          risk: 'Alto',
          correction: 'Revalidar token, rota e gravação do registro antes da confirmação.',
          estimatedTime: '15 minutos',
        },
      ],
    });
  };

  const testarAnaliseAprovada = () => {
    openSuccessAnalysis('Seu app dos mecânicos está funcionando perfeitamente e já pode ser utilizado.');
  };

  return (
    <div className="h-[calc(100vh-64px)] flex bg-background">
      <aside className="hidden md:flex flex-col w-72 border-r">
        <div className="p-3 border-b space-y-2">
          <Button onClick={() => setActive(null)} className="w-full" variant="outline">
            <Plus className="h-4 w-4 mr-2" /> Nova conversa
          </Button>
          <Button onClick={testarAnaliseComPendencia} className="w-full bg-slate-950 text-white hover:bg-slate-800">
            <Bot className="h-4 w-4 mr-2" /> Testar análise
          </Button>
          <Button onClick={testarAnaliseAprovada} className="w-full" variant="secondary">
            <Sparkles className="h-4 w-4 mr-2" /> Testar aprovado
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && (
            <div className="text-xs text-muted-foreground p-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Sem conversas ainda
            </div>
          )}
          {convs.map(c => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2 ${active === c.id ? 'bg-muted' : ''}`}
            >
              <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.titulo}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="md:hidden flex gap-2 p-3 border-b overflow-x-auto">
          <Button onClick={testarAnaliseComPendencia} size="sm" className="bg-slate-950 text-white hover:bg-slate-800 shrink-0">
            <Bot className="h-4 w-4 mr-2" /> Testar análise
          </Button>
          <Button onClick={testarAnaliseAprovada} size="sm" variant="secondary" className="shrink-0">
            <Sparkles className="h-4 w-4 mr-2" /> Testar aprovado
          </Button>
        </div>
        <AssistenteChat
          className="h-full"
          conversaId={active}
          onConversaCreated={(id) => { setActive(id); load(); }}
        />
      </main>
    </div>
  );
};

export default AssistentePage;
