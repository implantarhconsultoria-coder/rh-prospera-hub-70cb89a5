import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { getPreviousCompetencia } from '@/lib/benefitReports';
import { useBenefitMedicalLeaves } from '@/hooks/useBenefitMedicalLeaves';
import { getWorkingDays } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Download, Printer, RefreshCw } from 'lucide-react';

type SnapshotRow = {
  employee_id: string;
  employee_name: string;
  valor_total?: number;
  dias_previstos?: number;
  dias_descontados?: number;
  dias_finais?: number;
  motivo?: string | null;
  pendencia_conferencia?: boolean;
};

type Generation = {
  company_id: string;
  tipo: 'vr' | 'vt';
  competencia: string;
  report_snapshot: SnapshotRow[] | null;
  generated_at: string;
};

type ImportedAbsence = {
  funcionario_id: string;
  faltas_dias: number | null;
  status_conferencia: string | null;
  observacoes: string | null;
  company_id?: string | null;
  updated_at?: string | null;
};

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const money = (value: number) => value.toFixed(2).replace('.', ',');
const safeName = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');

const ConsolidadoBeneficiosPage: React.FC = () => {
  const { companies, employees } = useApp();
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [companyId, setCompanyId] = useState('todas');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [absences, setAbsences] = useState<ImportedAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const medical = useBenefitMedicalLeaves(competencia);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [gen, entries] = await Promise.all([
          supabase.from('benefit_generations')
            .select('company_id,tipo,competencia,report_snapshot,generated_at')
            .eq('competencia', competencia),
          supabase.from('lancamentos_mensais')
            .select('funcionario_id,company_id,faltas_dias,status_conferencia,observacoes,updated_at')
            .eq('competencia', getPreviousCompetencia(competencia))
            .is('apagado_em', null),
        ]);
        if (gen.error) throw gen.error;
        if (entries.error) throw entries.error;
        if (!cancelled) {
          setGenerations((gen.data || []).map(row => ({ ...row, report_snapshot: Array.isArray(row.report_snapshot) ? row.report_snapshot as unknown as SnapshotRow[] : [] })) as Generation[]);
          setAbsences(entries.data || []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Falha ao consultar o consolidado.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [competencia, reload]);

  const absencesById = useMemo(() => new Map(absences.map(a => [a.funcionario_id, a])), [absences]);
  const rows = useMemo(() => {
    const aggregated = new Map<string, {
      companyId: string;
      employeeId: string;
      nome: string;
      vr: number;
      vt: number;
      diasVR: number;
      diasVT: number;
      descontoVR: number;
      descontoVT: number;
      temVR: boolean;
      temVT: boolean;
      motivos: string[];
    }>();
    for (const generation of generations) {
      if (companyId !== 'todas' && generation.company_id !== companyId) continue;
      for (const record of generation.report_snapshot || []) {
        if (!record?.employee_id) continue;
        const key = `${generation.company_id}|${record.employee_id}`;
        const item = aggregated.get(key) || {
          companyId: generation.company_id,
          employeeId: record.employee_id,
          nome: record.employee_name || '',
          vr: 0, vt: 0, diasVR: 0, diasVT: 0,
          descontoVR: 0, descontoVT: 0,
          temVR: false, temVT: false, motivos: [],
        };
        const value = Math.max(0, Number(record.valor_total || 0));
        if (generation.tipo === 'vr') {
          item.vr = value; item.temVR = true;
          item.diasVR = Number(record.dias_finais || 0);
          item.descontoVR = Number(record.dias_descontados || 0);
        } else if (generation.tipo === 'vt') {
          item.vt = value; item.temVT = true;
          item.diasVT = Number(record.dias_finais || 0);
          item.descontoVT = Number(record.dias_descontados || 0);
        }
        if (record.motivo) item.motivos.push(record.motivo);
        aggregated.set(key, item);
      }
    }
    return [...aggregated.values()].map(r => {
      const employee = employees.find(e => e.id === r.employeeId);
      const imported = absencesById.get(r.employeeId);
      const pendente = Boolean(
        imported && Number(imported.faltas_dias || 0) > 0 &&
        imported.observacoes?.includes('[PONTO_MECANICOS]') &&
        imported.status_conferencia !== 'conferido'
      );
      return {
        ...r,
        empresa: companies.find(c => c.id === r.companyId)?.name || 'Empresa não identificada',
        cpf: employee?.cpf || '',
        banco: employee?.banco || '',
        agencia: employee?.agencia || '',
        conta: employee?.conta || '',
        pix: employee?.pix || '',
        pendente,
        total: Math.round((r.vr + r.vt) * 100) / 100,
      };
    }).sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [generations, companyId, companies, employees, absencesById]);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    vr: a.vr + r.vr, vt: a.vt + r.vt, total: a.total + r.total,
  }), { vr: 0, vt: 0, total: 0 }), [rows]);
  const companiesSelected = companyId === 'todas' ? companies : companies.filter(c => c.id === companyId);
  const missingGenerations = companiesSelected.flatMap(c => (['vr', 'vt'] as const)
    .filter(tipo => !generations.some(g => g.company_id === c.id && g.tipo === tipo))
    .map(tipo => `${c.name}: ${tipo.toUpperCase()}`));
  const pendencias = rows.filter(r => r.pendente).length;
  const atestadosPendentesSelecionados = companiesSelected.reduce((count, c) => count + (medical.pendentesPorEmpresa[c.id] || 0), 0);
  const stale = generations.some(g => (companyId === 'todas' || companyId === g.company_id)
    && absences.some(a => a.company_id === g.company_id && a.updated_at
      && new Date(a.updated_at).getTime() > new Date(g.generated_at).getTime()));
  const companyTotals = companiesSelected.map(c => {
    const group = rows.filter(r => r.companyId === c.id);
    return {
      id: c.id, name: c.name, employees: group.length,
      vr: group.reduce((n, r) => n + r.vr, 0),
      vt: group.reduce((n, r) => n + r.vt, 0),
      total: group.reduce((n, r) => n + r.total, 0),
    };
  });
  const ready = !loading && !medical.loading && !error && !medical.error
    && missingGenerations.length === 0 && pendencias === 0 && !stale
    && atestadosPendentesSelecionados === 0 && rows.length > 0;
  const status = ready ? 'CONFERÊNCIA TÉCNICA SEM PENDÊNCIAS' : 'PRÉVIA — NÃO LIBERADA PARA PAGAMENTO';
  const days = getWorkingDays(competencia);

  const exportCsv = () => {
    if (!ready) return;
    const header = ['Empresa', 'Funcionário', 'CPF', 'Banco', 'Agência', 'Conta', 'PIX',
      'Competência', 'Dias VR', 'Desconto VR (dias)', 'VR (R$)', 'Dias VT', 'Desconto VT (dias)',
      'VT (R$)', 'Total (R$)', 'Situação', 'Motivos'];
    const data = rows.map(r => [
      r.empresa, r.nome, r.cpf, r.banco, r.agencia, r.conta, r.pix, competencia,
      r.diasVR, r.descontoVR, money(r.vr), r.diasVT, r.descontoVT, money(r.vt),
      money(r.total), r.pendente ? 'PENDÊNCIA PONTO' : (ready ? 'CONFERIDO' : 'CONFERÊNCIA PENDENTE'),
      r.motivos.join(' | '),
    ]);
    const lines = [header, ...data].map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', lines], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `TOPAC_Consolidado_Pagamento_VR_VT_${safeName(competencia)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5 p-4 md:p-7">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Consolidado de pagamento — VR + VT</h1>
          <p className="text-sm text-muted-foreground">Resumo por empresa e colaborador, com dados bancários e memória de desconto.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReload(n => n + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />Atualizar
          </Button>
          <Button variant="outline" disabled={!ready} onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />CSV após conferência
          </Button>
          <Button variant="outline" disabled={!ready} onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />PDF após conferência
          </Button>
        </div>
      </div>
      <div className="print:hidden flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">Competência
          <Input className="mt-1" type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
        </label>
        <label className="text-xs font-semibold">Empresa
          <select className="mt-1 block h-10 min-w-[230px] rounded-md border border-input bg-background px-3"
            value={companyId} onChange={e => setCompanyId(e.target.value)}>
            <option value="todas">Todas as empresas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="border-b pb-4">
        <div className="flex items-center gap-2 font-semibold">
          {!ready && <AlertTriangle className="h-5 w-5 text-amber-500" />}
          {status}
        </div>
        <p className="text-sm text-muted-foreground">Competência {competencia} · Dias úteis referenciais {days} · Total de funcionários {rows.length}</p>
        {(error || medical.error) && <p className="text-red-500">Erro: {error || medical.error}</p>}
        {missingGenerations.length > 0 && <p className="text-sm text-amber-500">Benefícios ainda não gerados: {missingGenerations.join('; ')}</p>}
        {pendencias > 0 && <p className="text-sm text-amber-500">{pendencias} funcionário(s) com lançamentos de ponto pendentes de conferência.</p>}
        {stale && <p className="text-sm text-amber-500">O fechamento foi alterado após a geração. Gere VR e VT novamente antes de pagar.</p>}
        {atestadosPendentesSelecionados > 0 && <p className="text-sm text-amber-500">{atestadosPendentesSelecionados} atestado(s) das empresas selecionadas sem intervalo validado na competência anterior.</p>}
        <p className="text-xs text-muted-foreground">Totais refletem os snapshots já gerados. Alterações na conferência exigem nova geração. Não substitui autorização financeira.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">VR consolidado</div><div className="text-xl font-bold">{formatCurrency(totals.vr)}</div></div>
        <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">VT consolidado</div><div className="text-xl font-bold">{formatCurrency(totals.vt)}</div></div>
        <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">Total geral</div><div className="text-xl font-bold">{formatCurrency(totals.total)}</div></div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <h2 className="px-3 py-2 font-semibold">Resumo por empresa</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-muted"><tr>
            {['Empresa','Funcionários','VR','VT','Total a pagar'].map(name => <th key={name} className="border-b p-2">{name}</th>)}
          </tr></thead>
          <tbody>
            {companyTotals.map(company => <tr key={company.id} className="border-b">
              <td className="p-2">{company.name}</td><td className="p-2">{company.employees}</td>
              <td className="p-2">{formatCurrency(company.vr)}</td>
              <td className="p-2">{formatCurrency(company.vt)}</td>
              <td className="p-2 font-bold">{formatCurrency(company.total)}</td>
            </tr>)}
            <tr className="font-bold"><td className="p-2" colSpan={2}>TOTAL GERAL</td>
              <td className="p-2">{formatCurrency(totals.vr)}</td>
              <td className="p-2">{formatCurrency(totals.vt)}</td>
              <td className="p-2">{formatCurrency(totals.total)}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-lg border print:overflow-visible">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>{['Empresa','Funcionário','Banco/PIX','Dias VR','VR','Dias VT','VT','Total','Situação'].map(label =>
              <th key={label} className="whitespace-nowrap border-b px-2 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.companyId + r.employeeId} className="border-b">
                <td className="px-2 py-2">{r.empresa}</td>
                <td className="px-2 py-2"><b>{r.nome}</b><div className="text-muted-foreground">{r.cpf}</div></td>
                <td className="px-2 py-2">{r.banco} {r.agencia} {r.conta}<div>{r.pix}</div></td>
                <td className="px-2 py-2">{r.temVR ? r.diasVR : '—'}{r.descontoVR ? <small className="block">(-{r.descontoVR})</small> : null}</td>
                <td className="px-2 py-2">{r.temVR ? formatCurrency(r.vr) : '—'}</td>
                <td className="px-2 py-2">{r.temVT ? r.diasVT : '—'}{r.descontoVT ? <small className="block">(-{r.descontoVT})</small> : null}</td>
                <td className="px-2 py-2">{r.temVT ? formatCurrency(r.vt) : '—'}</td>
                <td className="px-2 py-2 font-semibold">{formatCurrency(r.total)}</td>
                <td className="px-2 py-2">{r.pendente ? 'PONTO NÃO CONFERIDO' : (!ready ? 'REVISAR' : 'PRONTO PARA CONFERÊNCIA FINAL')}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="p-6 text-center">{loading ? 'Carregando lançamentos...' : 'Nenhum pagamento gerado nesta competência.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default ConsolidadoBeneficiosPage;
