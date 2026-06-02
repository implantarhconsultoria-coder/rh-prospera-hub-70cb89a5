import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Bot,
  Download,
  FileText,
  MessageSquare,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  answerCorporateQuestion,
  buildAitorReport,
  buildDetailedAnalysis,
  buildExecutiveSummary,
  buildSmartGreeting,
  linesToText,
  type CorporateSnapshot,
} from '@/lib/assistenteCorporativo';
import type { CalendarEvent, IntelligenceAlert, WeatherSnapshot } from '@/lib/inteligenciaOperacional';
import { cn } from '@/lib/utils';

type AssistantAction =
  | 'resumo'
  | 'detalhada'
  | 'relatorio'
  | 'criticas'
  | 'rh'
  | 'financeiro'
  | 'operacional'
  | 'frota'
  | 'fechamento'
  | 'chat';

type Props = {
  variant: 'admin' | 'director' | 'central';
  displayName: string;
  snapshot: CorporateSnapshot;
  alerts?: IntelligenceAlert[];
  calendarEvents?: CalendarEvent[];
  weather?: WeatherSnapshot[];
  compact?: boolean;
};

const actionLabel: Record<AssistantAction, string> = {
  resumo: 'Resumo Geral',
  detalhada: 'Analise Detalhada',
  relatorio: 'Preparar Relatorio para Sr. Aitor',
  criticas: 'Pendencias Criticas',
  rh: 'RH',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  frota: 'Frota',
  fechamento: 'Fechamento',
  chat: 'Converse com a Plataforma',
};

const buttonClass =
  'inline-flex items-center justify-center rounded-xl border border-cyan-400/25 px-3 py-2 text-xs font-semibold text-cyan-50 hover:bg-cyan-400/10';

const normalizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();

const downloadText = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const printLines = (title: string, lines: string[]) => {
  const win = window.open('', '_blank', 'width=980,height=720');
  if (!win) return;
  const htmlLines = lines.map((line) => `<p>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { font-size: 18px; margin: 0 0 14px; }
          p { font-size: 12px; line-height: 1.45; margin: 0 0 8px; }
          .box { border: 1px solid #111827; padding: 14px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="box">${htmlLines}</div>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
};

const CorporateAssistantPanel: React.FC<Props> = ({
  variant,
  displayName,
  snapshot,
  alerts = [],
  calendarEvents = [],
  weather = [],
  compact = false,
}) => {
  const [active, setActive] = useState<AssistantAction>(variant === 'director' ? 'resumo' : 'criticas');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const greeting = useMemo(
    () => buildSmartGreeting(displayName, snapshot, calendarEvents, weather),
    [displayName, snapshot, calendarEvents, weather],
  );

  const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical' || alert.severity === 'warning');
  const reportLines = useMemo(() => buildAitorReport(snapshot), [snapshot]);
  const summaryLines = useMemo(() => buildExecutiveSummary(snapshot), [snapshot]);
  const detailSections = useMemo(() => buildDetailedAnalysis(snapshot), [snapshot]);

  const title = variant === 'director'
    ? 'Assistente Executivo'
    : variant === 'admin'
      ? 'Assistente Master Operacional'
      : 'Converse com a Plataforma';

  const subtitle = variant === 'director'
    ? 'Leitura executiva para decisao, relatorio e acompanhamento.'
    : variant === 'admin'
      ? 'Leitura geral da operacao com foco em pendencias, RH, frota, documentos e fechamento.'
      : 'Pergunte sobre operacao, RH, frota, financeiro e documentos usando dados reais carregados.';

  const actions: AssistantAction[] = variant === 'director'
    ? ['resumo', 'detalhada', 'relatorio', 'chat']
    : variant === 'admin'
      ? ['resumo', 'criticas', 'rh', 'financeiro', 'operacional', 'frota', 'fechamento', 'chat']
      : ['resumo', 'detalhada', 'criticas', 'chat'];

  const handleAsk = () => {
    setActive('chat');
    setAnswer(answerCorporateQuestion(question, snapshot));
  };

  const renderContent = () => {
    if (active === 'chat') {
      return (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder="Ex.: O que precisa da minha atencao agora?"
              className="min-h-11 flex-1 rounded-xl border border-cyan-400/20 bg-slate-950/80 px-3 text-sm text-white outline-none focus:border-cyan-300"
            />
            <button type="button" onClick={handleAsk} className={buttonClass}>
              <Search className="mr-2 h-4 w-4" />
              Perguntar
            </button>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 text-sm text-sky-100/85">
            {answer || 'A resposta usara apenas os dados reais carregados na plataforma.'}
          </div>
        </div>
      );
    }

    if (active === 'detalhada') {
      return (
        <div className="grid gap-3 md:grid-cols-3">
          {detailSections.map((section) => (
            <div key={section.title} className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold text-white">{section.title}</h3>
              <div className="mt-3 space-y-2 text-xs text-sky-100/75">
                {section.lines.map((line) => <p key={line}>{line}</p>)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (active === 'relatorio') {
      const fileBase = normalizeFileName(`TOPAC - RELATORIO EXECUTIVO - ${snapshot.competencia}`);
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => printLines('Relatorio Executivo TOPAC', reportLines)}>
              <Printer className="mr-2 h-4 w-4" />
              PDF / Imprimir
            </button>
            <button type="button" className={buttonClass} onClick={() => downloadText(`${fileBase}.txt`, linesToText(reportLines))}>
              <Download className="mr-2 h-4 w-4" />
              Baixar texto
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => downloadText(`${fileBase}.csv`, reportLines.map((line) => `"${line.replace(/"/g, '""')}"`).join('\n'), 'text/csv;charset=utf-8')}
            >
              <FileText className="mr-2 h-4 w-4" />
              Excel (CSV)
            </button>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 text-sm text-sky-100/85 space-y-2">
            {reportLines.map((line) => <p key={line}>{line}</p>)}
          </div>
        </div>
      );
    }

    if (active === 'criticas') {
      return (
        <div className="grid gap-3 md:grid-cols-2">
          {criticalAlerts.length ? criticalAlerts.slice(0, 6).map((alert) => (
            <div key={alert.id} className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-100">{alert.title}</p>
              <p className="mt-1 text-xs text-amber-50/75">{alert.message}</p>
            </div>
          )) : (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Nenhuma pendencia critica identificada na leitura atual.
            </div>
          )}
        </div>
      );
    }

    if (active === 'rh') {
      return (
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['Ativos', snapshot.activeEmployees],
            ['ASO atencao', snapshot.asoAlertas],
            ['Ferias atencao', snapshot.feriasAlertas],
            ['Lancamentos pendentes', snapshot.lancamentosPendentes],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4">
              <p className="text-xs text-sky-100/60">{label}</p>
              <p className="mt-2 text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>
      );
    }

    if (active === 'financeiro') {
      return (
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 text-sm text-sky-100/85 space-y-2">
          {summaryLines.filter((line) => line.includes('Financeiro') || line.includes('faturamento')).map((line) => <p key={line}>{line}</p>)}
        </div>
      );
    }

    if (active === 'operacional') {
      return (
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 text-sm text-sky-100/85">
          {snapshot.solicitacoesPendentes} solicitacao(oes) operacional(is) pendente(s) e {snapshot.solicitacoesDiretor} aguardando diretor.
        </div>
      );
    }

    if (active === 'frota') {
      return (
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 text-sm text-sky-100/85">
          {snapshot.fleet?.veiculosAtivos ?? 0} veiculo(s) ativo(s), {snapshot.fleet?.abastecimentos ?? 0} abastecimento(s) no periodo e {snapshot.veiculosDocumentosVencendo} documento(s) proximos do vencimento.
        </div>
      );
    }

    if (active === 'fechamento') {
      return (
        <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-4 text-sm text-sky-100/85">
          Competencia {snapshot.competencia}: {snapshot.lancamentosPendentes} lancamento(s) em conferencia. Folha liquida estimada: {summaryLines.find((line) => line.includes('Folha liquida'))?.replace('Folha liquida estimada: ', '') || '-'}
        </div>
      );
    }

    return (
      <div className="grid gap-2">
        {summaryLines.map((line) => (
          <div key={line} className="rounded-xl border border-slate-700/70 bg-slate-950/70 px-4 py-3 text-sm text-sky-100/85">
            {line}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className={cn('rounded-2xl border border-cyan-400/25 bg-slate-950/70 p-5 shadow-sm', compact && 'p-4')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/15">
            {variant === 'director' ? <BarChart3 className="h-6 w-6 text-cyan-200" /> : <Bot className="h-6 w-6 text-cyan-200" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</p>
              {variant === 'director' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  Diretor Executivo
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-sky-100/70">{subtitle}</p>
          </div>
        </div>
        <Sparkles className="hidden h-6 w-6 text-cyan-300/60 lg:block" />
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {greeting.slice(0, compact ? 2 : 4).map((line) => (
          <div key={line} className="rounded-xl border border-slate-700/70 bg-slate-900/80 px-4 py-3 text-sm text-sky-100">
            {line}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => setActive(action)}
            className={cn(buttonClass, active === action && 'border-emerald-300/60 bg-emerald-500/15 text-emerald-50')}
          >
            {action === 'chat' ? <MessageSquare className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {actionLabel[action]}
          </button>
        ))}
      </div>

      <div className="mt-5">{renderContent()}</div>
    </section>
  );
};

export default CorporateAssistantPanel;
