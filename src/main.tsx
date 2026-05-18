import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import AIAnalysisModal from "@/components/ai-analysis/AIAnalysisModal";
import { AIAnalysisModalPayload } from "@/components/ai-analysis/analysis-modal-types";

window.addEventListener('error', (e) => {
  fetch('https://hook.implantarh.dev/erros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Project': 'w75ugcr5afmn' },
    body: JSON.stringify({ message: e.message, stack: e.error?.stack, url: location.pathname }),
  });
});

const GlobalAIAnalysisBridge = () => {
  const [payload, setPayload] = React.useState<AIAnalysisModalPayload | null>(null);

  React.useEffect(() => {
    const handler = (event: CustomEvent<AIAnalysisModalPayload>) => {
      setPayload(event.detail);
    };

    window.addEventListener('ai-factory:analysis-modal', handler as EventListener);

    return () => {
      window.removeEventListener('ai-factory:analysis-modal', handler as EventListener);
    };
  }, []);

  return <AIAnalysisModal payload={payload} onClose={() => setPayload(null)} />;
};

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <>
      <App />
      <GlobalAIAnalysisBridge />
    </>
  </ErrorBoundary>
);
