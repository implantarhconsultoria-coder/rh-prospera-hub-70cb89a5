import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Save, Printer, FileText, Loader2, RefreshCw, Send } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCompetencia } from '@/lib/workingDays';
import { registrarAcao } from '@/lib/acoesLog';
import { parseCurrencyBR, formatBRL } from '@/lib/currencyMask';
import { downloadEmailWithAttachment } from '@/lib/emailUtils';
import { toast } from 'sonner';

/** Decide o percentual de hora extra extra padrão da empresa (50% ou 60%). */
const usaHE60 = (nomeEmpresa: string) =>
  /goi[âa]nia/i.test(nomeEmpresa || '');

/** Funcionários com comissão default por nome (case-insensitive). */
const COMISSIONADOS_DEFAULT: Array<{ nomeMatch: RegExp; empresaMatch: RegExp; pct: number }> = [
  { nomeMatch: /aldenei.*pereira.*santos/i, empresaMatch: /goi[âa]nia/i, pct: 2 },
];

const defaultComissaoPct = (nomeEmp: string, nomeFunc: string): number => {
  for (const r of COMISSIONADOS_DEFAULT) {
    if (r.empresaMatch.test(nomeEmp) && r.nomeMatch.test(nomeFunc)) return r.pct;
  }
  return 0;
};

const isEmpresaLoteContabilidade = (nomeEmpresa: string) =>
  /matriz|praia|lmt|alqui/i.test(nomeEmpresa || '') && !/goi[Ã¢a]nia/i.test(nomeEmpresa || '');

interface ItemRow {
  id?: string;
  funcionario_id?: string | null;
  nome: string;
  cpf: string;
  salario: number;
  insalubridade: number;
  // Comissão estruturada
  tem_comissao: boolean;
  comissao_base: number;
  comissao_percentual: number;
  comissao_valor: number;
  // HE 50%
  hora_extra_50_horas: number;
  hora_extra_50: number;
  // HE 60% (Goiânia)
  hora_extra_60_horas: number;
  hora_extra_60: number;
  // HE 100%
  hora_extra_100_horas: number;
  hora_extra_100: number;
  assistencia_medica: number;
  faltas_qtd: number;
  desconto_falta: number;
  dsr_qtd: number;
  desconto_dsr: number;
  adiantamento: number;
  adiantamento_manual: boolean;
  total: number;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const calcAdiantamentoAuto = (salario: number) => round2(Number(salario || 0) * 0.4);

const calcComissaoValor = (base: number, pct: number) =>
  round2(Number(base || 0) * (Number(pct || 0) / 100));

const calcTotal = (r: ItemRow) =>
  round2(
    Number(r.salario || 0) +
    Number(r.insalubridade || 0) +
    Number(r.comissao_valor || 0) +
    Number(r.hora_extra_50 || 0) +
    Number(r.hora_extra_60 || 0) +
    Number(r.hora_extra_100 || 0) -
    Number(r.assistencia_medica || 0) -
    Number(r.desconto_falta || 0) -
    Number(r.desconto_dsr || 0) -
    Number(r.adiantamento || 0)
  );

/** Campo de moeda com máscara BR */
const CurrencyInput: React.FC<{
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}> = ({ value, onCommit, className }) => {
  const [draft, setDraft] = useState<string>(formatBRL(Number(value || 0)));
  useEffect(() => { setDraft(formatBRL(Number(value || 0))); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        const n = parseCurrencyBR(draft);
        setDraft(formatBRL(n));
        onCommit(n);
      }}
      className={className}
    />
  );
};

/** Campo numérico simples (horas/qtd) */
const NumberInput: React.FC<{
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}> = ({ value, onCommit, className }) => {
  const [draft, setDraft] = useState<string>(String(value ?? 0));
  useEffect(() => { setDraft(String(value ?? 0)); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        const n = Number(String(draft).replace(',', '.')) || 0;
        setDraft(String(n));
        onCommit(n);
      }}
      className={className}
    />
  );
};

/** Campo percentual */
const PercentInput: React.FC<{
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}> = ({ value, onCommit, className }) => {
  const [draft, setDraft] = useState<string>(String(value ?? 0));
  useEffect(() => { setDraft(String(value ?? 0)); }, [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        const n = Number(String(draft).replace(',', '.')) || 0;
        setDraft(String(n));
        onCommit(n);
      }}
      className={className}
    />
  );
};

const ApontamentoContabilidadePage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, config } = useApp();
  const [companyId, setCompanyId] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [items, setItems] = useState<ItemRow[]>([]);
  const [apontamentoId, setApontamentoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ultimoPdfUrl, setUltimoPdfUrl] = useState<string | null>(null);
  const [empresasLoteIds, setEmpresasLoteIds] = useState<string[]>([]);

  const company = companies.find(c => c.id === companyId);
  const isGO = !!company && usaHE60(company.name);
  const heLabelPct = isGO ? '60%' : '50%';
  const empresasLoteDisponiveis = useMemo(
    () => companies.filter((c) => isEmpresaLoteContabilidade(c.name)),
    [companies],
  );

  useEffect(() => {
    setEmpresasLoteIds((prev) => prev.filter((id) => empresasLoteDisponiveis.some((c) => c.id === id)));
  }, [empresasLoteDisponiveis]);

  useEffect(() => {
    if (!companyId || !competencia) return;
    setLoading(true);
    (async () => {
      await getOrCreateEntries(companyId, competencia);
      const { data: header } = await supabase
        .from('apontamentos_contabilidade')
        .select('*')
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .maybeSingle();
      if (header) {
        setApontamentoId((header as any).id);
        const { data: itens } = await supabase
          .from('apontamentos_contabilidade_itens')
          .select('*')
          .eq('apontamento_id', (header as any).id)
          .order('nome');
        const rows = ((itens as any[]) || []).map(r => {
          // Compat: se nao houver comissao_base/_percentual/_valor mas houver "comissao", trata como valor
          const hasStructured = (Number(r.comissao_base || 0) + Number(r.comissao_percentual || 0) + Number(r.comissao_valor || 0)) > 0
            || r.tem_comissao === true;
          const comissaoValor = hasStructured ? Number(r.comissao_valor || 0) : Number(r.comissao || 0);
          const comissaoPct = Number(r.comissao_percentual || 0);
          const comissaoBase = Number(r.comissao_base || 0);
          const adiantamento = Number(r.adiantamento || 0);
          const adiantManual = r.adiantamento_manual === true;
          const salario = Number(r.salario || 0);
          const adiantamentoFinal = adiantManual
            ? adiantamento
            : (adiantamento > 0 ? adiantamento : calcAdiantamentoAuto(salario));
          const row: ItemRow = {
            id: r.id,
            funcionario_id: r.funcionario_id,
            nome: r.nome,
            cpf: r.cpf,
            salario,
            insalubridade: Number(r.insalubridade || 0),
            tem_comissao: r.tem_comissao === true || comissaoValor > 0 || comissaoBase > 0,
            comissao_base: comissaoBase,
            comissao_percentual: comissaoPct,
            comissao_valor: comissaoValor,
            hora_extra_50_horas: Number(r.hora_extra_50_horas || 0),
            hora_extra_50: Number(r.hora_extra_50 || 0),
            hora_extra_60_horas: Number(r.hora_extra_60_horas || 0),
            hora_extra_60: Number(r.hora_extra_60 || 0),
            hora_extra_100_horas: Number(r.hora_extra_100_horas || 0),
            hora_extra_100: Number(r.hora_extra_100 || 0),
            assistencia_medica: Number(r.assistencia_medica || 0),
            faltas_qtd: Number(r.faltas_qtd || 0),
            desconto_falta: Number(r.desconto_falta || r.falta_dsr || 0),
            dsr_qtd: Number(r.dsr_qtd || 0),
            desconto_dsr: Number(r.desconto_dsr || 0),
            adiantamento: adiantamentoFinal,
            adiantamento_manual: adiantManual,
            total: 0,
          };
          row.total = calcTotal(row);
          return row;
        });
        setItems(rows);
      } else {
        setApontamentoId(null);
        const compEmps = employees.filter(e => e.companyId === companyId && e.status === 'ativo');
        const compEntries = entries.filter(e => e.companyId === companyId && e.competencia === competencia);
        const empGO = company ? usaHE60(company.name) : false;
        const rows: ItemRow[] = compEmps.map(emp => {
          const ent = compEntries.find(e => e.employeeId === emp.id);
          const salario = Number(emp.salarioBase || 0);
          const insal = emp.insalubridadeAtiva ? Number(emp.insalubridadeValor || config.valorInsalubridade || 0) : 0;
          const valorHora = salario / 220;
          const heExtraHoras = Number(ent?.he50 || 0);
          const he100Horas = Number(ent?.he100 || 0);
          const he50Valor = !empGO ? round2(heExtraHoras * valorHora * 1.5) : 0;
          const he60Valor = empGO ? round2(heExtraHoras * valorHora * 1.6) : 0;
          const he100Valor = round2(he100Horas * valorHora * 2);
          const faltasQtd = Number(ent?.faltasDias || 0);
          const descFalta = round2(faltasQtd * (salario / 30));
          const empNome = company?.name || '';
          const pctDefault = defaultComissaoPct(empNome, emp.name);
          const baseDefault = Number(ent?.comissaoBase || 0);
          const temComissao = pctDefault > 0 || baseDefault > 0;
          const comissaoValor = temComissao ? calcComissaoValor(baseDefault, pctDefault) : 0;
          const r: ItemRow = {
            funcionario_id: emp.id,
            nome: emp.name,
            cpf: emp.cpf,
            salario,
            insalubridade: insal,
            tem_comissao: temComissao,
            comissao_base: baseDefault,
            comissao_percentual: pctDefault,
            comissao_valor: comissaoValor,
            hora_extra_50_horas: empGO ? 0 : heExtraHoras,
            hora_extra_50: he50Valor,
            hora_extra_60_horas: empGO ? heExtraHoras : 0,
            hora_extra_60: he60Valor,
            hora_extra_100_horas: he100Horas,
            hora_extra_100: he100Valor,
            assistencia_medica: 0,
            faltas_qtd: faltasQtd,
            desconto_falta: descFalta,
            dsr_qtd: 0,
            desconto_dsr: 0,
            adiantamento: calcAdiantamentoAuto(salario),
            adiantamento_manual: false,
            total: 0,
          };
          r.total = calcTotal(r);
          return r;
        });
        setItems(rows);
      }
      setLoading(false);
    })();
  }, [companyId, competencia]); // eslint-disable-line

  const totalGeral = useMemo(
    () => round2(items.reduce((s, r) => s + Number(r.total || 0), 0)),
    [items],
  );

  const updateRow = (idx: number, patch: Partial<ItemRow>) => {
    setItems(prev => {
      const next = [...prev];
      const row: ItemRow = { ...next[idx], ...patch } as ItemRow;
      // Recalcular dependentes
      const valorHora = Number(row.salario || 0) / 220;
      // se editou horas, recalcular valor de HE
      if ('hora_extra_50_horas' in patch)
        row.hora_extra_50 = round2(Number(row.hora_extra_50_horas) * valorHora * 1.5);
      if ('hora_extra_60_horas' in patch)
        row.hora_extra_60 = round2(Number(row.hora_extra_60_horas) * valorHora * 1.6);
      if ('hora_extra_100_horas' in patch)
        row.hora_extra_100 = round2(Number(row.hora_extra_100_horas) * valorHora * 2);
      if ('faltas_qtd' in patch)
        row.desconto_falta = round2(Number(row.faltas_qtd) * (Number(row.salario) / 30));
      if ('dsr_qtd' in patch)
        row.desconto_dsr = round2(Number(row.dsr_qtd) * (Number(row.salario) / 30));
      // Comissão: se base/% mudaram, recalcular valor
      if ('comissao_base' in patch || 'comissao_percentual' in patch || 'tem_comissao' in patch) {
        if (!row.tem_comissao) {
          row.comissao_base = 0;
          row.comissao_percentual = 0;
          row.comissao_valor = 0;
        } else {
          row.comissao_valor = calcComissaoValor(row.comissao_base, row.comissao_percentual);
        }
      }
      // Salário mudou: se adiantamento não foi marcado manual, atualizar auto
      if ('salario' in patch && !row.adiantamento_manual) {
        row.adiantamento = calcAdiantamentoAuto(row.salario);
      }
      // Marca adiantamento manual quando o usuário edita explicitamente
      if ('adiantamento' in patch && !('adiantamento_manual' in patch)) {
        row.adiantamento_manual = true;
      }
      row.total = calcTotal(row);
      next[idx] = row;
      return next;
    });
  };

  const recalcularTudo = () => {
    setItems(prev => prev.map(r => {
      const valorHora = Number(r.salario || 0) / 220;
      const adiant = r.adiantamento_manual ? r.adiantamento : calcAdiantamentoAuto(r.salario);
      const comissaoValor = r.tem_comissao ? calcComissaoValor(r.comissao_base, r.comissao_percentual) : 0;
      const next: ItemRow = {
        ...r,
        adiantamento: adiant,
        comissao_valor: comissaoValor,
        hora_extra_50: round2(Number(r.hora_extra_50_horas) * valorHora * 1.5),
        hora_extra_60: round2(Number(r.hora_extra_60_horas) * valorHora * 1.6),
        hora_extra_100: round2(Number(r.hora_extra_100_horas) * valorHora * 2),
        desconto_falta: round2(Number(r.faltas_qtd) * (Number(r.salario) / 30)),
        desconto_dsr: round2(Number(r.dsr_qtd) * (Number(r.salario) / 30)),
        total: 0,
      };
      next.total = calcTotal(next);
      return next;
    }));
    toast.success('Apontamento recalculado');
  };

  const salvar = async () => {
    if (!companyId) return toast.error('Selecione a empresa');
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from('profiles').select('nome_completo').eq('user_id', user?.id || '').maybeSingle();
      const userNome = (prof as any)?.nome_completo || user?.email || 'usuário';

      let headerId = apontamentoId;
      if (!headerId) {
        const { data, error } = await supabase
          .from('apontamentos_contabilidade')
          .insert({
            company_id: companyId,
            empresa_nome: company?.name || '',
            competencia,
            total_geral: totalGeral,
            criado_por_user_id: user?.id,
            criado_por_nome: userNome,
            atualizado_por_nome: userNome,
          } as any)
          .select('id')
          .single();
        if (error) throw error;
        headerId = (data as any).id;
        setApontamentoId(headerId);
      } else {
        await supabase.from('apontamentos_contabilidade')
          .update({ total_geral: totalGeral, atualizado_por_nome: userNome } as any)
          .eq('id', headerId);
        await supabase.from('apontamentos_contabilidade_itens').delete().eq('apontamento_id', headerId);
      }

      const payload = items.map(r => ({
        apontamento_id: headerId,
        funcionario_id: r.funcionario_id || null,
        nome: r.nome,
        cpf: r.cpf,
        salario: r.salario,
        insalubridade: r.insalubridade,
        comissao: r.comissao_valor, // compat: coluna antiga = valor calculado
        tem_comissao: r.tem_comissao,
        comissao_base: r.comissao_base,
        comissao_percentual: r.comissao_percentual,
        comissao_valor: r.comissao_valor,
        hora_extra_50_horas: r.hora_extra_50_horas,
        hora_extra_50: r.hora_extra_50,
        hora_extra_60_horas: r.hora_extra_60_horas,
        hora_extra_60: r.hora_extra_60,
        hora_extra_100_horas: r.hora_extra_100_horas,
        hora_extra_100: r.hora_extra_100,
        assistencia_medica: r.assistencia_medica,
        faltas_qtd: r.faltas_qtd,
        desconto_falta: r.desconto_falta,
        dsr_qtd: r.dsr_qtd,
        desconto_dsr: r.desconto_dsr,
        adiantamento: r.adiantamento,
        adiantamento_manual: r.adiantamento_manual,
        falta_dsr: r.desconto_falta + r.desconto_dsr,
        total: r.total,
        alterado_por_nome: userNome,
        alterado_em: new Date().toISOString(),
      }));
      if (payload.length > 0) {
        const { error: ie } = await supabase.from('apontamentos_contabilidade_itens').insert(payload as any);
        if (ie) throw ie;
      }

      await registrarAcao({
        modulo: 'contabilidade',
        entidade: 'apontamento_contabilidade',
        entidadeId: headerId!,
        acao: 'editou',
        depois: { total_geral: totalGeral, itens: payload.length },
      });

      toast.success('Apontamento salvo');
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const montarLinhaSalva = (r: any): ItemRow => {
    const hasStructured = (Number(r.comissao_base || 0) + Number(r.comissao_percentual || 0) + Number(r.comissao_valor || 0)) > 0
      || r.tem_comissao === true;
    const comissaoValor = hasStructured ? Number(r.comissao_valor || 0) : Number(r.comissao || 0);
    const salario = Number(r.salario || 0);
    const adiantamento = Number(r.adiantamento || 0);
    const adiantManual = r.adiantamento_manual === true;
    const row: ItemRow = {
      id: r.id,
      funcionario_id: r.funcionario_id,
      nome: r.nome,
      cpf: r.cpf,
      salario,
      insalubridade: Number(r.insalubridade || 0),
      tem_comissao: r.tem_comissao === true || comissaoValor > 0 || Number(r.comissao_base || 0) > 0,
      comissao_base: Number(r.comissao_base || 0),
      comissao_percentual: Number(r.comissao_percentual || 0),
      comissao_valor: comissaoValor,
      hora_extra_50_horas: Number(r.hora_extra_50_horas || 0),
      hora_extra_50: Number(r.hora_extra_50 || 0),
      hora_extra_60_horas: Number(r.hora_extra_60_horas || 0),
      hora_extra_60: Number(r.hora_extra_60 || 0),
      hora_extra_100_horas: Number(r.hora_extra_100_horas || 0),
      hora_extra_100: Number(r.hora_extra_100 || 0),
      assistencia_medica: Number(r.assistencia_medica || 0),
      faltas_qtd: Number(r.faltas_qtd || 0),
      desconto_falta: Number(r.desconto_falta || r.falta_dsr || 0),
      dsr_qtd: Number(r.dsr_qtd || 0),
      desconto_dsr: Number(r.desconto_dsr || 0),
      adiantamento: adiantManual ? adiantamento : (adiantamento > 0 ? adiantamento : calcAdiantamentoAuto(salario)),
      adiantamento_manual: adiantManual,
      total: 0,
    };
    row.total = calcTotal(row);
    return row;
  };

  const montarItensCalculadosEmpresa = (empId: string, nomeEmpresa: string): ItemRow[] => {
    const compEmps = employees.filter(e => e.companyId === empId && e.status === 'ativo');
    const compEntries = entries.filter(e => e.companyId === empId && e.competencia === competencia);
    const empGO = usaHE60(nomeEmpresa);
    return compEmps.map(emp => {
      const ent = compEntries.find(e => e.employeeId === emp.id);
      const salario = Number(emp.salarioBase || 0);
      const insal = emp.insalubridadeAtiva ? Number(emp.insalubridadeValor || config.valorInsalubridade || 0) : 0;
      const valorHora = salario / 220;
      const heExtraHoras = Number(ent?.he50 || 0);
      const he100Horas = Number(ent?.he100 || 0);
      const pctDefault = defaultComissaoPct(nomeEmpresa, emp.name);
      const baseDefault = Number(ent?.comissaoBase || 0);
      const temComissao = pctDefault > 0 || baseDefault > 0;
      const row: ItemRow = {
        funcionario_id: emp.id,
        nome: emp.name,
        cpf: emp.cpf,
        salario,
        insalubridade: insal,
        tem_comissao: temComissao,
        comissao_base: baseDefault,
        comissao_percentual: pctDefault,
        comissao_valor: temComissao ? calcComissaoValor(baseDefault, pctDefault) : 0,
        hora_extra_50_horas: empGO ? 0 : heExtraHoras,
        hora_extra_50: empGO ? 0 : round2(heExtraHoras * valorHora * 1.5),
        hora_extra_60_horas: empGO ? heExtraHoras : 0,
        hora_extra_60: empGO ? round2(heExtraHoras * valorHora * 1.6) : 0,
        hora_extra_100_horas: he100Horas,
        hora_extra_100: round2(he100Horas * valorHora * 2),
        assistencia_medica: 0,
        faltas_qtd: Number(ent?.faltasDias || 0),
        desconto_falta: round2(Number(ent?.faltasDias || 0) * (salario / 30)),
        dsr_qtd: 0,
        desconto_dsr: 0,
        adiantamento: calcAdiantamentoAuto(salario),
        adiantamento_manual: false,
        total: 0,
      };
      row.total = calcTotal(row);
      return row;
    });
  };

  const carregarApontamentoEmpresa = async (empId: string) => {
    const emp = companies.find((c) => c.id === empId);
    if (!emp) throw new Error('Empresa nao encontrada');

    const { data: header } = await supabase
      .from('apontamentos_contabilidade')
      .select('*')
      .eq('company_id', empId)
      .eq('competencia', competencia)
      .maybeSingle();

    if (header) {
      const { data: itens, error } = await supabase
        .from('apontamentos_contabilidade_itens')
        .select('*')
        .eq('apontamento_id', (header as any).id)
        .order('nome');
      if (error) throw error;
      return {
        company: emp,
        apontamentoId: (header as any).id as string,
        items: ((itens as any[]) || []).map(montarLinhaSalva),
      };
    }

    await getOrCreateEntries(empId, competencia);
    return {
      company: emp,
      apontamentoId: undefined as string | undefined,
      items: montarItensCalculadosEmpresa(empId, emp.name),
    };
  };

  const imprimir = () => {
    if (!company) {
      toast.error('Selecione uma empresa antes de imprimir.');
      return false;
    }
    if (items.length === 0) {
      toast.error('Sem dados para imprimir.');
      return false;
    }

    const money = (value: number) => formatBRL(Number(value || 0));
    const hours = (value: number) =>
      `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`;
    const esc = (value: unknown) =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const titulo = `${company.name.toUpperCase().replace('TOPAC FILIAL ', 'TOPAC - ').replace('TOPAC ', 'TOPAC - ')} - APONTAMENTO - REF. ${formatCompetencia(competencia).toUpperCase()}`;
    const rows = items.map((r) => {
      const heQtd = isGO ? r.hora_extra_60_horas : r.hora_extra_50_horas;
      const heValor = isGO ? r.hora_extra_60 : r.hora_extra_50;
      return `
        <tr>
          <td class="nome">${esc(r.nome || '-')}</td>
          <td>${esc(r.cpf || '-')}</td>
          <td class="num">${money(r.salario)}</td>
          <td class="num">${money(r.insalubridade)}</td>
          <td class="num">${hours(heQtd)}</td>
          <td class="num">${money(heValor)}</td>
          <td class="num">${hours(r.hora_extra_100_horas)}</td>
          <td class="num">${money(r.hora_extra_100)}</td>
          <td class="num">${Number(r.faltas_qtd || 0).toLocaleString('pt-BR')}</td>
          <td class="num">${money(r.desconto_falta)}</td>
          <td class="num">${money(r.adiantamento)}</td>
          <td class="num total">${money(r.total)}</td>
        </tr>`;
    }).join('');

    const html = `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${esc(titulo)}</title>
          <style>
            @page { size: A4 landscape; margin: 6mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #000;
              background: #fff;
              font-family: Arial, Helvetica, sans-serif;
              font-size: 9px;
            }
            .page { width: 100%; }
            h1 {
              margin: 0 0 4px;
              text-align: center;
              font-size: 13px;
              line-height: 1.2;
              text-transform: uppercase;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th, td {
              border: 1px solid #111;
              padding: 3px 4px;
              line-height: 1.15;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            th {
              background: #e9e9e9;
              font-weight: 700;
              text-align: left;
            }
            .nome { width: 22%; }
            .num { text-align: right; }
            .total { font-weight: 700; }
            tfoot td {
              background: #efefef;
              font-weight: 700;
            }
            .rodape {
              margin-top: 6px;
              text-align: center;
              font-size: 8px;
            }
          </style>
        </head>
        <body>
          <main class="page">
            <h1>${esc(titulo)}</h1>
            <table>
              <thead>
                <tr>
                  <th class="nome">Nome</th>
                  <th>CPF</th>
                  <th>Salário</th>
                  <th>Insalub.</th>
                  <th>HE ${heLabelPct} Qtd</th>
                  <th>HE ${heLabelPct} Valor</th>
                  <th>HE 100% Qtd</th>
                  <th>HE 100% Valor</th>
                  <th>Faltas</th>
                  <th>Desc. Falta</th>
                  <th>Adiantamento</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <td colspan="11">TOTAL GERAL</td>
                  <td class="num">${money(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
            <div class="rodape">
              Total = Salário + Insalubridade + Comissão Valor + HE ${heLabelPct} + HE 100% - Assistência Médica - Desconto Falta - Desconto DSR - Adiantamento.
            </div>
          </main>
          <script>
            window.onload = function () {
              window.focus();
              setTimeout(function () { window.print(); }, 150);
            };
          </script>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'width=1280,height=900');
    if (!printWindow) {
      toast.error('O navegador bloqueou a janela de impressão.');
      return false;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
  };

  const exportarExcel = () => {
    const heLabel = isGO ? 'HE60' : 'HE50';
    const headers = [
      'Nome','CPF','Salario','Insalubridade',
      'Tem Comissao','Base Comissao','Comissao %','Comissao Valor',
      `${heLabel}-Horas`, `${heLabel}-Valor`,
      'HE100-Horas','HE100-Valor',
      'Assist.Medica','Faltas-Qtd','Desconto Falta','DSR-Qtd','Desconto DSR',
      'Adiantamento','Total'
    ];
    const rows = items.map(r => [
      r.nome, r.cpf,
      r.salario, r.insalubridade,
      r.tem_comissao ? 'Sim' : 'Não', r.comissao_base, r.comissao_percentual, r.comissao_valor,
      isGO ? r.hora_extra_60_horas : r.hora_extra_50_horas,
      isGO ? r.hora_extra_60 : r.hora_extra_50,
      r.hora_extra_100_horas, r.hora_extra_100,
      r.assistencia_medica, r.faltas_qtd, r.desconto_falta, r.dsr_qtd, r.desconto_dsr,
      r.adiantamento, r.total,
    ]);
    const csv = [headers, ...rows].map(l => l.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apontamento_${company?.name || ''}_${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const gerarPdfBlob = () => {
    if (!company) throw new Error('Selecione uma empresa');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 6;
    const rowH = 5;
    const heTitulo = isGO ? 'HE 60%' : 'HE 50%';
    const headers = ['Nome', 'CPF', 'Salario', 'Insalub.', `${heTitulo} Qtd`, `${heTitulo} Valor`, 'HE 100% Qtd', 'HE 100% Valor', 'Faltas', 'Desc. Falta', 'Adiant.', 'Total'];
    const widths = [46, 24, 21, 18, 18, 22, 19, 22, 13, 21, 21, 22];
    const money = (v: number) => formatBRL(Number(v || 0));
    const hours = (v: number) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`;
    const titulo = `${company.name.toUpperCase()} - APONTAMENTO - REF. ${formatCompetencia(competencia).toUpperCase()}`;
    let y = margin;

    const drawHeader = () => {
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(titulo, pageW / 2, y + 3, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Funcionarios: ${items.length}   Total: ${money(totalGeral)}   Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageW / 2, y + 7, { align: 'center' });
      y += 11;
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      let x = margin;
      headers.forEach((h, idx) => {
        doc.setFillColor(245, 245, 245);
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.rect(x, y, widths[idx], rowH, 'FD');
        doc.text(h, x + 1, y + 3.4);
        x += widths[idx];
      });
      y += rowH;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    };

    drawHeader();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);

    items.forEach((r) => {
      if (y + rowH > pageH - 12) {
        doc.addPage();
        y = margin;
        drawHeader();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
      }
      const heQtd = isGO ? r.hora_extra_60_horas : r.hora_extra_50_horas;
      const heValor = isGO ? r.hora_extra_60 : r.hora_extra_50;
      const values = [
        r.nome || '-',
        r.cpf || '-',
        money(r.salario),
        money(r.insalubridade),
        hours(heQtd),
        money(heValor),
        hours(r.hora_extra_100_horas),
        money(r.hora_extra_100),
        String(Number(r.faltas_qtd || 0)),
        money(r.desconto_falta),
        money(r.adiantamento),
        money(r.total),
      ];
      let x = margin;
      values.forEach((value, idx) => {
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.rect(x, y, widths[idx], rowH);
        const text = doc.splitTextToSize(String(value), widths[idx] - 2)[0] || '';
        doc.text(text, x + 1, y + 3.4);
        x += widths[idx];
      });
      y += rowH;
    });

    if (y + rowH > pageH - 12) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    doc.setFont('helvetica', 'bold');
    doc.rect(margin, y, widths.slice(0, 11).reduce((s, w) => s + w, 0), rowH);
    doc.text('TOTAL GERAL', margin + 1, y + 3.4);
    const totalX = margin + widths.slice(0, 11).reduce((s, w) => s + w, 0);
    doc.rect(totalX, y, widths[11], rowH);
    doc.text(money(totalGeral), totalX + 1, y + 3.4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}. Documento salvo no TOPAC RH PRO.`, margin, pageH - 5);
    return doc.output('blob');
  };

  const salvarPdfApontamento = async (pdfBlob?: Blob) => {
    if (!company) throw new Error('Selecione uma empresa');
    const blob = pdfBlob || gerarPdfBlob();
    const safeCompany = company.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const fileName = `apontamentos-contabilidade/${competencia}/${safeCompany}_${Date.now()}.pdf`;
    const { error } = await supabase.storage
      .from('documentos-ativos')
      .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('documentos-ativos').getPublicUrl(fileName);
    setUltimoPdfUrl(data.publicUrl);
    return data.publicUrl;
  };

  type GrupoApontamento = { company: any; apontamentoId?: string; items: ItemRow[] };

  const gerarPdfBlobLote = (grupos: GrupoApontamento[]) => {
    if (grupos.length === 0) throw new Error('Selecione ao menos uma empresa');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 6;
    const rowH = 5;
    const money = (v: number) => formatBRL(Number(v || 0));
    const hours = (v: number) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}h`;
    const widths = [46, 24, 21, 18, 18, 22, 19, 22, 13, 21, 21, 22];

    grupos.forEach((grupo, grupoIdx) => {
      if (grupoIdx > 0) doc.addPage();
      let y = margin;
      const grupoIsGO = usaHE60(grupo.company.name);
      const heTitulo = grupoIsGO ? 'HE 60%' : 'HE 50%';
      const headers = ['Nome', 'CPF', 'Salario', 'Insalub.', `${heTitulo} Qtd`, `${heTitulo} Valor`, 'HE 100% Qtd', 'HE 100% Valor', 'Faltas', 'Desc. Falta', 'Adiant.', 'Total'];
      const totalGrupo = round2(grupo.items.reduce((s, r) => s + Number(r.total || 0), 0));
      const titulo = `${grupo.company.name.toUpperCase()} - APONTAMENTO - REF. ${formatCompetencia(competencia).toUpperCase()}`;

      const drawHeader = () => {
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(titulo, pageW / 2, y + 3, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`Funcionarios: ${grupo.items.length}   Total: ${money(totalGrupo)}   Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageW / 2, y + 7, { align: 'center' });
        y += 11;
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        let x = margin;
        headers.forEach((h, idx) => {
          doc.setFillColor(245, 245, 245);
          doc.setTextColor(0, 0, 0);
          doc.setDrawColor(0, 0, 0);
          doc.rect(x, y, widths[idx], rowH, 'FD');
          doc.text(h, x + 1, y + 3.4);
          x += widths[idx];
        });
        y += rowH;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
      };

      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.3);

      grupo.items.forEach((r) => {
        if (y + rowH > pageH - 12) {
          doc.addPage();
          y = margin;
          drawHeader();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.3);
        }
        const heQtd = grupoIsGO ? r.hora_extra_60_horas : r.hora_extra_50_horas;
        const heValor = grupoIsGO ? r.hora_extra_60 : r.hora_extra_50;
        const values = [
          r.nome || '-',
          r.cpf || '-',
          money(r.salario),
          money(r.insalubridade),
          hours(heQtd),
          money(heValor),
          hours(r.hora_extra_100_horas),
          money(r.hora_extra_100),
          String(Number(r.faltas_qtd || 0)),
          money(r.desconto_falta),
          money(r.adiantamento),
          money(r.total),
        ];
        let x = margin;
        values.forEach((value, idx) => {
          doc.setTextColor(0, 0, 0);
          doc.setDrawColor(0, 0, 0);
          doc.rect(x, y, widths[idx], rowH);
          const text = doc.splitTextToSize(String(value), widths[idx] - 2)[0] || '';
          doc.text(text, x + 1, y + 3.4);
          x += widths[idx];
        });
        y += rowH;
      });

      if (y + rowH > pageH - 12) {
        doc.addPage();
        y = margin;
        drawHeader();
      }
      doc.setFont('helvetica', 'bold');
      doc.rect(margin, y, widths.slice(0, 11).reduce((s, w) => s + w, 0), rowH);
      doc.text('TOTAL GERAL', margin + 1, y + 3.4);
      const totalX = margin + widths.slice(0, 11).reduce((s, w) => s + w, 0);
      doc.rect(totalX, y, widths[11], rowH);
      doc.text(money(totalGrupo), totalX + 1, y + 3.4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}. Documento salvo no TOPAC RH PRO.`, margin, pageH - 5);
    });

    return doc.output('blob');
  };

  const abrirPdfBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const salvarPdfLote = async (blob: Blob, grupos: GrupoApontamento[]) => {
    const nomes = grupos.map((g) => g.company.name).join('_');
    const safeName = nomes.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120);
    const fileName = `apontamentos-contabilidade/${competencia}/LOTE_${safeName}_${Date.now()}.pdf`;
    const { error } = await supabase.storage
      .from('documentos-ativos')
      .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('documentos-ativos').getPublicUrl(fileName);
    setUltimoPdfUrl(data.publicUrl);
    return data.publicUrl;
  };

  const enviarParaContabilidade = async () => {
    if (!company) { toast.error('Selecione uma empresa'); return; }
    if (items.length === 0) { toast.error('Sem itens para enviar'); return; }

    const isGyn = /goi[âa]nia/i.test(company.name);
    let para: string[] = [];
    let cc: string[] = ['robson@topac.com.br'];

    if (isGyn) {
      para = ['gyn@topac.com.br', 'requisicao@incocontabilidade.com.br'];
    } else {
      para = [
        'marisa@aatconsultoria.com.br',
        'dp@aatconsultoria.com.br',
        'lucilene@aatconsultoria.com.br',
      ];
    }

    // 1) abre o PDF/preview do apontamento direto, sem gerar CSV.
    const pdfAberto = imprimir();
    if (!pdfAberto) return;
    const pdfBlob = gerarPdfBlob();
    let pdfUrl = '';
    try {
      pdfUrl = await salvarPdfApontamento(pdfBlob);
    } catch (e: any) {
      toast.error(`PDF nao foi salvo na plataforma: ${e.message || 'erro desconhecido'}`);
      return;
    }

    // 2) registra no histórico
    await registrarAcao({
      modulo: 'contabilidade',
      entidade: 'apontamento_contabilidade',
      entidadeId: apontamentoId || undefined,
      acao: 'enviou',
      depois: { para, cc, total_geral: totalGeral, itens: items.length, competencia, empresa: company.name, pdf_url: pdfUrl },
      arquivoUrl: pdfUrl,
      observacao: `Envio do apontamento ${formatCompetencia(competencia)} para contabilidade`,
    });

    const openEmailClient = (params: { to: string[]; cc: string[]; subject: string; body: string }) =>
      downloadEmailWithAttachment({
        ...params,
        attachmentBlob: pdfBlob,
        attachmentName: `Apontamento_${company.name}_${competencia}.pdf`.replace(/[^a-zA-Z0-9._-]+/g, '_'),
        fileName: `Email_Apontamento_${company.name}_${competencia}`,
      });

    // 3) abre o cliente de e-mail, no mesmo fluxo do pre-cadastro.
    window.setTimeout(() => {
      openEmailClient({
        to: para,
        cc,
        subject: `Apontamento Contabilidade - ${company.name} - ${formatCompetencia(competencia)}`,
        body:
        `Prezados,\n\nSegue em anexo o apontamento da folha referente a ${formatCompetencia(competencia)} da empresa ${company.name}.\n\n` +
        `Total geral: ${formatBRL(totalGeral)}\nQuantidade de funcionarios: ${items.length}\n\n` +
      `Atenciosamente,\nRodrigo De Souza Sabino`,
      });
    }, 900);
    toast.success('PDF salvo na plataforma, aberto e e-mail preenchido.');
  };

  const enviarLoteContabilidade = async () => {
    if (empresasLoteIds.length === 0) {
      toast.error('Selecione Matriz, Praia, LMT ou ALQUI para enviar em lote.');
      return;
    }

    setSaving(true);
    try {
      const grupos = (await Promise.all(empresasLoteIds.map((id) => carregarApontamentoEmpresa(id))))
        .filter((g) => g.items.length > 0);

      if (grupos.length === 0) {
        toast.error('Nenhum apontamento encontrado para as empresas selecionadas.');
        return;
      }

      const blob = gerarPdfBlobLote(grupos);
      abrirPdfBlob(blob);
      const pdfUrl = await salvarPdfLote(blob, grupos);

      const para = [
        'marisa@aatconsultoria.com.br',
        'dp@aatconsultoria.com.br',
        'lucilene@aatconsultoria.com.br',
      ];
      const cc = ['robson@topac.com.br'];
      const nomes = grupos.map((g) => g.company.name).join(', ');
      const totalLote = round2(grupos.reduce((s, g) => s + g.items.reduce((t, r) => t + Number(r.total || 0), 0), 0));
      const qtdFuncionarios = grupos.reduce((s, g) => s + g.items.length, 0);

      await registrarAcao({
        modulo: 'contabilidade',
        entidade: 'apontamento_contabilidade',
        entidadeId: grupos[0].apontamentoId || apontamentoId || undefined,
        acao: 'enviou',
        depois: {
          para,
          cc,
          total_geral: totalLote,
          itens: qtdFuncionarios,
          competencia,
          empresas: grupos.map((g) => g.company.name),
          pdf_url: pdfUrl,
        },
        arquivoUrl: pdfUrl,
        observacao: `Envio em lote do apontamento ${formatCompetencia(competencia)} para contabilidade`,
      });

      const openEmailClient = (params: { to: string[]; cc: string[]; subject: string; body: string }) =>
        downloadEmailWithAttachment({
          ...params,
          attachmentBlob: blob,
          attachmentName: `Apontamento_Lote_${competencia}.pdf`,
          fileName: `Email_Apontamento_Lote_${competencia}`,
        });

      window.setTimeout(() => {
        openEmailClient({
          to: para,
          cc,
          subject: `Apontamento Contabilidade - ${formatCompetencia(competencia)} - Matriz/Praia/LMT/ALQUI`,
          body:
            `Prezados,\n\nSegue em anexo o apontamento da folha referente a ${formatCompetencia(competencia)} das empresas: ${nomes}.\n\n` +
            `Total geral do lote: ${formatBRL(totalLote)}\nQuantidade de funcionarios: ${qtdFuncionarios}\n\n` +
            `Atenciosamente,\nRodrigo De Souza Sabino`,
        });
      }, 900);

      toast.success('PDF em lote salvo, aberto e e-mail preenchido.');
    } catch (e: any) {
      toast.error(`Erro no envio em lote: ${e.message || 'erro desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Impressao/PDF usa exclusivamente a janela criada por imprimir(). */}
      <style>{`
        @media print {
          body { display: none !important; }
        }
      `}</style>

      <div className="card-premium p-6 gradient-primary text-primary-foreground no-print">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Apontamento Contabilidade</h1>
            <p className="text-primary-foreground/70 text-sm">
              Sem VR, VT ou reembolso. Goiânia usa HE 60%, demais usam HE 50%. Adiantamento automático = 40% do salário.
            </p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 flex flex-wrap gap-3 items-end no-print">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[220px]">
            <option value="">Selecionar Empresa</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Competência</label>
          <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
        </div>
        <button onClick={recalcularTudo} disabled={items.length === 0}
          className="btn-secondary inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Recalcular apontamento
        </button>
        <button onClick={salvar} disabled={saving || !companyId}
          className="btn-primary inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </button>
        <button onClick={imprimir} className="btn-secondary inline-flex items-center gap-2"><Printer className="w-4 h-4" /> Imprimir / PDF</button>
        <button onClick={exportarExcel} className="btn-secondary inline-flex items-center gap-2"><FileText className="w-4 h-4" /> Exportar CSV</button>
        <button onClick={enviarParaContabilidade} disabled={!company || items.length === 0}
          className="btn-primary inline-flex items-center gap-2">
          <Send className="w-4 h-4" /> Enviar para Contabilidade
        </button>
        <div className="border border-border rounded-lg px-3 py-2 bg-background/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Enviar juntas:</span>
            {empresasLoteDisponiveis.map((c) => (
              <label key={c.id} className="inline-flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={empresasLoteIds.includes(c.id)}
                  onChange={(e) => {
                    setEmpresasLoteIds((prev) =>
                      e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter((id) => id !== c.id)
                    );
                  }}
                />
                {c.name}
              </label>
            ))}
            {empresasLoteDisponiveis.length > 0 && (
              <button
                type="button"
                onClick={() => setEmpresasLoteIds(empresasLoteDisponiveis.map((c) => c.id))}
                className="text-xs underline text-primary"
              >
                marcar todas
              </button>
            )}
          </div>
        </div>
        <button onClick={enviarLoteContabilidade} disabled={saving || empresasLoteIds.length === 0}
          className="btn-primary inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar selecionadas juntas
        </button>
        {ultimoPdfUrl && (
          <a href={ultimoPdfUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
            <FileText className="w-4 h-4" /> Abrir PDF salvo
          </a>
        )}
      </div>

      <div className="card-premium p-5 no-print">
        <div className="text-center border-b-2 border-foreground pb-2 mb-4">
          <h2 className="font-bold text-base uppercase">
            {company
              ? `${company.name.toUpperCase().replace('TOPAC FILIAL ', 'TOPAC - ').replace('TOPAC ', 'TOPAC - ')} - APONTAMENTO - Ref. ${formatCompetencia(competencia).toUpperCase()}`
              : 'APONTAMENTO'}
          </h2>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground p-6">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-center text-muted-foreground p-6">Selecione uma empresa.</p>
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <colgroup>
              <col style={{ width: '13%' }} />{/* Nome */}
              <col style={{ width: '8%' }} />{/* CPF */}
              <col style={{ width: '6%' }} />{/* Salário */}
              <col style={{ width: '5%' }} />{/* Insalub */}
              <col style={{ width: '3.5%' }} />{/* Tem com */}
              <col style={{ width: '6%' }} />{/* Base com */}
              <col style={{ width: '4%' }} />{/* Com % */}
              <col style={{ width: '5.5%' }} />{/* Com Valor */}
              <col style={{ width: '4%' }} />{/* HE h */}
              <col style={{ width: '5%' }} />{/* HE valor */}
              <col style={{ width: '4%' }} />{/* HE100 h */}
              <col style={{ width: '5%' }} />{/* HE100 valor */}
              <col style={{ width: '5%' }} />{/* Assist Med */}
              <col style={{ width: '3.5%' }} />{/* Faltas */}
              <col style={{ width: '5%' }} />{/* Desc Falta */}
              <col style={{ width: '3.5%' }} />{/* DSR Qtd */}
              <col style={{ width: '5%' }} />{/* Desc DSR */}
              <col style={{ width: '6%' }} />{/* Adiantamento */}
              <col style={{ width: '7%' }} />{/* Total */}
            </colgroup>
            <thead>
              <tr className="bg-muted/50 border-b border-foreground">
                <th className="px-2 py-2 text-left font-semibold border border-border">Nome</th>
                <th className="px-2 py-2 text-left font-semibold border border-border">CPF</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Salário</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Insalub.</th>
                <th className="px-2 py-2 text-center font-semibold border border-border">Tem Com.</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Base Com.</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Com. %</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Com. Valor</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">HE {heLabelPct} h</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">HE {heLabelPct}</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">HE 100% h</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">HE 100%</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Assist. Méd.</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Faltas</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Desc. Falta</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">DSR Qtd</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Desc. DSR</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Adiantamento</th>
                <th className="px-2 py-2 text-right font-semibold border border-border">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r, idx) => (
                <tr key={idx} className="border-b border-border">
                  <td className="px-2 py-1 border border-border whitespace-nowrap">{r.nome}</td>
                  <td className="px-2 py-1 border border-border font-mono">{r.cpf}</td>
                  <td className="px-1 py-1 border border-border text-right">
                    <CurrencyInput value={r.salario} onCommit={(n) => updateRow(idx, { salario: n })}
                      className="w-24 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    <CurrencyInput value={r.insalubridade} onCommit={(n) => updateRow(idx, { insalubridade: n })}
                      className="w-20 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-center">
                    <input type="checkbox" checked={r.tem_comissao}
                      onChange={(e) => updateRow(idx, { tem_comissao: e.target.checked })} />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    <CurrencyInput value={r.comissao_base} onCommit={(n) => updateRow(idx, { comissao_base: n })}
                      className="w-28 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px] disabled:opacity-50"
                      />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    <PercentInput value={r.comissao_percentual} onCommit={(n) => updateRow(idx, { comissao_percentual: n })}
                      className="w-14 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right font-semibold">
                    {formatBRL(r.comissao_valor)}
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    <NumberInput
                      value={isGO ? r.hora_extra_60_horas : r.hora_extra_50_horas}
                      onCommit={(n) => updateRow(idx, isGO ? { hora_extra_60_horas: n } : { hora_extra_50_horas: n })}
                      className="w-14 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    {formatBRL(isGO ? r.hora_extra_60 : r.hora_extra_50)}
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    <NumberInput value={r.hora_extra_100_horas} onCommit={(n) => updateRow(idx, { hora_extra_100_horas: n })}
                      className="w-14 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">{formatBRL(r.hora_extra_100)}</td>
                  <td className="px-1 py-1 border border-border text-right">
                    <CurrencyInput value={r.assistencia_medica} onCommit={(n) => updateRow(idx, { assistencia_medica: n })}
                      className="w-20 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">
                    <NumberInput value={r.faltas_qtd} onCommit={(n) => updateRow(idx, { faltas_qtd: n })}
                      className="w-12 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">{formatBRL(r.desconto_falta)}</td>
                  <td className="px-1 py-1 border border-border text-right">
                    <NumberInput value={r.dsr_qtd} onCommit={(n) => updateRow(idx, { dsr_qtd: n })}
                      className="w-12 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-1 py-1 border border-border text-right">{formatBRL(r.desconto_dsr)}</td>
                  <td className="px-1 py-1 border border-border text-right">
                    <CurrencyInput value={r.adiantamento}
                      onCommit={(n) => updateRow(idx, { adiantamento: n, adiantamento_manual: true })}
                      className="w-24 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]" />
                  </td>
                  <td className="px-2 py-1 border border-border text-right font-bold">{formatBRL(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-bold">
                <td colSpan={18} className="px-2 py-2 border border-border text-right">TOTAL GERAL</td>
                <td className="px-2 py-2 border border-border text-right">{formatBRL(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <p className="text-[10px] text-muted-foreground mt-4 text-center">
          Documento para conferência da contabilidade. Não inclui VR, VT nem reembolso.
          Total = Salário + Insalubridade + Comissão Valor + HE {heLabelPct} + HE 100% − Assistência Médica − Desconto Falta − Desconto DSR − Adiantamento.
        </p>
      </div>
    </div>
  );
};

export default ApontamentoContabilidadePage;
