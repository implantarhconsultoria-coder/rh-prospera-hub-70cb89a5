import { formatTopacDate } from '@/lib/dateFormat';
import { getWorkingDaysBetween } from '@/lib/workingDays';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

export type AdmissionWelcomeInput = {
  preCadastroId: string;
  candidateName: string;
  companyName: string;
  dataAdmissao: string;
  jornada: string | null | undefined;
  vrAtivo: boolean;
  vrDiario: number | null | undefined;
  vtAtivo: boolean;
  vtDiario: number | null | undefined;
  feriados?: string[];
};

export type AdmissionWelcomeSummary = {
  preCadastroId: string;
  candidateName: string;
  firstName: string;
  companyName: string;
  dataInicio: string;
  dataInicioFormatada: string;
  periodoFim: string;
  periodoFimFormatado: string;
  competencia: string;
  jornada: string;
  diasUteis: number;
  vrAtivo: boolean;
  vrDias: number;
  vrValorDiario: number;
  vrTotal: number;
  vtAtivo: boolean;
  vtDias: number;
  vtValorDiario: number;
  vtTotal: number;
  totalBeneficios: number;
  message: string;
};

export type AdmissionWelcomeResult =
  | { ok: true; summary: AdmissionWelcomeSummary }
  | { ok: false; error: string };

const brl = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

const validDateOnly = (value: string) => {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return candidate.getUTCFullYear() === Number(year)
    && candidate.getUTCMonth() === Number(month) - 1
    && candidate.getUTCDate() === Number(day);
};

export const addCalendarDaysDateOnly = (value: string, days: number) => {
  if (!validDateOnly(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${candidate.getUTCFullYear()}-${String(candidate.getUTCMonth() + 1).padStart(2, '0')}-${String(candidate.getUTCDate()).padStart(2, '0')}`;
};

export const getSaoPauloDateOnly = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || '';
  const month = parts.find(part => part.type === 'month')?.value || '';
  const day = parts.find(part => part.type === 'day')?.value || '';
  return year && month && day ? `${year}-${month}-${day}` : '';
};

export const getNextAdmissionDateSaoPaulo = (approvalTimestamp: string | Date) => {
  const approvalDate = getSaoPauloDateOnly(approvalTimestamp);
  return approvalDate ? addCalendarDaysDateOnly(approvalDate, 1) : '';
};

export const isAdmissionWelcomeEligible = (aprovadoEm?: string | null, funcionarioId?: string | null) => Boolean(aprovadoEm && funcionarioId);

const lastDayOfMonth = (dateOnly: string) => {
  if (!validDateOnly(dateOnly)) return '';
  const [year, month] = dateOnly.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0, 12));
  return `${year}-${String(month).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
};

const firstValidName = (name: string) => name.trim().split(/\s+/).find(Boolean) || 'novo colaborador';

export const buildAdmissionWelcome = (input: AdmissionWelcomeInput): AdmissionWelcomeResult => {
  const dataInicio = String(input.dataAdmissao || '').trim();
  if (!validDateOnly(dataInicio)) return { ok: false, error: 'A data de admissão não está configurada corretamente.' };

  const jornada = String(input.jornada || '').trim();
  if (!jornada) return { ok: false, error: 'Informe a jornada antes de enviar as boas-vindas.' };

  const vrValorDiario = Number(input.vrDiario || 0);
  if (input.vrAtivo && !(vrValorDiario > 0)) {
    return { ok: false, error: 'O VR está ativo, mas o valor diário não está configurado.' };
  }

  const vtValorDiario = Number(input.vtDiario || 0);
  if (input.vtAtivo && !(vtValorDiario > 0)) {
    return { ok: false, error: 'O VT está ativo, mas o valor diário não está configurado.' };
  }

  const periodoFim = lastDayOfMonth(dataInicio);
  const diasUteis = getWorkingDaysBetween(dataInicio, periodoFim, input.feriados || []);
  const vrDias = input.vrAtivo ? diasUteis : 0;
  const vtDias = input.vtAtivo ? diasUteis : 0;
  const vrTotal = input.vrAtivo ? Math.round(vrDias * vrValorDiario * 100) / 100 : 0;
  const vtTotal = input.vtAtivo ? Math.round(vtDias * vtValorDiario * 100) / 100 : 0;
  const firstName = firstValidName(input.candidateName);
  const dataInicioFormatada = formatTopacDate(dataInicio);
  const periodoFimFormatado = formatTopacDate(periodoFim);

  const vrBlock = input.vrAtivo
    ? [
        `Valor diário: ${brl(vrValorDiario)}`,
        `Período considerado: ${dataInicioFormatada} a ${periodoFimFormatado}`,
        `Dias úteis: ${vrDias} dias úteis`,
        `Cálculo: ${vrDias} × ${brl(vrValorDiario)}`,
        `Total: ${brl(vrTotal)}`,
      ].join('\n')
    : 'Não aplicável ao cadastro atual.';

  const vtBlock = input.vtAtivo
    ? [
        `Valor diário: ${brl(vtValorDiario)}`,
        `Período considerado: ${dataInicioFormatada} a ${periodoFimFormatado}`,
        `Dias úteis: ${vtDias} dias úteis`,
        `Cálculo: ${vtDias} × ${brl(vtValorDiario)}`,
        `Total: ${brl(vtTotal)}`,
      ].join('\n')
    : 'Não solicitado no cadastro atual.';

  const message = [
    `Olá, ${firstName}! Seja bem-vindo(a) à ${input.companyName}. ✅`,
    '',
    'Seu processo admissional foi aprovado e sua entrada está confirmada.',
    '',
    '📅 INÍCIO',
    `Você inicia conosco em ${dataInicioFormatada}.`,
    '',
    '🕐 JORNADA',
    jornada,
    '',
    '🍽️ VALE-REFEIÇÃO (VR)',
    vrBlock,
    '',
    '🚌 VALE-TRANSPORTE (VT)',
    vtBlock,
    '',
    '💳 CRÉDITO DOS BENEFÍCIOS',
    'Os valores serão creditados na conta informada no seu cadastro no decorrer do dia.',
    '',
    'Em caso de dúvida, procure o RH.',
    '',
    'Seja bem-vindo(a) à equipe TOPAC!',
  ].join('\n');

  return {
    ok: true,
    summary: {
      preCadastroId: input.preCadastroId,
      candidateName: input.candidateName,
      firstName,
      companyName: input.companyName,
      dataInicio,
      dataInicioFormatada,
      periodoFim,
      periodoFimFormatado,
      competencia: dataInicio.slice(0, 7),
      jornada,
      diasUteis,
      vrAtivo: input.vrAtivo,
      vrDias,
      vrValorDiario: input.vrAtivo ? vrValorDiario : 0,
      vrTotal,
      vtAtivo: input.vtAtivo,
      vtDias,
      vtValorDiario: input.vtAtivo ? vtValorDiario : 0,
      vtTotal,
      totalBeneficios: Math.round((vrTotal + vtTotal) * 100) / 100,
      message,
    },
  };
};

export const admissionWelcomeEventData = (summary: AdmissionWelcomeSummary, userId?: string | null) => ({
  timestamp: new Date().toISOString(),
  user_id: userId || null,
  data_inicio: summary.dataInicio,
  competencia: summary.competencia,
  vr_dias: summary.vrDias,
  vr_valor_diario: summary.vrValorDiario,
  vr_total: summary.vrTotal,
  vt_dias: summary.vtDias,
  vt_valor_diario: summary.vtValorDiario,
  vt_total: summary.vtTotal,
});
