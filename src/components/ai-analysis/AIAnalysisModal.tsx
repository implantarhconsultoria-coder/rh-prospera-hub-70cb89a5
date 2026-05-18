import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { AIAnalysisModalPayload } from './analysis-modal-types';

const statusConfig = {
  success: {
    icon: CheckCircle2,
    badge: 'Sistema aprovado',
    ring: 'from-emerald-400/30 via-emerald-500/10 to-cyan-400/20',
    iconClass: 'text-emerald-300',
    badgeClass: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
  },
  warning: {
    icon: AlertTriangle,
    badge: 'Atenção necessária',
    ring: 'from-amber-400/30 via-orange-500/10 to-yellow-400/20',
    iconClass: 'text-amber-300',
    badgeClass: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
  },
  error: {
    icon: XCircle,
    badge: 'Correção crítica',
    ring: 'from-red-400/30 via-rose-500/10 to-orange-400/20',
    iconClass: 'text-red-300',
    badgeClass: 'border-red-400/30 bg-red-400/10 text-red-100',
  },
  info: {
    icon: Sparkles,
    badge: 'Análise inteligente',
    ring: 'from-cyan-400/30 via-blue-500/10 to-indigo-400/20',
    iconClass: 'text-cyan-300',
    badgeClass: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-100',
  },
  processing: {
    icon: Loader2,
    badge: 'Processando',
    ring: 'from-violet-400/30 via-blue-500/10 to-cyan-400/20',
    iconClass: 'text-violet-200 animate-spin',
    badgeClass: 'border-violet-400/30 bg-violet-400/10 text-violet-100',
  },
};

const defaultSuccessMessage = 'Seu app dos mecânicos está funcionando perfeitamente e já pode ser utilizado.';

const safeLog = (event: string, payload: AIAnalysisModalPayload) => {
  try {
    const current = JSON.parse(localStorage.getItem('ai_factory_analysis_logs') || '[]');
    current.unshift({
      event,
      status: payload.status,
      title: payload.title,
      createdAt: new Date().toISOString(),
      modules: payload.affectedModules || payload.issues?.map((issue) => issue.module) || [],
    });
    localStorage.setItem('ai_factory_analysis_logs', JSON.stringify(current.slice(0, 80)));
  } catch (error) {
    console.warn('AI Factory log local não registrado', error);
  }
};

const createFactoryTask = (payload: AIAnalysisModalPayload) => {
  const task = {
    id: payload.id || `factory-task-${Date.now()}`,
    title: payload.title || 'Correção automática AI Factory',
    status: 'Correção iniciada',
    createdAt: new Date().toISOString(),
    source: 'AIAnalysisModal',
    command: {
      objective: 'Corrigir pendências identificadas pela análise automática',
      issues: payload.issues || [],
      affectedModules: payload.affectedModules || payload.issues?.map((issue) => issue.module) || [],
      safety: 'Executar sem alterar rotas, permissões ou layouts aprovados fora dos módulos afetados.',
    },
  };

  const current = JSON.parse(localStorage.getItem('ai_factory_tasks') || '[]');
  current.unshift(task);
  localStorage.setItem('ai_factory_tasks', JSON.stringify(current.slice(0, 80)));
  return task;
};

export const AIAnalysisModal = ({ payload, onClose }: { payload: AIAnalysisModalPayload | null; onClose: () => void }) => {
  const status = payload?.status || 'info';
  const config = statusConfig[status];
  const Icon = config.icon;
  const hasIssues = Boolean(payload?.issues?.length);
  const isSuccess = status === 'success' && !hasIssues;

  const closeModal = () => {
    if (!payload) return;
    safeLog(isSuccess ? 'análise aprovada' : 'modal fechado', payload);
    payload.onClose?.();
    onClose();
  };

  const accept = () => {
    if (!payload) return;
    if (hasIssues) {
      createFactoryTask(payload);
      safeLog('correção iniciada', payload);
      payload.onAccept?.();
      window.dispatchEvent(new CustomEvent('ai-factory:correction-started', { detail: payload }));
    } else {
      safeLog('análise aprovada', payload);
      payload.onAccept?.();
    }
    onClose();
  };

  const decline = () => {
    if (!payload) return;
    safeLog('correção recusada pelo usuário', payload);
    payload.onDecline?.();
    onClose();
  };

  React.useEffect(() => {
    if (!payload) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !payload.critical) closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payload]);

  return (
    <AnimatePresence>
      {payload && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 text-white shadow-2xl"
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          >
            <div className={`absolute inset-x-0 top-0 h-40 bg-gradient-to-br ${config.ring} blur-2xl`} />
            <div className="relative p-5 sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg">
                    <Icon className={`h-8 w-8 ${config.iconClass}`} />
                  </div>
                  <div>
                    <div className={`mb-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${config.badgeClass}`}>
                      {config.badge}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                      {payload.title || 'Análise concluída'}
                    </h2>
                  </div>
                </div>

                {!payload.critical && (
                  <button
                    onClick={closeModal}
                    className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label="Fechar"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                )}
              </div>

              <p className="mb-5 text-sm leading-6 text-slate-200 sm:text-base">
                {payload.subtitle || payload.message || (isSuccess ? defaultSuccessMessage : 'Identificamos pontos que precisam de atenção antes da liberação completa do sistema.')}
              </p>

              {isSuccess && (
                <div className="mb-6 grid gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50 sm:grid-cols-3">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Estabilidade validada</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Módulos online</div>
                  <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Sem falhas críticas</div>
                </div>
              )}

              {hasIssues && (
                <div className="mb-6 max-h-[46vh] space-y-3 overflow-y-auto pr-1">
                  {payload.issues?.map((issue, index) => (
                    <div key={issue.id || `${issue.module}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold text-white">⚠ {issue.module}</h3>
                        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-slate-100">Risco: {issue.risk}</span>
                      </div>
                      <div className="grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                        <div><strong className="text-white">Problema:</strong><br />{issue.problem}</div>
                        <div><strong className="text-white">Impacto:</strong><br />{issue.impact}</div>
                        <div><strong className="text-white">Correção:</strong><br />{issue.correction}</div>
                        <div><strong className="text-white">Tempo estimado:</strong><br />{issue.estimatedTime || 'A definir pelo AI Factory'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {status === 'processing' && (
                <div className="mb-6 rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4 text-sm text-violet-50">
                  O AI Factory está processando a análise. Esta janela fica preparada para receber o resultado final automaticamente.
                </div>
              )}

              {payload.finishedAt || payload.responsibleUser || payload.affectedModules?.length ? (
                <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs text-slate-300">
                  {payload.affectedModules?.length ? <div>Módulos: {payload.affectedModules.join(', ')}</div> : null}
                  {payload.finishedAt ? <div>Horário: {payload.finishedAt}</div> : null}
                  {payload.responsibleUser ? <div>Responsável: {payload.responsibleUser}</div> : null}
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                {hasIssues && (
                  <button
                    onClick={decline}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    {payload.secondaryActionLabel || 'Recusar'}
                  </button>
                )}
                <button
                  onClick={accept}
                  className="rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:scale-[1.01]"
                >
                  {payload.primaryActionLabel || (hasIssues ? 'Bora corrigir' : 'OK, ENTENDI')}
                </button>
              </div>

              {hasIssues && (
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5" /> Ao aceitar, o comando técnico é criado e registrado no painel do AI Factory.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIAnalysisModal;
