export type AIAnalysisStatus = "success" | "warning" | "error" | "info" | "processing";

export type AIAnalysisIssue = {
  id?: string;
  module: string;
  problem: string;
  impact: string;
  risk: "Baixo" | "Médio" | "Alto" | "Crítico" | string;
  correction: string;
  estimatedTime?: string;
};

export type AIAnalysisModalPayload = {
  id?: string;
  status: AIAnalysisStatus;
  title?: string;
  subtitle?: string;
  message?: string;
  issues?: AIAnalysisIssue[];
  affectedModules?: string[];
  finishedAt?: string;
  responsibleUser?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  critical?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onClose?: () => void;
};

export type AIAnalysisModalEventDetail = AIAnalysisModalPayload;

declare global {
  interface WindowEventMap {
    "ai-factory:analysis-modal": CustomEvent<AIAnalysisModalEventDetail>;
  }
}
