import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, FileX, Printer, Loader2, Mail, AlertTriangle, Calculator, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  calcularRescisao,
  tipoRescisaoLabel,
  type TipoRescisao,
  type AvisoPrevio,
  type FeriasRegistroInput,
  type FeriasPeriodoOverrideInput,
  type ManualOverrideInput,
  type RescisaoDescontoInput,
  type RescisaoDescontoTipo,
  type RescisaoResultado,
} from '@/lib/rescisaoCalc';
import { gerarRescisaoPdf, type RescisaoPdfData } from '@/lib/rescisaoPdf';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { DESTINATARIOS_CONTABILIDADE, CC_OBRIGATORIO } from '@/lib/emailUtils';
import { registrarDocumento, uploadDocumentoArquivo, marcarComoEnviado } from '@/lib/documentoHistorico';
import EmployeeCombobox from '@/components/EmployeeCombobox';
import { DecimalInput, MoneyInput } from '@/components/ui/number-format-input';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';

const discountLabels: Record<RescisaoDescontoTipo, string> = {
  faltas: 'Faltas',
  adiantamento_salarial: 'Adiantamento salarial',
  adiantamento_13: 'Adiantamento de 13º',
  vale_transporte: 'Vale-transporte',
  vale_refeicao: 'Vale-refeição',
  emprestimos: 'Empréstimos',
  pensao: 'Pensão',
  danos_autorizados: 'Danos/descontos autorizados',
  aviso_previo_descontado: 'Aviso-prévio descontado',
  outros: 'Outros descontos',
};

const isMissingColumn = (error: any, column: string) => {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return text.includes(column.toLowerCase()) && (text.includes('column') || text.includes('schema cache'));
};

const nowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const legacyResultFromRow = (row: any): RescisaoResultado => {
  if (row?.snapshot_json?.periodosFerias && row?.snapshot_json?.auditoria) return row.snapshot_json as RescisaoResultado;
  const salario = Number(row.salario_base) || 0;
  const feriasVencidas = Number(row.ferias_vencidas) || 0;
  const feriasProporcionais = Number(row.ferias_proporcionais) || 0;
  const terco = Number(row.terco_ferias) || 0;
  const decimo = Number(row.decimo_terceiro) || 0;
  return {
    dataProjetadaContrato: row.data_projecao_aviso || row.data_desligamento || '',
    diasAviso: Number(row.dias_aviso) || 0,
    divisorSaldoSalario: Number(row.divisor_saldo_salario) || 30,
    diasSaldoSalario: Number(row.dias_saldo_salario) || 0,
    saldoSalario: Number(row.saldo_salario) || 0,
    avisoPrevioValor: Number(row.aviso_previo_valor) || 0,
    avisoPrevioDesconto: Number(row.aviso_previo_desconto) || 0,
    periodosFerias: [],
    feriasVencidas,
    feriasEmAberto: Number(row.ferias_em_aberto) || 0,
    feriasProporcionais,
    feriasEmDobroAdicional: Number(row.ferias_em_dobro_adicional) || 0,
    tercoFeriasVencidas: Number(row.terco_ferias_vencidas) || 0,
    tercoFeriasEmAberto: Number(row.snapshot_json?.tercoFeriasEmAberto) || Math.max(0, terco - (Number(row.terco_ferias_vencidas) || 0) - (Number(row.terco_ferias_proporcionais) || 0)),
    tercoFeriasProporcionais: Number(row.terco_ferias_proporcionais) || 0,
    tercoFerias: terco,
    totalFerias: feriasVencidas + feriasProporcionais + terco,
    decimoTerceiroAvos: Number(row.decimo_terceiro_avos) || 0,
    decimoTerceiroBruto: Number(row.decimo_terceiro_bruto) || decimo,
    decimoTerceiroAdiantado: Number(row.decimo_terceiro_adiantado) || 0,
    decimoTerceiro: decimo,
    mediaHorasExtras: Number(row.snapshot_json?.mediaHorasExtras) || 0,
    mediaComissao: Number(row.snapshot_json?.mediaComissao) || 0,
    adicionaisMedia: Number(row.snapshot_json?.adicionaisMedia) || 0,
    baseRemuneracao: Number(row.remuneracao_base) || Number(row.snapshot_json?.baseRemuneracao) || salario,
    inss: Number(row.inss) || 0,
    irrf: Number(row.irrf) || 0,
    fgtsMes: Number(row.fgts_mes) || 0,
    saldoFgtsConsiderado: Number(row.saldo_fgts_depositado) || 0,
    multaFgts: Number(row.multa_fgts) || 0,
    descontosDetalhados: Array.isArray(row.descontos_json) ? row.descontos_json : [],
    outrosDescontos: Number(row.outros_descontos) || 0,
    totalProventos: Number(row.total_proventos) || 0,
    totalDescontos: Number(row.total_descontos) || 0,
    liquido: Number(row.liquido) || 0,
    alteracoesManuais: Array.isArray(row.alteracoes_manuais_json) ? row.alteracoes_manuais_json : [],
    revisaoFeriasNecessaria: Boolean(row.revisao_ferias_necessaria),
    detalhe: row.snapshot_json?.detalhe || {},
    auditoria: {
      calculadoEm: row.calculado_em || row.created_at || new Date().toISOString(),
      usuario: row.usuario_nome || 'Registro legado',
      salarioBaseUtilizado: salario,
      remuneracaoBaseUtilizada: Number(row.remuneracao_base) || salario,
      dataDesligamento: row.data_desligamento || '',
      tipoRescisao: row.tipo_rescisao || 'sem_justa_causa',
      periodoIdsConsiderados: [],
      avosFeriasProporcionais: 0,
      avosDecimoTerceiro: Number(row.decimo_terceiro_avos) || 0,
    },
  };
};

type OverrideField = 'saldoSalario' | 'avisoPrevioValor' | 'decimoTerceiroBruto';
type OverrideState = Record<OverrideField, { enabled: boolean; value: number; reason: string }>;

const emptyOverrideState = (): OverrideState => ({
  saldoSalario: { enabled: false, value: 0, reason: '' },
  avisoPrevioValor: { enabled: false, value: 0, reason: '' },
  decimoTerceiroBruto: { enabled: false, value: 0, reason: '' },
});

const RescisaoPage: React.FC = () => {
  const { session, employees, companies, entries, refreshData } = useApp();
  const [open, setOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feriasLoading, setFeriasLoading] = useState(false);
  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);

  const [empId, setEmpId] = useState('');
  const [dataDesligamento, setDataDesligamento] = useState(new Date().toISOString().slice(0, 10));
  const [tipo, setTipo] = useState<TipoRescisao>('sem_justa_causa');
  const [aviso, setAviso] = useState<AvisoPrevio>('indenizado');
  const [saldoFgts, setSaldoFgts] = useState(0);
  const [fgtsMotivo, setFgtsMotivo] = useState('Saldo informado pelo operador para a memória de cálculo.');
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [feriasRegistros, setFeriasRegistros] = useState<FeriasRegistroInput[]>([]);
  const [descontos, setDescontos] = useState<RescisaoDescontoInput[]>([]);
  const [manualFields, setManualFields] = useState<OverrideState>(emptyOverrideState);
  const [feriasManualEnabled, setFeriasManualEnabled] = useState<Record<string, boolean>>({});
  const [feriasManualValues, setFeriasManualValues] = useState<Record<string, { diasUtilizados: number; diasAbono: number; quitado: boolean; motivo: string }>>({});

  const fetchList = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('rescisoes').select('*').order('created_at', { ascending: false });
    if (error) {
      const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
      if (!text.includes('rescisoes') || (!text.includes('does not exist') && !text.includes('schema cache'))) {
        toast.error('Erro ao carregar rescisões: ' + error.message);
      }
      setList([]);
    } else setList(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchList(); }, []);

  const emp = employees.find((employee) => employee.id === empId);
  const empresa = emp ? companies.find((company) => company.id === emp.companyId) : null;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!empId) {
        setFeriasRegistros([]);
        return;
      }
      setFeriasLoading(true);
      const columns = 'id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim, periodo_gozo_inicio, periodo_gozo_fim, dias_ferias, dias_abono, status, status_pagamento';
      let result = await supabase.from('ferias_avisos').select(columns).eq('funcionario_id', empId).order('periodo_gozo_inicio', { ascending: true });
      if (result.error && isMissingColumn(result.error, 'dias_abono')) {
        result = await supabase.from('ferias_avisos')
          .select('id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim, periodo_gozo_inicio, periodo_gozo_fim, dias_ferias, status, status_pagamento')
          .eq('funcionario_id', empId)
          .order('periodo_gozo_inicio', { ascending: true });
      }
      if (!active) return;
      if (result.error) {
        console.error('Erro ao carregar férias para rescisão:', result.error);
        toast.error('Não foi possível carregar o histórico de férias deste funcionário.');
        setFeriasRegistros([]);
      } else {
        setFeriasRegistros((result.data || []).map((row: any) => ({
          id: row.id,
          periodoAquisitivoInicio: row.periodo_aquisitivo_inicio,
          periodoAquisitivoFim: row.periodo_aquisitivo_fim,
          periodoGozoInicio: row.periodo_gozo_inicio,
          periodoGozoFim: row.periodo_gozo_fim,
          diasFerias: Number(row.dias_ferias) || 0,
          diasAbono: Number(row.dias_abono) || 0,
          status: row.status,
          statusPagamento: row.status_pagamento,
        })));
      }
      setFeriasLoading(false);
    };
    load();
    return () => { active = false; };
  }, [empId]);

  const mediasRescisao = useMemo(() => {
    if (!emp || !empresa) return { mediaHorasExtras: 0, mediaComissao: 0, adicionaisMedia: 0, meses: 0 };
    const competenciaLimite = dataDesligamento.slice(0, 7);
    const historico = entries
      .filter((entry) => entry.employeeId === emp.id && entry.competencia <= competenciaLimite)
      .sort((a, b) => b.competencia.localeCompare(a.competencia))
      .slice(0, 12);
    if (!historico.length) return { mediaHorasExtras: 0, mediaComissao: 0, adicionaisMedia: 0, meses: 0 };

    const comissaoPct = getComissaoPercentual(empresa);
    const totais = historico.reduce((acc, entry) => {
      const diasUteis = getWorkingDays(entry.competencia);
      const [year, month] = entry.competencia.split('-').map(Number);
      const domingosFeriados = new Date(year, month, 0).getDate() - diasUteis;
      const payroll = calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct });
      acc.horasExtras += payroll.he50Val + payroll.he100Val + payroll.dsrHE;
      acc.comissao += payroll.comissaoVal + payroll.dsrComissao;
      acc.adicionais += Number(entry.adicionais) || 0;
      return acc;
    }, { horasExtras: 0, comissao: 0, adicionais: 0 });

    return {
      mediaHorasExtras: Math.round((totais.horasExtras / historico.length) * 100) / 100,
      mediaComissao: Math.round((totais.comissao / historico.length) * 100) / 100,
      adicionaisMedia: Math.round((totais.adicionais / historico.length) * 100) / 100,
      meses: historico.length,
    };
  }, [emp, empresa, entries, dataDesligamento]);

  useEffect(() => {
    let active = true;

    const loadAutomaticDiscounts = async () => {
      if (!emp) {
        setDescontos([]);
        return;
      }

      const competenciaFolha = dataDesligamento.slice(0, 7);
      const [year, month] = competenciaFolha.split('-').map(Number);
      const nextDate = new Date(year, month, 1);
      const competenciaBeneficioSeguinte = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = entries.find((item) => item.employeeId === emp.id && item.competencia === competenciaFolha);
      const automaticos: RescisaoDescontoInput[] = [];

      const faltasDias = Number(entry?.faltasDias) || 0;
      if (faltasDias > 0) automaticos.push({
        id: 'auto-faltas', tipo: 'faltas', descricao: `Faltas (${faltasDias} dia(s))`,
        valor: Math.round(((Number(emp.salarioBase) || 0) / 30) * faltasDias * 100) / 100,
        observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });
      if ((Number(entry?.adiantamento) || 0) > 0) automaticos.push({
        id: 'auto-adiantamento', tipo: 'adiantamento_salarial', descricao: 'Adiantamento salarial',
        valor: Number(entry?.adiantamento) || 0, observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });
      if ((Number(entry?.descontosDiversos) || 0) > 0) automaticos.push({
        id: 'auto-outros', tipo: 'outros', descricao: 'Descontos diversos do fechamento',
        valor: Number(entry?.descontosDiversos) || 0, observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });

      let benefitFound = { vr: false, vt: false };
      try {
        const { data: generationRows, error: generationError } = await (supabase as any)
          .from('benefit_generations')
          .select('tipo,competencia,report_snapshot,generated_at,updated_at,data_pagamento')
          .eq('company_id', emp.companyId)
          .in('tipo', ['vr', 'vt'])
          .in('competencia', [competenciaBeneficioSeguinte, competenciaFolha])
          .order('competencia', { ascending: false })
          .order('updated_at', { ascending: false });
        if (generationError) throw generationError;

        const rows = generationRows || [];
        const findGeneratedBenefit = (kind: 'vr' | 'vt') => {
          for (const generation of rows) {
            if (generation.tipo !== kind) continue;
            const snapshot = Array.isArray(generation.report_snapshot) ? generation.report_snapshot : [];
            const employeeRow = snapshot.find((item: any) => item?.employee_id === emp.id);
            const value = Number(employeeRow?.valor_total) || 0;
            if (employeeRow && value > 0) return { generation, employeeRow, value };
          }
          return null;
        };

        const vr = findGeneratedBenefit('vr');
        const vt = findGeneratedBenefit('vt');

        if (vr) {
          benefitFound.vr = true;
          automaticos.push({
            id: 'auto-vr-beneficio',
            tipo: 'vale_refeicao',
            descricao: `Vale-refeição — benefício ${vr.generation.competencia}`,
            valor: Math.round(vr.value * 100) / 100,
            observacao: `Importado automaticamente do VR já gerado/fechado para ${vr.generation.competencia}${vr.generation.data_pagamento ? ` (pagamento ${vr.generation.data_pagamento})` : ''}.`,
            automatico: true,
          });
        }
        if (vt) {
          benefitFound.vt = true;
          automaticos.push({
            id: 'auto-vt-beneficio',
            tipo: 'vale_transporte',
            descricao: `Vale-transporte — benefício ${vt.generation.competencia}`,
            valor: Math.round(vt.value * 100) / 100,
            observacao: `Importado automaticamente do VT já gerado/fechado para ${vt.generation.competencia}${vt.generation.data_pagamento ? ` (pagamento ${vt.generation.data_pagamento})` : ''}.`,
            automatico: true,
          });
        }
      } catch (error: any) {
        console.warn('[rescisao-beneficios-automaticos]', error?.message || error);
      }

      // Compatibilidade: se ainda não existir um fechamento/geração real de VT,
      // mantém o desconto legado da folha. Quando existe VT gerado, não duplica.
      if (!benefitFound.vt && (Number(entry?.vtDesconto) || 0) > 0) automaticos.push({
        id: 'auto-vt', tipo: 'vale_transporte', descricao: 'Vale-transporte',
        valor: Number(entry?.vtDesconto) || 0, observacao: `Importado do fechamento de ${competenciaFolha}.`, automatico: true,
      });

      if (active) setDescontos(automaticos);
    };

    void loadAutomaticDiscounts();
    return () => { active = false; };
  }, [empId, dataDesligamento, entries, emp?.companyId]);

  const feriasOverrides = useMemo<FeriasPeriodoOverrideInput[]>(() => Object.entries(feriasManualEnabled)
    .filter(([, enabled]) => enabled)
    .map(([periodoInicio]) => {
      const value = feriasManualValues[periodoInicio] || { diasUtilizados: 0, diasAbono: 0, quitado: false, motivo: '' };
      return {
        periodoInicio,
        quitadoManualmente: value.quitado,
        diasUtilizadosManual: value.diasUtilizados,
        diasAbonoManual: value.diasAbono,
        motivo: value.motivo,
        alteradoPor: session?.user?.email || '',
        alteradoEm: new Date().toISOString(),
      };
    }), [feriasManualEnabled, feriasManualValues, session?.user?.email]);

  const baseCalcInput = useMemo(() => {
    if (!emp) return null;
    return {
      salarioBase: emp.salarioBase,
      dependentes: 0,
      dataAdmissao: emp.dataAdmissao || dataDesligamento,
      dataDesligamento,
      tipo,
      aviso,
      saldoFgtsDepositado: saldoFgts,
      fgtsSaldoEditadoManual: saldoFgts > 0,
      fgtsSaldoMotivo: fgtsMotivo,
      mediaHorasExtras: mediasRescisao.mediaHorasExtras,
      mediaComissao: mediasRescisao.mediaComissao,
      adicionaisMedia: mediasRescisao.adicionaisMedia,
      feriasRegistros,
      faltasMensais: entries.filter((entry) => entry.employeeId === emp.id).map((entry) => ({ competencia: entry.competencia, faltasDias: Number(entry.faltasDias) || 0 })),
      descontos,
      feriasOverrides,
      usuarioCalculo: session?.user?.email || '',
      calculadoEm: new Date().toISOString(),
    };
  }, [emp, dataDesligamento, tipo, aviso, saldoFgts, fgtsMotivo, mediasRescisao, feriasRegistros, entries, descontos, feriasOverrides, session?.user?.email]);

  const automaticResult = useMemo(() => baseCalcInput ? calcularRescisao({ ...baseCalcInput, overrides: [] }) : null, [baseCalcInput]);

  const manualOverrides = useMemo<ManualOverrideInput[]>(() => {
    if (!automaticResult) return [];
    const automaticValues: Record<OverrideField, number> = {
      saldoSalario: automaticResult.saldoSalario,
      avisoPrevioValor: automaticResult.avisoPrevioValor,
      decimoTerceiroBruto: automaticResult.decimoTerceiroBruto,
    };
    return (Object.keys(manualFields) as OverrideField[])
      .filter((field) => manualFields[field].enabled)
      .map((field) => ({
        campo: field,
        valorAutomatico: automaticValues[field],
        valorManual: manualFields[field].value,
        motivo: manualFields[field].reason,
        alteradoPor: session?.user?.email || '',
        alteradoEm: new Date().toISOString(),
      }));
  }, [automaticResult, manualFields, session?.user?.email]);

  const resultado = useMemo(() => baseCalcInput ? calcularRescisao({ ...baseCalcInput, overrides: manualOverrides }) : null, [baseCalcInput, manualOverrides]);

  const proportionalPeriod = resultado?.periodosFerias.find((period) => period.situacao === 'Férias proporcionais');
  const overdueDays = resultado?.periodosFerias
    .filter((period) => period.situacao === 'Férias vencidas')
    .reduce((sum, period) => sum + period.saldoDias, 0) || 0;

  const addDiscount = () => setDescontos((current) => [...current, {
    id: nowId('desconto'), tipo: 'outros', descricao: 'Outro desconto', valor: 0, observacao: '', automatico: false,
  }]);

  const updateDiscount = (id: string, patch: Partial<RescisaoDescontoInput>) => setDescontos((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const removeDiscount = (id: string) => setDescontos((current) => current.filter((item) => item.id !== id));

  const resetForm = () => {
    setEmpId('');
    setMotivo('');
    setObservacoes('');
    setSaldoFgts(0);
    setFgtsMotivo('Saldo informado pelo operador para a memória de cálculo.');
    setDescontos([]);
    setFeriasRegistros([]);
    setManualFields(emptyOverrideState());
    setFeriasManualEnabled({});
    setFeriasManualValues({});
    setMemoryOpen(false);
  };

  const rowToPdfData = (row: any): RescisaoPdfData => ({
    empresa: row.empresa_nome || '',
    empresaCnpj: row.empresa_cnpj || '',
    funcionario: row.funcionario_nome || '',
    cargo: row.cargo || '',
    cpf: row.cpf || '-',
    admissao: row.data_admissao || '-',
    desligamento: row.data_desligamento || '',
    tipo: row.tipo_rescisao,
    aviso: row.aviso_previo,
    motivo: row.motivo || '',
    observacoes: row.observacoes || '',
    resultado: legacyResultFromRow(row),
  });

  const gerarPdfFichaRescisao = (row: any) => gerarRescisaoPdf(rowToPdfData(row));

  const buildEmailBody = (row: any) => {
    const result = legacyResultFromRow(row);
    return [
      'Segue Memória de Cálculo da Rescisão gerada pelo TOPAC RH PRO:',
      '',
      'IMPORTANTE: esta memória é uma estimativa interna para apoio e conferência. O cálculo rescisório oficial, valores finais e encargos serão apurados/validados pela contabilidade.',
      '',
      `Funcionário: ${row.funcionario_nome || ''}`,
      `CPF: ${row.cpf || ''}`,
      `Cargo: ${row.cargo || ''}`,
      `Empresa: ${row.empresa_nome || ''}`,
      `Admissão: ${row.data_admissao || ''}`,
      `Desligamento: ${row.data_desligamento || ''}`,
      `Tipo: ${tipoRescisaoLabel(row.tipo_rescisao)}`,
      `Aviso-prévio: ${row.aviso_previo || ''} (${result.diasAviso} dias)`,
      `Projeção do contrato: ${result.dataProjetadaContrato}`,
      '',
      `Saldo de salário: ${formatCurrency(result.saldoSalario)}`,
      `Aviso-prévio: ${formatCurrency(result.avisoPrevioValor)}`,
      `Férias de períodos completos/vencidos: ${formatCurrency(result.feriasVencidas)}`,
      `Férias proporcionais: ${formatCurrency(result.feriasProporcionais)}`,
      `1/3 constitucional: ${formatCurrency(result.tercoFerias)}`,
      `13º proporcional: ${result.decimoTerceiroAvos}/12 - ${formatCurrency(result.decimoTerceiroBruto)}`,
      `Total de proventos: ${formatCurrency(result.totalProventos)}`,
      `Total de descontos: ${formatCurrency(result.totalDescontos)}`,
      `Líquido estimado: ${formatCurrency(result.liquido)}`,
      `Saldo FGTS informado/importado: ${formatCurrency(result.saldoFgtsConsiderado)}`,
      `Multa FGTS: ${formatCurrency(result.multaFgts)}`,
      '',
      result.revisaoFeriasNecessaria ? 'OBSERVAÇÃO: há período(s) de férias com histórico incompleto/inferido. Isso não impede o envio; a validação final será feita pela contabilidade.' : '',
      'Detalhamento completo em anexo.',
    ].filter(Boolean).join('\n');
  };

  const getNomeUsuarioAtual = async () => {
    if (!session?.user) return '';
    const { data } = await supabase.from('profiles').select('nome_completo').eq('user_id', session.user.id).single();
    return data?.nome_completo || session.user.email || '';
  };

  const arquivarRescisaoDocumento = async (row: any, pdf?: { blob: Blob; fileName: string }) => {
    if (!session?.user) return null;
    const funcionarioId = row.funcionario_id || emp?.id;
    const funcionarioNome = row.funcionario_nome || emp?.name || '';
    if (!funcionarioId || !funcionarioNome) return null;
    const nomeUsuario = await getNomeUsuarioAtual();
    const competencia = String(row.data_desligamento || dataDesligamento || '').slice(0, 7);
    const ficha = pdf || gerarPdfFichaRescisao(row);
    const arquivoUrl = await uploadDocumentoArquivo(funcionarioId, 'rescisao', ficha.blob, ficha.fileName, funcionarioNome, competencia);
    const descricao = `Memória de Cálculo da Rescisão - ${tipoRescisaoLabel(row.tipo_rescisao)} - Desligamento: ${row.data_desligamento || dataDesligamento} - Líquido: ${formatCurrency(Number(row.liquido) || 0)}`;

    const { data: existente } = await supabase.from('documentos_funcionario')
      .select('*').eq('funcionario_id', funcionarioId).eq('tipo_documento', 'Memoria de Calculo da Rescisao')
      .eq('competencia', competencia).order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (existente?.id) {
      const { data, error } = await supabase.from('documentos_funcionario').update({
        descricao, arquivo_url: arquivoUrl, nome_arquivo: ficha.fileName, observacao: descricao,
        status_envio: existente.status_envio === 'enviado' ? 'enviado' : 'gerado',
      } as any).eq('id', existente.id).select().single();
      if (error) throw error;
      return data;
    }

    return registrarDocumento({
      funcionarioId, funcionarioNome, companyId: row.company_id || emp?.companyId || '', empresaNome: row.empresa_nome || empresa?.name || '',
      tipoDocumento: 'Memoria de Calculo da Rescisao', categoria: 'RECIBOS', origem: 'gerado_sistema', competencia,
      descricao, observacao: descricao, arquivoUrl, storageBucket: 'documentos-funcionarios', storagePath: arquivoUrl,
      nomeArquivo: ficha.fileName, dataDocumento: new Date().toISOString(), geradoPorUserId: session.user.id,
      geradoPorNome: nomeUsuario, unidade: row.empresa_nome || empresa?.name || '',
    });
  };

  const enviarEmailRescisao = async (row: any, options: { arquivar?: boolean } = {}) => {
    const pdf = gerarPdfFichaRescisao(row);
    let registro: any = null;
    if (options.arquivar !== false) registro = await arquivarRescisaoDocumento(row, pdf).catch(() => null);
    const nomeUsuario = await getNomeUsuarioAtual();
    setEmailPdfDraft({
      to: [...DESTINATARIOS_CONTABILIDADE], cc: [...CC_OBRIGATORIO],
      subject: `Memória de Cálculo da Rescisão - ${row.funcionario_nome || ''}`,
      body: buildEmailBody(row), attachmentBlob: pdf.blob, attachmentName: pdf.fileName,
      senderUserId: session?.user?.id, senderName: nomeUsuario, senderEmail: session?.user?.email,
      moduleOrigin: 'rescisoes', documentId: registro?.id, documentName: 'Memoria de Calculo da Rescisao',
      afterSend: async () => {
        if (registro?.id && session?.user) {
          await marcarComoEnviado(registro.id, session.user.id, nomeUsuario, [...DESTINATARIOS_CONTABILIDADE, ...CC_OBRIGATORIO].join(', '));
          await fetchList();
        }
      },
    });
    toast.success('Memória de cálculo pronta para envio à contabilidade.');
  };

  const validateManualChanges = () => {
    const invalidField = (Object.keys(manualFields) as OverrideField[]).find((field) => manualFields[field].enabled && !manualFields[field].reason.trim());
    if (invalidField) {
      toast.error('Informe o motivo de toda alteração manual.');
      return false;
    }
    const invalidVacation = Object.entries(feriasManualEnabled).find(([period, enabled]) => enabled && !feriasManualValues[period]?.motivo?.trim());
    if (invalidVacation) {
      toast.error('Informe o motivo do ajuste manual do período de férias.');
      return false;
    }
    return true;
  };

  const handleSalvar = async () => {
    if (!emp || !empresa || !resultado || !session) {
      toast.error('Selecione um funcionário.');
      return;
    }
    if (!validateManualChanges()) return;

    setSaving(true);
    try {
      const payload = {
        funcionario_id: emp.id, funcionario_nome: emp.name, company_id: emp.companyId, empresa_nome: empresa.name,
        empresa_cnpj: empresa.cnpj || null, empresa_municipio: empresa.city || null, cargo: emp.cargo,
        cpf: emp.cpf || null, endereco: emp.endereco || null, data_admissao: emp.dataAdmissao || null,
        data_desligamento: dataDesligamento, data_projecao_aviso: resultado.dataProjetadaContrato,
        tipo_rescisao: tipo, motivo, aviso_previo: aviso, dias_aviso: resultado.diasAviso,
        salario_base: emp.salarioBase, remuneracao_base: resultado.baseRemuneracao, dependentes: 0,
        saldo_fgts_depositado: resultado.saldoFgtsConsiderado, fgts_saldo_editado_manual: saldoFgts > 0,
        fgts_saldo_motivo: fgtsMotivo || '', saldo_salario: resultado.saldoSalario,
        dias_saldo_salario: resultado.diasSaldoSalario, divisor_saldo_salario: resultado.divisorSaldoSalario,
        aviso_previo_valor: resultado.avisoPrevioValor, aviso_previo_desconto: resultado.avisoPrevioDesconto,
        ferias_vencidas: resultado.feriasVencidas, ferias_em_aberto: resultado.feriasEmAberto,
        ferias_proporcionais: resultado.feriasProporcionais, ferias_em_dobro_adicional: resultado.feriasEmDobroAdicional,
        terco_ferias: resultado.tercoFerias, terco_ferias_vencidas: resultado.tercoFeriasVencidas,
        terco_ferias_proporcionais: resultado.tercoFeriasProporcionais, decimo_terceiro: resultado.decimoTerceiro,
        decimo_terceiro_bruto: resultado.decimoTerceiroBruto, decimo_terceiro_adiantado: resultado.decimoTerceiroAdiantado,
        decimo_terceiro_avos: resultado.decimoTerceiroAvos, inss: resultado.inss, irrf: resultado.irrf,
        fgts_mes: resultado.fgtsMes, multa_fgts: resultado.multaFgts, outros_descontos: resultado.outrosDescontos,
        total_proventos: resultado.totalProventos, total_descontos: resultado.totalDescontos, liquido: resultado.liquido,
        descontos_json: resultado.descontosDetalhados, periodos_ferias_json: resultado.periodosFerias,
        alteracoes_manuais_json: [...resultado.alteracoesManuais, ...feriasOverrides],
        revisao_ferias_necessaria: resultado.revisaoFeriasNecessaria, calculo_versao: 'rescisao-v2-2026',
        calculado_em: resultado.auditoria.calculadoEm, observacoes, snapshot_json: resultado,
        status: 'finalizada', user_id: session.user.id, usuario_nome: session.user.email || '',
      };

      const { data: saved, error } = await supabase.from('rescisoes').insert(payload as any).select('*').single();
      if (error) throw new Error(`Não foi possível persistir a rescisão auditável: ${error.message}`);

      const { error: historyError } = await supabase.from('rescisao_historico').insert({
        rescisao_id: saved.id,
        acao: 'calculo_finalizado',
        detalhe: `Rescisão ${tipoRescisaoLabel(tipo)} calculada e finalizada.`,
        snapshot_json: resultado,
        alteracoes_manuais_json: [...resultado.alteracoesManuais, ...feriasOverrides],
        user_id: session.user.id,
        usuario_nome: session.user.email || '',
      } as any);
      if (historyError) throw new Error(`Rescisão salva, mas a auditoria falhou: ${historyError.message}`);

      const observacaoDesligamento = [
        emp.observacoes,
        `[RESCISAO] Desligamento: ${dataDesligamento} | Tipo: ${tipoRescisaoLabel(tipo)} | Motivo: ${motivo || '-'}`,
      ].filter(Boolean).join('\n');
      const { error: employeeError } = await supabase.from('funcionarios')
        .update({ status: 'desligado', observacoes: observacaoDesligamento } as any).eq('id', emp.id);
      if (employeeError) throw employeeError;

      toast.success('Rescisão registrada com memória de cálculo e auditoria.');
      setOpen(false);
      resetForm();
      await refreshData();
      await fetchList();
      await enviarEmailRescisao(saved);
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const imprimir = async (row: any) => {
    const pdf = gerarPdfFichaRescisao(row);
    await arquivarRescisaoDocumento(row, pdf).catch((error) => console.error('Erro ao arquivar memória:', error));
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      toast.warning('O navegador bloqueou a nova aba de impressão.');
      return;
    }
    win.document.open();
    win.document.write(pdf.html);
    win.document.close();
    win.document.title = pdf.fileName.replace(/\.pdf$/i, '');
    window.setTimeout(() => { win.focus(); win.print(); }, 300);
  };

  const renderManualField = (field: OverrideField, label: string, automaticValue: number) => {
    const state = manualFields[field];
    return (
      <div className="border rounded-lg p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={state.enabled} onChange={(event) => setManualFields((current) => ({
            ...current,
            [field]: { ...current[field], enabled: event.target.checked, value: event.target.checked ? automaticValue : current[field].value },
          }))} />
          Ajustar {label} manualmente
        </label>
        <div className="text-xs text-muted-foreground">Automático: {formatCurrency(automaticValue)}</div>
        {state.enabled && <>
          <MoneyInput value={state.value} onValueChange={(value) => setManualFields((current) => ({ ...current, [field]: { ...current[field], value } }))} />
          <Input value={state.reason} onChange={(event) => setManualFields((current) => ({ ...current, [field]: { ...current[field], reason: event.target.value } }))} placeholder="Motivo obrigatório da alteração" />
          <div className="text-xs text-warning font-medium">Valor alterado manualmente</div>
        </>}
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><FileX className="w-6 h-6" /> Rescisões</h1>
          <p className="text-sm text-muted-foreground">Cálculo auditável integrado a RH, férias e fechamento.</p>
        </div>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setMemoryOpen(false); }}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Rescisão</Button></DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Rescisão</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="md:col-span-2 lg:col-span-4">
                <Label>Funcionário</Label>
                <EmployeeCombobox value={empId || undefined} onChange={(employee) => { setEmpId(employee?.id || ''); setConfirmouFerias(false); }} placeholder="Buscar por nome, CPF, função ou empresa..." />
              </div>
              {emp && <div className="md:col-span-2 lg:col-span-4 text-xs text-muted-foreground bg-muted p-3 rounded grid md:grid-cols-4 gap-2">
                <span><strong>Empresa:</strong> {empresa?.name}</span><span><strong>Admissão:</strong> {emp.dataAdmissao || '-'}</span>
                <span><strong>CPF:</strong> {emp.cpf || '-'}</span><span><strong>Salário:</strong> {formatCurrency(emp.salarioBase)}</span>
              </div>}
              <div><Label>Data do desligamento</Label><Input type="date" value={dataDesligamento} onChange={(e) => { setDataDesligamento(e.target.value); setConfirmouFerias(false); }} /></div>
              <div><Label>Tipo de rescisão</Label><Select value={tipo} onValueChange={(value) => setTipo(value as TipoRescisao)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="sem_justa_causa">Sem justa causa (empregador)</SelectItem><SelectItem value="pedido_demissao">Pedido de demissão</SelectItem>
                <SelectItem value="acordo_mutuo_484a">Acordo mútuo (Art. 484-A)</SelectItem><SelectItem value="justa_causa">Justa causa</SelectItem>
                <SelectItem value="termino_contrato_experiencia">Término de contrato de experiência</SelectItem><SelectItem value="rescisao_indireta">Rescisão indireta</SelectItem>
              </SelectContent></Select></div>
              <div><Label>Aviso-prévio</Label><Select value={aviso} onValueChange={(value) => setAviso(value as AvisoPrevio)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="trabalhado">Trabalhado</SelectItem><SelectItem value="indenizado">Indenizado</SelectItem><SelectItem value="descontado">Descontado</SelectItem><SelectItem value="dispensado">Dispensado / sem aviso</SelectItem>
              </SelectContent></Select></div>
              <div><Label>Saldo FGTS informado/importado</Label><MoneyInput value={saldoFgts} onValueChange={setSaldoFgts} /></div>
              <div className="md:col-span-2 lg:col-span-4"><Label>Origem/motivo do saldo FGTS</Label><Input value={fgtsMotivo} onChange={(e) => setFgtsMotivo(e.target.value)} placeholder="Ex.: extrato FGTS importado em 07/08/2026" /></div>
            </div>

            {emp && resultado && <>
              <div className="mt-2">
                <div className="font-bold text-base">Férias calculadas automaticamente</div>
                <div className="text-xs text-muted-foreground">Períodos aquisitivos cruzados com o histórico do módulo de Férias.</div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="p-3"><p className="text-xs text-muted-foreground">FÉRIAS VENCIDAS</p><p className="text-xl font-bold">{overdueDays.toLocaleString('pt-BR')} dias</p><p className="text-xs">{formatCurrency(resultado.feriasVencidas + resultado.tercoFeriasVencidas)}</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">FÉRIAS PROPORCIONAIS</p><p className="text-xl font-bold">{proportionalPeriod?.avos || 0}/12 · {proportionalPeriod?.saldoDias || 0} dias</p><p className="text-xs">{formatCurrency(resultado.feriasProporcionais)}</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">1/3 CONSTITUCIONAL</p><p className="text-xl font-bold">{formatCurrency(resultado.tercoFerias)}</p><p className="text-xs">Todos os períodos devidos</p></Card>
                <Card className="p-3"><p className="text-xs text-muted-foreground">TOTAL DE FÉRIAS</p><p className="text-xl font-bold text-primary">{formatCurrency(resultado.totalFerias)}</p><p className="text-xs">Inclui dobra quando aplicável</p></Card>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button type="button" variant="outline" onClick={() => setMemoryOpen(true)}><Calculator className="w-4 h-4 mr-2" />Ver memória de cálculo</Button>
                {feriasLoading && <span className="text-xs text-muted-foreground"><Loader2 className="w-3 h-3 inline animate-spin mr-1" />Carregando férias...</span>}
                {resultado.revisaoFeriasNecessaria && <Badge variant="outline" className="border-warning text-warning"><AlertTriangle className="w-3 h-3 mr-1" />Férias com dados estimados — validar com a contabilidade</Badge>}
              </div>

              <Card className="p-4 space-y-3">
                <div className="font-bold">13º salário, saldo e aviso</div>
                <div className="grid md:grid-cols-3 gap-3 text-sm">
                  <div className="border rounded p-3"><span className="text-xs text-muted-foreground block">Saldo de salário</span><b>{resultado.diasSaldoSalario} dias / divisor {resultado.divisorSaldoSalario}</b><div>{formatCurrency(resultado.saldoSalario)}</div></div>
                  <div className="border rounded p-3"><span className="text-xs text-muted-foreground block">Aviso-prévio</span><b>{resultado.diasAviso} dias</b><div>{formatCurrency(resultado.avisoPrevioValor)}</div><small>Projeção: {resultado.dataProjetadaContrato}</small></div>
                  <div className="border rounded p-3"><span className="text-xs text-muted-foreground block">13º proporcional</span><b>{resultado.decimoTerceiroAvos}/12</b><div>Bruto {formatCurrency(resultado.decimoTerceiroBruto)}</div><small>Adiantado {formatCurrency(resultado.decimoTerceiroAdiantado)} · saldo {formatCurrency(resultado.decimoTerceiro)}</small></div>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex justify-between items-center"><div><div className="font-bold">Descontos</div><div className="text-xs text-muted-foreground">Faltas e dados disponíveis no fechamento são carregados automaticamente.</div></div><Button type="button" variant="outline" size="sm" onClick={addDiscount}><Plus className="w-4 h-4 mr-1" />Adicionar</Button></div>
                <div className="space-y-2">
                  {descontos.map((item) => <div key={item.id} className="grid md:grid-cols-[180px_1fr_150px_1fr_40px] gap-2 items-end border rounded p-2">
                    <div><Label className="text-xs">Tipo</Label><Select value={item.tipo} onValueChange={(value) => updateDiscount(item.id, { tipo: value as RescisaoDescontoTipo, descricao: discountLabels[value as RescisaoDescontoTipo] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(discountLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">Descrição</Label><Input value={item.descricao} onChange={(e) => updateDiscount(item.id, { descricao: e.target.value })} /></div>
                    <div><Label className="text-xs">Valor</Label><MoneyInput value={item.valor} onValueChange={(value) => updateDiscount(item.id, { valor: value })} /></div>
                    <div><Label className="text-xs">Observação</Label><Input value={item.observacao || ''} onChange={(e) => updateDiscount(item.id, { observacao: e.target.value })} /></div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeDiscount(item.id)} title="Remover"><Trash2 className="w-4 h-4" /></Button>
                  </div>)}
                  {!descontos.length && <div className="text-xs text-muted-foreground">Nenhum desconto adicional lançado.</div>}
                </div>
              </Card>

              <Card className="p-4 space-y-3"><div className="font-bold">Ajustes manuais auditados</div><div className="text-xs text-muted-foreground">Use somente quando houver conferência documental. O motivo é obrigatório e será gravado na auditoria.</div><div className="grid md:grid-cols-3 gap-3">
                {renderManualField('saldoSalario', 'saldo de salário', automaticResult?.saldoSalario || 0)}
                {renderManualField('avisoPrevioValor', 'aviso-prévio', automaticResult?.avisoPrevioValor || 0)}
                {renderManualField('decimoTerceiroBruto', '13º bruto', automaticResult?.decimoTerceiroBruto || 0)}
              </div></Card>

              <div className="grid md:grid-cols-2 gap-3"><div><Label>Motivo da rescisão</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div><div><Label>Observações</Label><Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div></div>

              <Card className="p-4 space-y-1 text-sm">
                <div className="font-bold text-base mb-2">Resumo da rescisão</div>
                <div className="flex justify-between"><span>Saldo de salário</span><span>{formatCurrency(resultado.saldoSalario)}</span></div>
                <div className="flex justify-between"><span>Aviso-prévio</span><span>{formatCurrency(resultado.avisoPrevioValor)}</span></div>
                <div className="flex justify-between"><span>Férias vencidas + 1/3</span><span>{formatCurrency(resultado.feriasVencidas + resultado.tercoFeriasVencidas)}</span></div>
                <div className="flex justify-between"><span>Férias adquiridas em aberto + 1/3</span><span>{formatCurrency(resultado.feriasEmAberto + resultado.tercoFeriasEmAberto)}</span></div>
                <div className="flex justify-between"><span>Férias proporcionais + 1/3</span><span>{formatCurrency(resultado.feriasProporcionais + resultado.tercoFeriasProporcionais)}</span></div>
                <div className="flex justify-between"><span>13º proporcional bruto</span><span>{formatCurrency(resultado.decimoTerceiroBruto)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>TOTAL DE PROVENTOS</span><span>{formatCurrency(resultado.totalProventos)}</span></div>
                <div className="flex justify-between text-destructive"><span>INSS</span><span>{formatCurrency(resultado.inss)}</span></div>
                <div className="flex justify-between text-destructive"><span>IRRF</span><span>{formatCurrency(resultado.irrf)}</span></div>
                <div className="flex justify-between text-destructive"><span>Adiantamentos / VT / VR / outros</span><span>{formatCurrency(resultado.outrosDescontos)}</span></div>
                <div className="flex justify-between font-bold"><span>TOTAL DE DESCONTOS</span><span>{formatCurrency(resultado.totalDescontos)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2 text-success"><span>LÍQUIDO ESTIMADO</span><span>{formatCurrency(resultado.liquido)}</span></div>
                <div className="flex justify-between text-muted-foreground border-t pt-2"><span>FGTS informado/importado</span><span>{formatCurrency(resultado.saldoFgtsConsiderado)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Multa FGTS (extra-rescisão)</span><span>{formatCurrency(resultado.multaFgts)}</span></div>
              </Card>
            </>}

            <div className="flex justify-end gap-2 pt-4"><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={handleSalvar} disabled={!emp || saving || feriasLoading}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Salvar e Enviar</Button></div>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Memória de cálculo — períodos aquisitivos</DialogTitle></DialogHeader>
          {resultado && <div className="space-y-3">
            {resultado.revisaoFeriasNecessaria && <div className="border-l-4 border-warning bg-warning/10 p-3 text-sm"><b>Aviso informativo.</b> Alguns períodos de férias foram inferidos por falta de histórico completo. A memória pode ser salva e enviada normalmente; a validação e o cálculo oficial são da contabilidade.</div>}
            <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead className="bg-muted"><tr><th className="p-2 text-left">Período aquisitivo</th><th className="p-2 text-left">Situação</th><th className="p-2 text-right">Direito</th><th className="p-2 text-right">Usados</th><th className="p-2 text-right">Abono</th><th className="p-2 text-right">Saldo</th><th className="p-2 text-right">Férias</th><th className="p-2 text-right">1/3</th><th className="p-2 text-right">Total</th></tr></thead><tbody>
              {resultado.periodosFerias.map((period) => <React.Fragment key={period.periodoAquisitivoInicio}><tr className="border-t"><td className="p-2">{period.periodoAquisitivoInicio} a {period.periodoAquisitivoFim}<div className="text-[10px] text-muted-foreground">Limite: {period.dataLimiteConcessiva} · {period.origemPeriodo}</div></td><td className="p-2"><Badge variant="outline">{period.situacao}</Badge>{period.avos != null && <div>{period.avos}/12</div>}{period.revisaoNecessaria && <div className="text-warning text-[10px] mt-1">Revisar</div>}</td><td className="p-2 text-right">{period.diasDireito}</td><td className="p-2 text-right">{period.diasJaUtilizados}</td><td className="p-2 text-right">{period.diasAbono}</td><td className="p-2 text-right font-bold">{period.saldoDias}</td><td className="p-2 text-right">{formatCurrency(period.valorFerias)}</td><td className="p-2 text-right">{formatCurrency(period.tercoConstitucional)}</td><td className="p-2 text-right font-bold">{formatCurrency(period.totalPeriodo)}</td></tr>
                <tr className="border-t bg-muted/20"><td colSpan={9} className="p-2"><div className="flex flex-wrap gap-3 items-center"><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(feriasManualEnabled[period.periodoAquisitivoInicio])} onChange={(e) => { const enabled = e.target.checked; setFeriasManualEnabled((current) => ({ ...current, [period.periodoAquisitivoInicio]: enabled })); if (enabled) setFeriasManualValues((current) => ({ ...current, [period.periodoAquisitivoInicio]: current[period.periodoAquisitivoInicio] || { diasUtilizados: period.diasJaUtilizados, diasAbono: period.diasAbono, quitado: false, motivo: '' } })); }} />Ajustar manualmente este período</label>{feriasManualEnabled[period.periodoAquisitivoInicio] && <><label>Usados <DecimalInput value={feriasManualValues[period.periodoAquisitivoInicio]?.diasUtilizados || 0} decimals={0} onValueChange={(value) => setFeriasManualValues((current) => ({ ...current, [period.periodoAquisitivoInicio]: { ...current[period.periodoAquisitivoInicio], diasUtilizados: value } }))} /></label><label>Abono <DecimalInput value={feriasManualValues[period.periodoAquisitivoInicio]?.diasAbono || 0} decimals={0} onValueChange={(value) => setFeriasManualValues((current) => ({ ...current, [period.periodoAquisitivoInicio]: { ...current[period.periodoAquisitivoInicio], diasAbono: value } }))} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(feriasManualValues[period.periodoAquisitivoInicio]?.quitado)} onChange={(e) => setFeriasManualValues((current) => ({ ...current, [period.periodoAquisitivoInicio]: { ...current[period.periodoAquisitivoInicio], quitado: e.target.checked } }))} />Marcar quitado</label><Input className="min-w-[280px]" value={feriasManualValues[period.periodoAquisitivoInicio]?.motivo || ''} onChange={(e) => setFeriasManualValues((current) => ({ ...current, [period.periodoAquisitivoInicio]: { ...current[period.periodoAquisitivoInicio], motivo: e.target.value } }))} placeholder="Motivo obrigatório" /><span className="text-warning font-medium">Valor alterado manualmente</span></>}</div>{period.observacao && <div className="text-[10px] text-muted-foreground mt-2">{period.observacao}</div>}</td></tr></React.Fragment>)}
            </tbody></table></div>
            <div className="border rounded p-3 text-sm text-muted-foreground"><b className="text-foreground">Memória estimativa.</b> A conferência dos períodos pode ser feita como apoio interno, mas não bloqueia o salvamento nem o envio para a contabilidade.</div>
          </div>}
        </DialogContent>
      </Dialog>

      <Card className="p-0 overflow-x-auto">
        {loading ? <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div> : <table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">Funcionário</th><th className="p-2 text-left">Empresa</th><th className="p-2 text-left">Desligamento</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-right">Líquido</th><th className="p-2 text-center">Ações</th></tr></thead><tbody>
          {list.map((row) => <tr key={row.id} className="border-t hover:bg-muted/40"><td className="p-2">{row.funcionario_nome}</td><td className="p-2">{row.empresa_nome}</td><td className="p-2">{row.data_desligamento}</td><td className="p-2"><Badge variant="outline">{tipoRescisaoLabel(row.tipo_rescisao)}</Badge></td><td className="p-2 text-right font-bold text-success">{formatCurrency(Number(row.liquido))}</td><td className="p-2 text-center"><Button size="sm" variant="ghost" onClick={() => imprimir(row)} title="Imprimir memória"><Printer className="w-4 h-4" /></Button><Button size="sm" variant="ghost" onClick={() => enviarEmailRescisao(row)} title="Enviar para contabilidade"><Mail className="w-4 h-4" /></Button></td></tr>)}
          {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma rescisão registrada.</td></tr>}
        </tbody></table>}
      </Card>

      <EmailPdfModal open={!!emailPdfDraft} draft={emailPdfDraft} onOpenChange={(nextOpen) => { if (!nextOpen) setEmailPdfDraft(null); }} />
    </div>
  );
};

export default RescisaoPage;
