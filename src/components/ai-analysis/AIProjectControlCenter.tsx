import React from 'react';
import { Activity, AlertTriangle, Bot, CheckCircle2, ExternalLink, FolderKanban, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openCorrectionAnalysis, openSuccessAnalysis } from './analysis-modal-service';

type ProjectStatus = 'ok' | 'attention' | 'broken' | 'not_connected';

type FactoryProject = {
  id: string;
  name: string;
  type: string;
  repository?: string;
  lovableUrl?: string;
  status: ProjectStatus;
  whatIsOk: string[];
  whatIsMissing: string[];
  risks: string[];
  nextActions: string[];
};

const PROJECTS: FactoryProject[] = [
  {
    id: 'topac-rh-pro',
    name: 'TOPAC RH PRO / Multiempresa',
    type: 'Sistema principal operacional',
    repository: 'implantarhconsultoria-coder/rh-prospera-hub-70cb89a5',
    lovableUrl: 'https://lovable.dev/projects/adb443b7-325b-4908-b7e8-cdff11602e98',
    status: 'attention',
    whatIsOk: ['Repositório identificado', 'Rotas principais existem', 'App Mecânico possui rota dedicada', 'AI Analysis Modal instalado no código'],
    whatIsMissing: ['Lovable precisa puxar/publicar a versão mais recente do Git', 'Análise automática ainda precisa gravar diagnóstico real no banco', 'Monitoramento precisa ler erros reais e tarefas reais do sistema'],
    risks: ['Alteração no Git não aparece para Rodrigo enquanto o Lovable não rebuildar', 'Sem vínculo de projeto, a IA pode responder sem saber qual módulo analisar'],
    nextActions: ['Criar tabela/registro de projetos monitorados', 'Conectar análise ao histórico de erros/logs', 'Exibir diagnóstico por módulo antes de corrigir'],
  },
  {
    id: 'ai-factory',
    name: 'AI Factory / Doctor PRO',
    type: 'Central de análise, correção e execução',
    repository: 'implantarhconsultoria-coder/synth-forge-grid',
    status: 'attention',
    whatIsOk: ['Worker já foi estruturado em conversas anteriores', 'Fila de execução existe no conceito', 'Logs locais do modal já são registrados'],
    whatIsMissing: ['Unificar ai_mission_tasks com ai_execution_queue', 'Conectar projetos reais por projectRoot/repositório', 'Criar tela de diagnóstico analítico real por projeto'],
    risks: ['Se a fila e a tela usam tabelas diferentes, parece que nada roda', 'Sem projeto real conectado, o worker só mexe nele mesmo'],
    nextActions: ['Cadastrar todos os projetos no painel', 'Criar botão Analisar por projeto', 'Gerar tarefa técnica somente após aceite'],
  },
  {
    id: 'nexus-lead-ia',
    name: 'NEXUS LEAD IA — Implanta Sales Engine',
    type: 'Prospecção e vendas',
    status: 'not_connected',
    whatIsOk: ['Escopo definido: prospecção, mensagens e WhatsApp', 'Versão inicial deve ser leve e estável'],
    whatIsMissing: ['Repositório/projeto Lovable não vinculado nesta central', 'Sem logs ou deploy conectado ao AI Factory'],
    risks: ['Não dá para afirmar se está pronto sem link/repo conectado'],
    nextActions: ['Vincular repositório ou URL do Lovable', 'Rodar análise estrutural', 'Mapear telas e dados locais'],
  },
  {
    id: 'app-mecanico',
    name: 'App dos Mecânicos',
    type: 'Portal mobile operacional',
    repository: 'implantarhconsultoria-coder/rh-prospera-hub-70cb89a5',
    status: 'attention',
    whatIsOk: ['Rotas /acesso-mecanico e /app-mecanico/:acessoId existem', 'Páginas Home, Ponto, Chamados, Veículo, Histórico e Abastecimento existem no App.tsx'],
    whatIsMissing: ['Validar fluxo real de login PIN', 'Validar gravação de ponto, chamados e abastecimento', 'Confirmar deploy no Lovable'],
    risks: ['Pode estar pronto no código e invisível no publicado se o Lovable não atualizou', 'Sem teste real, não deve liberar 100% para operação'],
    nextActions: ['Abrir análise do App Mecânico', 'Checar rotas e botões principais', 'Registrar conclusão como aprovado ou pendente'],
  },
  {
    id: 'implantarh-docs',
    name: 'Padronização de Documentos ImplantaRH',
    type: 'Documentos, PDFs e recibos',
    status: 'not_connected',
    whatIsOk: ['Modelos e regras estão definidos no projeto', 'Padrões de EPI, VR, VT, férias e protocolos existem como memória operacional'],
    whatIsMissing: ['Automação não está conectada como módulo único nesta central', 'Falta painel para gerar e acompanhar documentos por empresa'],
    risks: ['Sem centralização, documentos podem sair fora do padrão'],
    nextActions: ['Criar módulo de documentos no AI Factory', 'Cadastrar modelos mestres', 'Adicionar botão gerar/analisar documento'],
  },
];

const statusLabel: Record<ProjectStatus, string> = {
  ok: 'OK',
  attention: 'Atenção',
  broken: 'Quebrado',
  not_connected: 'Não conectado',
};

const statusClass: Record<ProjectStatus, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
  attention: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
  broken: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
  not_connected: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
};

const buildAnalysisMarkdown = (project: FactoryProject) => {
  return `### ${project.name}\n\n**Status:** ${statusLabel[project.status]}\n\n**O que está certo:**\n${project.whatIsOk.map((item) => `- ${item}`).join('\n')}\n\n**O que falta:**\n${project.whatIsMissing.map((item) => `- ${item}`).join('\n')}\n\n**Riscos:**\n${project.risks.map((item) => `- ${item}`).join('\n')}\n\n**Próximas ações:**\n${project.nextActions.map((item) => `- ${item}`).join('\n')}`;
};

const analyzeProject = (project: FactoryProject) => {
  if (project.status === 'ok') {
    openSuccessAnalysis(`${project.name} está aprovado para uso conforme a análise atual.`);
    return;
  }

  openCorrectionAnalysis({
    status: project.status === 'broken' ? 'error' : 'warning',
    title: `Análise concluída — ${project.name}`,
    subtitle: 'Diagnóstico analítico do AI Factory com pontos certos, pendências, riscos e próxima ação recomendada.',
    affectedModules: [project.name],
    issues: [
      {
        module: project.name,
        problem: project.whatIsMissing.join(' | '),
        impact: project.risks.join(' | '),
        risk: project.status === 'broken' ? 'Crítico' : project.status === 'not_connected' ? 'Médio' : 'Alto',
        correction: project.nextActions.join(' | '),
        estimatedTime: project.status === 'not_connected' ? 'Depende de vínculo do projeto' : 'Análise técnica necessária',
      },
    ],
  });
};

const analyzeAll = () => {
  openCorrectionAnalysis({
    status: 'warning',
    title: 'Análise geral concluída',
    subtitle: 'Projetos encontrados na central. Alguns estão prontos no conceito/código, mas ainda faltam vínculos, deploy ou monitoramento real.',
    affectedModules: PROJECTS.map((p) => p.name),
    issues: PROJECTS.filter((p) => p.status !== 'ok').map((project) => ({
      module: project.name,
      problem: project.whatIsMissing.join(' | '),
      impact: project.risks.join(' | '),
      risk: project.status === 'broken' ? 'Crítico' : project.status === 'not_connected' ? 'Médio' : 'Alto',
      correction: project.nextActions.join(' | '),
      estimatedTime: project.status === 'not_connected' ? 'Depende de vínculo' : 'Precisa análise técnica',
    })),
  });
};

export const AIProjectControlCenter: React.FC = () => {
  const [expanded, setExpanded] = React.useState<string | null>('topac-rh-pro');

  return (
    <section className="border-b bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-cyan-200">
              <Bot className="h-4 w-4" /> AI Factory Control Center
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">Projetos monitorados</h1>
            <p className="mt-1 text-sm text-slate-300">Aqui aparecem todos os projetos conhecidos e o diagnóstico do que está certo, errado, pronto ou faltando.</p>
          </div>
          <Button onClick={analyzeAll} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">
            <Activity className="mr-2 h-4 w-4" /> Analisar tudo
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {PROJECTS.map((project) => {
            const isOpen = expanded === project.id;
            return (
              <div key={project.id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => setExpanded(isOpen ? null : project.id)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-cyan-300" />
                      <h2 className="truncate font-semibold">{project.name}</h2>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{project.type}</p>
                  </button>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[project.status]}`}>
                    {statusLabel[project.status]}
                  </span>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 text-sm text-slate-200">
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-semibold text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Certo</div>
                      <ul className="list-disc space-y-1 pl-5">{project.whatIsOk.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-semibold text-amber-300"><AlertTriangle className="h-4 w-4" /> Falta</div>
                      <ul className="list-disc space-y-1 pl-5">{project.whatIsMissing.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-semibold text-red-300"><ShieldAlert className="h-4 w-4" /> Risco</div>
                      <ul className="list-disc space-y-1 pl-5">{project.risks.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => analyzeProject(project)} className="bg-white text-slate-950 hover:bg-slate-100">
                        Analisar este projeto
                      </Button>
                      {project.lovableUrl && (
                        <Button size="sm" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => window.open(project.lovableUrl, '_blank')}>
                          <ExternalLink className="mr-2 h-4 w-4" /> Lovable
                        </Button>
                      )}
                    </div>
                    <details className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-300">Ver relatório textual</summary>
                      <pre className="mt-3 whitespace-pre-wrap text-xs text-slate-300">{buildAnalysisMarkdown(project)}</pre>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AIProjectControlCenter;
