import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Save, Printer, FileText, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/calculations';
import { formatCompetencia } from '@/lib/workingDays';
import { registrarAcao } from '@/lib/acoesLog';
import { toast } from 'sonner';

/** Decide o percentual de hora extra extra padrão da empresa (50% ou 60%). */
const usaHE60 = (nomeEmpresa: string) =>
  /goi[âa]nia/i.test(nomeEmpresa || '');

interface ItemRow {
  id?: string;
  funcionario_id?: string | null;
  nome: string;
  cpf: string;
  salario: number;
  insalubridade: number;
  comissao: number;
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
  total: number;
}

const calcTotal = (r: ItemRow) =>
  Number(r.salario || 0) +
  Number(r.insalubridade || 0) +
  Number(r.comissao || 0) +
  Number(r.hora_extra_50 || 0) +
  Number(r.hora_extra_60 || 0) +
  Number(r.hora_extra_100 || 0) -
  Number(r.assistencia_medica || 0) -
  Number(r.desconto_falta || 0) -
  Number(r.desconto_dsr || 0) -
  Number(r.adiantamento || 0);

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
          const row: ItemRow = {
            id: r.id,
            funcionario_id: r.funcionario_id,
            nome: r.nome,
            cpf: r.cpf,
            salario: Number(r.salario || 0),
            insalubridade: Number(r.insalubridade || 0),
            comissao: Number(r.comissao || 0),
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
            adiantamento: Number(r.adiantamento || 0),
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
          const comissao = Number(ent?.comissaoBase || 0);
          const valorHora = salario / 220;
          // ent.he50 representa horas extras "padrão" do fechamento; em GO interpretamos como 60%
          const heExtraHoras = Number(ent?.he50 || 0);
          const he100Horas = Number(ent?.he100 || 0);
          const he50Valor = !empGO ? Math.round(heExtraHoras * valorHora * 1.5 * 100) / 100 : 0;
          const he60Valor = empGO ? Math.round(heExtraHoras * valorHora * 1.6 * 100) / 100 : 0;
          const he100Valor = Math.round(he100Horas * valorHora * 2 * 100) / 100;
          const faltasQtd = Number(ent?.faltasDias || 0);
          const descFalta = Math.round(faltasQtd * (salario / 30) * 100) / 100;
          const r: ItemRow = {
            funcionario_id: emp.id,
            nome: emp.name,
            cpf: emp.cpf,
            salario,
            insalubridade: insal,
            comissao,
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
            adiantamento: 0,
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
    () => items.reduce((s, r) => s + Number(r.total || 0), 0),
    [items],
  );

  const updateField = (idx: number, field: keyof ItemRow, value: number) => {
    setItems(prev => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value } as ItemRow;
      // recalcular automaticamente valor a partir das horas quando o usuário edita as horas
      const valorHora = Number(row.salario || 0) / 220;
      if (field === 'hora_extra_50_horas')
        row.hora_extra_50 = Math.round(value * valorHora * 1.5 * 100) / 100;
      if (field === 'hora_extra_60_horas')
        row.hora_extra_60 = Math.round(value * valorHora * 1.6 * 100) / 100;
      if (field === 'hora_extra_100_horas')
        row.hora_extra_100 = Math.round(value * valorHora * 2 * 100) / 100;
      if (field === 'faltas_qtd')
        row.desconto_falta = Math.round(value * (Number(row.salario) / 30) * 100) / 100;
      if (field === 'dsr_qtd')
        row.desconto_dsr = Math.round(value * (Number(row.salario) / 30) * 100) / 100;
      row.total = calcTotal(row);
      next[idx] = row;
      return next;
    });
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
        comissao: r.comissao,
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
        falta_dsr: r.desconto_falta + r.desconto_dsr, // compatibilidade
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
    const headers = isGO
      ? ['Nome','CPF','Salario','Insalubridade','Comissao','HE60-Horas','HE60-Valor','HE100-Horas','HE100-Valor','Assist.Medica','Faltas-Qtd','Desconto Falta','DSR-Qtd','Desconto DSR','Adiantamento','Total']
      : ['Nome','CPF','Salario','Insalubridade','Comissao','HE50-Horas','HE50-Valor','HE100-Horas','HE100-Valor','Assist.Medica','Faltas-Qtd','Desconto Falta','DSR-Qtd','Desconto DSR','Adiantamento','Total'];
    const rows = items.map(r => isGO
      ? [r.nome,r.cpf,r.salario,r.insalubridade,r.comissao,r.hora_extra_60_horas,r.hora_extra_60,r.hora_extra_100_horas,r.hora_extra_100,r.assistencia_medica,r.faltas_qtd,r.desconto_falta,r.dsr_qtd,r.desconto_dsr,r.adiantamento,r.total]
      : [r.nome,r.cpf,r.salario,r.insalubridade,r.comissao,r.hora_extra_50_horas,r.hora_extra_50,r.hora_extra_100_horas,r.hora_extra_100,r.assistencia_medica,r.faltas_qtd,r.desconto_falta,r.dsr_qtd,r.desconto_dsr,r.adiantamento,r.total]);
    const csv = [headers, ...rows].map(l => l.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apontamento_${company?.name || ''}_${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Colunas dinâmicas conforme empresa
  const headerLabels = isGO
    ? ['Nome','CPF','Salário','Insalubridade','Comissão','H. Extra 60% Horas','H. Extra 60% Valor','H. Extra 100% Horas','H. Extra 100% Valor','Assist. Médica','Faltas Qtd','Desconto Falta','DSR Qtd','Desconto DSR','Adiantamento','Total']
    : ['Nome','CPF','Salário','Insalubridade','Comissão','H. Extra 50% Horas','H. Extra 50% Valor','H. Extra 100% Horas','H. Extra 100% Valor','Assist. Médica','Faltas Qtd','Desconto Falta','DSR Qtd','Desconto DSR','Adiantamento','Total'];

  type FieldKey = keyof ItemRow;
  const editableFields: FieldKey[] = isGO
    ? ['salario','insalubridade','comissao','hora_extra_60_horas','hora_extra_60','hora_extra_100_horas','hora_extra_100','assistencia_medica','faltas_qtd','desconto_falta','dsr_qtd','desconto_dsr','adiantamento']
    : ['salario','insalubridade','comissao','hora_extra_50_horas','hora_extra_50','hora_extra_100_horas','hora_extra_100','assistencia_medica','faltas_qtd','desconto_falta','dsr_qtd','desconto_dsr','adiantamento'];

  return (
    <div className="space-y-5 animate-fade-in">
      <style>{`@media print {
        .no-print { display: none !important; }
        body { background: white !important; }
        .print-area { padding: 0 !important; }
        @page { size: A4 landscape; margin: 10mm; }
      }`}</style>
      <div className="card-premium p-6 gradient-primary text-primary-foreground no-print">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Apontamento Contabilidade</h1>
            <p className="text-primary-foreground/70 text-sm">
              Conferência da contabilidade — sem VR, VT ou reembolso. Goiânia usa HE 60%, demais usam HE 50%.
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
        <button onClick={salvar} disabled={saving || !companyId}
          className="btn-primary inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </button>
        <button onClick={imprimir} className="btn-secondary inline-flex items-center gap-2"><Printer className="w-4 h-4" /> Imprimir / PDF</button>
        <button onClick={exportarExcel} className="btn-secondary inline-flex items-center gap-2"><FileText className="w-4 h-4" /> Exportar CSV</button>
      </div>

      <div className="card-premium p-5 print-area">
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
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-foreground">
                  {headerLabels.map(h => (
                    <th key={h} className="px-2 py-2 text-left font-semibold border border-border whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="px-2 py-1 border border-border whitespace-nowrap">{r.nome}</td>
                    <td className="px-2 py-1 border border-border font-mono">{r.cpf}</td>
                    {editableFields.map(field => (
                      <td key={String(field)} className="px-1 py-1 border border-border">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={Number(r[field] as number) || 0}
                          onChange={e => updateField(idx, field, Number(e.target.value.replace(',', '.')) || 0)}
                          className="w-20 bg-transparent border border-border rounded px-1 py-0.5 text-right text-[11px]"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 border border-border text-right font-bold">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted font-bold">
                  <td colSpan={headerLabels.length - 1} className="px-2 py-2 border border-border text-right">TOTAL GERAL</td>
                  <td className="px-2 py-2 border border-border text-right">{formatCurrency(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground mt-4 text-center">
          Documento para conferência da contabilidade. Não inclui VR, VT nem reembolso.
          Total considera salário, insalubridade, comissão, valores de horas extras e descontos de assistência médica, faltas/DSR e adiantamento.
        </p>
      </div>
    </div>
  );
};

export default ApontamentoContabilidadePage;
