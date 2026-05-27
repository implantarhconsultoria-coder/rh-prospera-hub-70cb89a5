import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Save, Printer, FileText, Loader2, RefreshCw, Send } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCompetencia } from '@/lib/workingDays';
import { registrarAcao } from '@/lib/acoesLog';
import { parseCurrencyBR, formatBRL } from '@/lib/currencyMask';
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

  const company = companies.find(c => c.id === companyId);
  const isGO = !!company && usaHE60(company.name);
  const heLabelPct = isGO ? '60%' : '50%';

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

  const imprimir = () => window.print();

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

  const enviarParaContabilidade = async () => {
    if (!company) { toast.error('Selecione uma empresa'); return; }
    if (items.length === 0) { toast.error('Sem itens para enviar'); return; }

    const isGyn = /goi[âa]nia/i.test(company.name);
    let para: string[] = [];
    let cc: string[] = ['robson@topac.com.br'];

    if (isGyn) {
      para = ['gyn@topac.com.br', 'requisicao@incocontabilidade.com.br'];
    } else {
      const { data: cfg } = await supabase
        .from('config_emails_contabilidade' as any)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const c = (cfg as any) || {};
      if (c.email_marisa) para.push(c.email_marisa);
      if (c.email_robson && !cc.includes(c.email_robson)) cc.push(c.email_robson);
      if (c.emails_copia) {
        c.emails_copia.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
          .forEach((e: string) => { if (!cc.includes(e)) cc.push(e); });
      }
      if (para.length === 0) {
        toast.error('Configure os e-mails da contabilidade em Configurações → E-mails Contabilidade');
        return;
      }
    }

    // 1) gera e baixa o CSV automaticamente para anexar
    exportarExcel();

    // 2) registra no histórico
    await registrarAcao({
      modulo: 'contabilidade',
      entidade: 'apontamento_contabilidade',
      entidadeId: apontamentoId || undefined,
      acao: 'enviou',
      depois: { para, cc, total_geral: totalGeral, itens: items.length, competencia, empresa: company.name },
      observacao: `Envio do apontamento ${formatCompetencia(competencia)} para contabilidade`,
    });

    // 3) abre o cliente de e-mail
    const subject = encodeURIComponent(`Apontamento Contabilidade - ${company.name} - ${formatCompetencia(competencia)}`);
    const body = encodeURIComponent(
      `Prezados,\n\nSegue em anexo o apontamento da folha referente a ${formatCompetencia(competencia)} da empresa ${company.name}.\n\n` +
      `Total geral: ${formatBRL(totalGeral)}\nQuantidade de funcionários: ${items.length}\n\n` +
      `IMPORTANTE: o arquivo do apontamento foi baixado automaticamente em seu computador. Por favor, anexe-o a este e-mail antes de enviar.\n\n` +
      `Atenciosamente,\nDepartamento Pessoal - TOPAC`
    );
    const mailto = `mailto:${para.join(',')}?cc=${cc.join(',')}&subject=${subject}&body=${body}`;
    window.location.href = mailto;
    toast.success('Arquivo baixado. Anexe ao e-mail antes de enviar.');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* CSS de impressão A4 paisagem — espelha a tela em uma única tabela */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .apont-print, .apont-print * { visibility: visible !important; }
          .apont-print {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important; max-width: 100% !important;
            margin: 0 !important; padding: 0 !important;
            transform: none !important; zoom: 1 !important;
            box-shadow: none !important; border: none !important;
            background: #fff !important; color: #000 !important;
            overflow: visible !important;
            max-height: none !important;
          }
          /* Garante que nenhum wrapper esconda colunas */
          .apont-print, .apont-print * { overflow: visible !important; max-height: none !important; }
          .apont-print table {
            width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 7.5px !important;
          }
          .apont-print th, .apont-print td {
            padding: 1px 2px !important;
            border: 1px solid #000 !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            line-height: 1.15 !important;
          }
          /* Inputs viram texto puro na impressão */
          .apont-print input {
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 7.5px !important;
            background: transparent !important;
            width: 100% !important;
            min-width: 0 !important;
            text-align: inherit !important;
            color: #000 !important;
            -webkit-appearance: none !important;
            appearance: none !important;
          }
          .apont-print input[type="checkbox"] { width: 8px !important; height: 8px !important; }
          .apont-print thead { display: table-header-group !important; }
          .apont-print tfoot { display: table-footer-group !important; }
          .apont-print tr { page-break-inside: avoid !important; }
          .no-print, aside, nav, header, .sidebar, .lovable-badge, [data-sonner-toaster] { display: none !important; }
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
      </div>

      <div className="card-premium p-5 apont-print">
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
