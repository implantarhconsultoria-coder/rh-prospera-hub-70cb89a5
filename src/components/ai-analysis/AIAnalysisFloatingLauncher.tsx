import React from 'react';
import { Bot, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openCorrectionAnalysis, openSuccessAnalysis } from './analysis-modal-service';

const AIAnalysisFloatingLauncher: React.FC = () => {
  const openPendingModal = () => {
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

  const openApprovedModal = () => {
    openSuccessAnalysis('Seu app dos mecânicos está funcionando perfeitamente e já pode ser utilizado.');
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex flex-col items-end gap-2">
      <div className="rounded-2xl border border-slate-200/20 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold text-white">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> AI Factory
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={openPendingModal} size="sm" className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
            <Bot className="mr-2 h-4 w-4" /> Abrir análise
          </Button>
          <Button onClick={openApprovedModal} size="sm" variant="secondary">
            <CheckCircle2 className="mr-2 h-4 w-4" /> App aprovado
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIAnalysisFloatingLauncher;
