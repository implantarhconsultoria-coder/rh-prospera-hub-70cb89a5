import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getPreviousCompetencia, onlyBenefitForPayment } from '@/lib/benefitReports';
import { useBenefitMedicalLeaves } from '@/hooks/useBenefitMedicalLeaves';
import { getWorkingDays } from '@/lib/workingDays';
import { formatCurrency } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Download, Printer, RefreshCw } from 'lucide-react';

type BenefitType = 'vr' | 'vt';

type SnapshotRow = {
  employee_id: string;
  employee_name: string;
  valor_total?: number;
  valor_diario?: number;
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

const ConsolidadoBeneficiosPage: React.FC<{ tipo: BenefitType; embutido?: boolean; competenciaInicial?: string }> = ({ tipo, embutido = false, competenciaInicial }) => {
  const { companies, employees } = useApp();
  const tituloBeneficio = tipo === 'vr' ? 'Vale-Refeição' : 'Vale-Transporte';
  const sigla = tipo.toUpperCase();
  const [searchParams] = useSearchParams();
  const selectedMonth = competenciaInicial || searchParams.get('competencia');
  const initialCompetencia = selectedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)
    ? selectedMonth : new Date().toISOString().slice(0, 7);
  const [competencia, setCompetencia] = useState(initialCompetencia);
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
            .eq('competencia', competencia)
            .eq('tipo', tipo),
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
  }, [competencia, reload, tipo]);

  const absencesById = useMemo(() => new Map(absences.map(a => [a.funcionario_id, a])), [absences]);
  const rows = useMemo(() => {
    const all = onlyBenefitForPayment(generations, tipo)
      .filter(g => companyId === 'todas' || g.company_id === companyId)
      .flatMap(g => (g.report_snapshot || []).filter(r => Boolean(r?.employee_id)).map(r => {
        const employee = employees.find(e => e.id === r.employee_id);
        const imported = absencesById.get(r.employee_id);
        const pendentePonto = Boolean(imported
          && Number(imported.faltas_dias || 0) > 0
          && imported.observacoes?.includes('[PONTO_MECANICOS]')
          && imported.status_conferencia !== 'conferido');
        return {
          companyId: g.company_id,
          employeeId: r.employee_id,
          nome: r.employee_name || employee?.name || '',
          empresa: companies.find(c => c.id === g.company_id)?.name || 'Empresa não identificada',
          cpf: employee?.cpf || '',
          banco: employee?.banco || '',
          agencia: employee?.agencia || '',
          conta: employee?.conta || '',
          pix: employee?.pix || '',
          valorDiario: Number(r.valor_diario || 0),
          diasPrevistos: Number(r.dias_previstos || 0),
          diasDescontados: Number(r.dias_descontados || 0),
          diasFinais: Number(r.dias_finais || 0),
          valor: Math.max(0, Number(r.valor_total || 0)),
          motivo: String(r.motivo || ''),
          pendente: pendentePonto || r.pendencia_conferencia === true,
        };
      }));
    return all.sort((a, b) =>
      a.empresa.localeCompare(b.empresa, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [generations, tipo, companyId, employees, companies, absencesById]);

  const companiesSelected = companyId === 'todas' ? companies.filter(c => c.status === 'ativa') : companies.filter(c => c.id === companyId);
  const missingGenerations = companiesSelected
    .filter(c => !generations.some(g => g.company_id === c.id && g.tipo === tipo))
    .map(c => c.name);
  const pendencias = rows.filter(r => r.pendente).length;
  const atestadosPendentesSelecionados = companiesSelected.reduce(
    (n, c) => n + (medical.pendentesPorEmpresa[c.id] || 0), 0);
  const stale = generations.some(g =>
    g.tipo === tipo && (companyId === 'todas' || companyId === g.company_id)
    && absences.some(a => a.company_id === g.company_id && a.updated_at
      && new Date(a.updated_at).getTime() > new Date(g.generated_at).getTime()));
  const summary = companiesSelected.map(c => {
    const subset = rows.filter(r => r.companyId === c.id);
    return {
      id: c.id,
      nome: c.name,
      pessoas: subset.length,
      diasDescontados: subset.reduce((n, r) => n + r.diasDescontados, 0),
      valor: subset.reduce((n, r) => n + r.valor, 0),
    };
  });
  const total = rows.reduce((n, row) => n + row.valor, 0);
  const diasAbatidos = rows.reduce((n, row) => n + row.diasDescontados, 0);
  const ready = !loading && !medical.loading && !error && !medical.error
    && missingGenerations.length === 0 && pendencias === 0
    && atestadosPendentesSelecionados === 0 && !stale && rows.length > 0;
  const status = ready ? 'CONFERÊNCIA TÉCNICA SEM PENDÊNCIAS' : 'PRÉVIA — NÃO LIBERADA PARA PAGAMENTO';
  const diasUteis = getWorkingDays(competencia);

  const exportCsv = () => {
    if (!ready) return;
    const columns = ['Empresa', 'Funcionário', 'CPF', 'Banco', 'Agência', 'Conta', 'PIX',
      'Competência', 'Tipo', 'Valor diário (R$)', 'Dias previstos', 'Dias abatidos',
      'Dias finais', 'Valor para pagamento (R$)', 'Situação', 'Motivo dos abatimentos'];
    const data = rows.map(r => [
      r.empresa, r.nome, r.cpf, r.banco, r.agencia, r.conta, r.pix, competencia,
      sigla, money(r.valorDiario), r.diasPrevistos, r.diasDescontados,
      r.diasFinais, money(r.valor), 'CONFERIDO', r.motivo,
    ]);
    const csv = [columns, ...data].map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `TOPAC_${sigla}_Consolidado_Pagamento_${safeName(competencia)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={embutido ? "space-y-5 rounded-xl border border-border bg-card/40 p-3 md:p-5" : "space-y-5 p-4 md:p-7"}>
      <header className="print:hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">TOPAC RH PRO · {sigla}</p>
          {embutido ? <h2 className="text-lg font-bold">Consolidado de pagamento — {sigla}</h2> : <h1 className="text-2xl font-bold">Relatório consolidado de pagamento — {sigla}</h1>}
          <p className="text-sm text-muted-foreground">{tituloBeneficio}: somente seus próprios lançamentos, abatimentos, valores e recibos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReload(n => n + 1)}>
            <RefreshCw className="mr-2 h-4 w-4" />Atualizar
          </Button>
          <Button variant="outline" disabled={!ready} onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />CSV {sigla}
          </Button>
          <Button variant="outline" disabled={!ready} onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />PDF {sigla}
          </Button>
        </div>
      </header>

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

      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 font-semibold">
          {!ready && <AlertTriangle className="h-5 w-5 text-amber-500" />}
          {status}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {sigla} · Competência {competencia} · Base {diasUteis} dias úteis · {rows.length} funcionário(s)
        </p>
        {(error || medical.error) && <p className="mt-2 text-sm text-red-500">Falha na conferência: {error || medical.error}</p>}
        {missingGenerations.length > 0 &&
          <p className="mt-2 text-sm text-amber-500">{sigla} não gerado: {missingGenerations.join('; ')}</p>}
        {pendencias > 0 &&
          <p className="mt-2 text-sm text-amber-500">{pendencias} lançamento(s) de ponto pendente(s) de conferência.</p>}
        {stale &&
          <p className="mt-2 text-sm text-amber-500">O fechamento foi alterado após a geração do {sigla}. Regenere somente {sigla} antes de pagar.</p>}
        {atestadosPendentesSelecionados > 0 &&
          <p className="mt-2 text-sm text-amber-500">{atestadosPendentesSelecionados} documento(s) médico(s) sem datas confirmadas.</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          Este documento inclui somente {sigla}. Os dados são os valores gravados na última geração deste benefício.
          Não substitui a autorização do financeiro.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Funcionários — {sigla}</div>
          <div className="text-xl font-bold">{rows.length}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Dias abatidos — {sigla}</div>
          <div className="text-xl font-bold">{diasAbatidos}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Total {sigla} para pagamento</div>
          <div className="text-xl font-bold">{formatCurrency(total)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border print:overflow-visible">
        <h2 className="p-3 font-semibold">Resumo por empresa — somente {sigla}</h2>
        <table className="w-full text-left text-xs">
          <thead className="bg-muted">
            <tr>{['Empresa', 'Funcionários', 'Dias abatidos', `Total ${sigla}`].map(t =>
              <th key={t} className="border-b p-2">{t}</th>)}</tr>
          </thead>
          <tbody>
            {summary.map(c => <tr key={c.id} className="border-b">
              <td className="p-2">{c.nome}</td>
              <td className="p-2">{c.pessoas}</td>
              <td className="p-2">{c.diasDescontados}</td>
              <td className="p-2 font-semibold">{formatCurrency(c.valor)}</td>
            </tr>)}
            <tr className="font-bold">
              <td className="p-2">TOTAL {sigla}</td>
              <td className="p-2">{rows.length}</td>
              <td className="p-2">{diasAbatidos}</td>
              <td className="p-2">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-lg border print:overflow-visible">
        <h2 className="p-3 font-semibold">Relação individual — {sigla}</h2>
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted text-muted-foreground">
            <tr>{['Empresa', 'Funcionário', 'Banco / PIX', 'Diária', 'Previstos',
              'Abatidos', 'Finais', 'Total', 'Motivo', 'Situação'].map(t =>
              <th key={t} className="whitespace-nowrap border-b p-2">{t}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => <tr key={row.companyId + ':' + row.employeeId} className="border-b">
              <td className="p-2">{row.empresa}</td>
              <td className="p-2"><b>{row.nome}</b><div className="text-muted-foreground">{row.cpf}</div></td>
              <td className="p-2">{row.banco} {row.agencia} {row.conta}<div>{row.pix}</div></td>
              <td className="p-2">{formatCurrency(row.valorDiario)}</td>
              <td className="p-2">{row.diasPrevistos}</td>
              <td className="p-2">{row.diasDescontados}</td>
              <td className="p-2">{row.diasFinais}</td>
              <td className="p-2 font-semibold">{formatCurrency(row.valor)}</td>
              <td className="p-2">{row.motivo || '—'}</td>
              <td className="p-2">{row.pendente ? 'PONTO PENDENTE' : ready ? 'CONFERIDO' : 'REVISAR'}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={10} className="p-6 text-center">
              {loading ? 'Carregando relatório...' : `Nenhum ${sigla} gerado nesta competência.`}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default ConsolidadoBeneficiosPage;
