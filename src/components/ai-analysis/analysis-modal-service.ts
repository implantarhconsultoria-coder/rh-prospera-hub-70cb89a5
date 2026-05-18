import { AIAnalysisModalPayload } from './analysis-modal-types';

export const openAIAnalysisModal = (payload: AIAnalysisModalPayload) => {
  window.dispatchEvent(
    new CustomEvent('ai-factory:analysis-modal', {
      detail: payload,
    })
  );
};

export const openSuccessAnalysis = (message: string) => {
  openAIAnalysisModal({
    status: 'success',
    title: 'Análise concluída',
    message,
    primaryActionLabel: 'OK, ENTENDI',
  });
};

export const openCorrectionAnalysis = (payload: AIAnalysisModalPayload) => {
  openAIAnalysisModal({
    title: 'Análise concluída',
    subtitle: 'Identificamos pontos que precisam de atenção antes da liberação completa do sistema.',
    primaryActionLabel: 'Bora corrigir',
    secondaryActionLabel: 'Recusar',
    critical: true,
    ...payload,
  });
};
