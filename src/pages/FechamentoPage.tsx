import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Lock, RefreshCw, Save, Table } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { calcPayrollBreakdown, formatCurrency, getComissaoPercentual, getHoraExtraSemanalPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DecimalInput, MoneyInput } from '@/components/ui/number-format-input';
import { supabase } from '@/integrations/supabase/client';
import { entryToRow, type MonthlyEntry } from '@/types/database';

const HOURS_DOC_RE = /DECLARACAO\/ATESTADO HORAS:\s*\+([\d.,]+)h/gi;
const FALTAS_RE = /FALTAS:\s*([^|]+)/i;

const FechamentoPage: React.FC = () => {
  const { companies, employees, entries, setEntries, getOrCreateEntries, refreshEntries, getFechamento, updateFechamento } = useApp();
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [saving, setSaving] = useState(false);
  const saveQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const diasUteisDefault = getWorkingDays(competencia);
  const [diasUteisManual, setDiasUteisManual] = useState(diasUteisDefault);
  const [domingosFeriados, setDomingosFeriados] = useState(() => {
    const [y, m] = new Date().toISOString().slice(0, 7).split('-').map(Number);
    return new Date(y, m, 0).getDate() - diasUteisDefault;
  });

  useEffect(() => {
    if (!selectedCompany && companies.length) setSelectedCompany(companies[0].id);
  }, [companies, selectedCompany]);

  useEffect(() => {
    const du = getWorkingDays(competencia);
    const [y, m] = competencia.split('-').map(Number);
    setDiasUteisManual(du);
    setDomingosFeriados(new Date(y, m, 0).getDate() - du);
  }, [competencia]);

  useEffect(() => {
    if (selectedCompany && competencia) getOrCreateEntries(selectedCompany, competencia);
  }, [selectedCompany, competencia, getOrCreateEntries]);

  const compEmps = employees.filter((employee) => employee.companyId === selectedCompany && employee.status === 'ativo' && employee.categoria === 'operacional');
  const compEntries = entries.filter((entry) => entry.companyId === selectedCompany && entry.competencia === competencia);
  const fechamento = getFechamento(selectedCompany, competencia);
  const selectedCompanyData = companies.find((company) => company.id === selectedCompany);
  const comissaoPct = getComissaoPercentual(selectedCompanyData);
  const heSemanalPct = getHoraExtraSemanalPercentual(selectedCompanyData || selectedCompany);
  const heSemanalLabel = `HE ${heSemanalPct}%`;
  const diasUteis = diasUteisManual;

  const getFaltaDatas = (observacoes = '') => observacoes.match(FALTAS_RE)?.[1]?.trim() || '';
  const stripFaltaDatas = (observacoes = '') => String(observacoes || '').replace(/(^|\s*\|\s*)FALTAS:\s*[^|]+/i, '').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim();
  const setFaltaDatas = (observacoes = '', datas: string) => [datas.trim() ? `FALTAS: ${datas.trim()}` : '', stripFaltaDatas(observacoes)].filter(Boolean).join(' | ');

  const getHorasDocumento = (observacoes = '') => {
    const matches = [...String(observacoes || '').matchAll(new RegExp(HOURS_DOC_RE.source, 'gi'))];
    return matches.reduce((sum, match) => sum + (Number(String(match[1]).replace(',', '.')) || 0), 0);
  };
  const stripHorasDocumento = (observacoes = '') => String(observacoes || '').replace(/(^|\s*\|\s*)DECLARACAO\/ATESTADO HORAS:\s*\+[\d.,]+h/gi, '').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim();
  const setHorasDocumento = (observacoes = '', horas: number) => {
    const marker = horas > 0 ? `DECLARACAO/ATESTADO HORAS: +${horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '';
    return [marker, stripHorasDocumento(observacoes)].filter(Boolean).join(' | ');
  };
  const getObservacaoLivre = (observacoes = '') => stripHorasDocumento(stripFaltaDatas(observacoes)).trim();
  const setObservacaoLivre = (observacoes = '', texto: string) => {
    const falta = getFaltaDatas(observacoes);
    const horasDoc = getHorasDocumento(observacoes);
    return [
      falta ? `FALTAS: ${falta}` : '',
      horasDoc > 0 ? `DECLARACAO/ATESTADO HORAS: +${horasDoc.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h` : '',
      texto.trim(),
    ].filter(Boolean).join(' | ');
  };

  const calcPayroll = (emp: typeof compEmps[number], entry: typeof compEntries[number]) => calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct, horaExtraSemanalPct: heSemanalPct });

  const totals = useMemo(() => compEmps.reduce((acc, emp) => {
    const entry = compEntries.find((item) => item.employeeId === emp.id);
    if (!entry) return acc;
    const calc = calcPayroll(emp, entry);
    acc.proventos += calc.proventos;
    acc.descontos += calc.descontosLegais + calc.descontosOperacionais + calc.adiantamento + calc.descontosDiversos;
    acc.liquido += calc.liquido;
    return acc;
  }, { proventos: 0, descontos: 0, liquido: 0 }), [compEmps, compEntries, diasUteis, domingosFeriados, comissaoPct, heSemanalPct]);

  const fechamentoTotals = { totalFuncionarios: compEmps.length, totalProventos: totals.proventos, totalDescontos: totals.descontos, totalLiquido: totals.liquido };

  const queueEntryPersistence = (entry: MonthlyEntry, data: Partial<MonthlyEntry>) => {
    const key = `${entry.employeeId}|${entry.competencia}`;
    const nextEntry = { ...entry, ...data };

    setEntries(prev => prev.map(item =>
      item.employeeId === entry.employeeId && item.competencia === entry.competencia
        ? { ...item, ...data }
        : item,
    ));

    const previous = saveQueueRef.current.get(key) || Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        const patch = entryToRow(data);
        if (Object.keys(patch).length === 0) return;

        const result = entry.id
          ? await supabase.from('lancamentos_mensais').update(patch).eq('id', entry.id).select('id').maybeSingle()
          : await supabase.from('lancamentos_mensais').upsert(entryToRow(nextEntry), { onConflict: 'funcionario_id,competencia' }).select('id').maybeSingle();

        if (result.error) throw result.error;
        if (!result.data?.id) throw new Error('O lançamento não foi confirmado pelo banco.');
      });

    saveQueueRef.current.set(key, queued);
    void queued
      .catch((error) => {
        console.error('Erro ao persistir lançamento do fechamento:', error);
        toast.error('Não foi possível salvar uma alteração do fechamento. Use Salvar Fechamento para tentar novamente.');
      })
      .finally(() => {
        if (saveQueueRef.current.get(key) === queued) saveQueueRef.current.delete(key);
      });
  };

  const persistAllEntries = async () => {
    const pending = Array.from(saveQueueRef.current.values());
    if (pending.length) await Promise.allSettled(pending);
    if (!compEntries.length) return;

    const rows = compEntries.map((entry) => entryToRow(entry));
    const { error } = await supabase
      .from('lancamentos_mensais')
      .upsert(rows, { onConflict: 'funcionario_id,competencia' });

    if (error) throw error;
  };

  const handleSalvarFechamento = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await persistAllEntries();
      const result = await updateFechamento(selectedCompany, competencia, { status: 'em_conferencia', observacoes: fechamento.observacoes, ...fechamentoTotals });
      if (!result.ok) throw result.error || new Error('Falha ao salvar fechamento.');
      await refreshEntries();
      toast.success('Fechamento e lançamentos salvos no banco.');
    } catch (error) {
      console.error('Erro ao salvar fechamento completo:', error);
      toast.error('Erro ao salvar fechamento no banco. Nenhum valor foi considerado confirmado.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarcarFechado = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await persistAllEntries();
      const result = await updateFechamento(selectedCompany, competencia, { status: 'fechado', observacoes: fechamento.observacoes, dataFechamento: new Date().toISOString(), ...fechamentoTotals });
      if (!result.ok) throw result.error || new Error('Falha ao fechar competência.');
      await refreshEntries();
      toast.success('Fechamento marcado como fechado.');
    } catch (error) {
      console.error('Erro ao marcar fechamento como fechado:', error);
      toast.error('Erro ao marcar fechamento como fechado.');
    } finally {
      setSaving(false);
    }
  };

  const exportApontamentoCsv = () => {
    const headers = ['Funcionario','Empresa','Faltas','Datas das faltas','Horas descontadas','Horas por atestado/declaracao',heSemanalLabel,'HE 100%','Valor HE','DSR HE','Base comissao','Comissao','DSR comissao','Adicional','Desconto extra','Adiantamento','INSS','IRRF','FGTS informativo','Liquido','Observacoes'];
    const rows = compEmps.map((emp) => {
      const entry = compEntries.find((item) => item.employeeId === emp.id);
      if (!entry) return null;
      const calc = calcPayroll(emp, entry);
      return [emp.name, selectedCompanyData?.name || '', entry.faltasDias, getFaltaDatas(entry.observacoes), entry.atrasos || 0, getHorasDocumento(entry.observacoes), entry.he50, entry.he100, calc.totalHE, calc.dsrHE, entry.comissaoBase, calc.comissaoVal, calc.dsrComissao, entry.adicionais, entry.descontosDiversos, calc.adiantamento, calc.inss, calc.irrf, calc.fgtsInformativo, calc.liquido, getObservacaoLivre(entry.observacoes)];
    }).filter(Boolean) as Array<Array<string | number>>;
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `apontamento_contabilidade_${selectedCompanyData?.name || 'empresa'}_${competencia}.csv`.replace(/\s+/g, '_').toLowerCase();
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  };

  const openPdf = () => navigate(`/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`);
  const statusColor = fechamento.status === 'fechado' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : fechamento.status === 'em_conferencia' ? 'border-amber-400/30 bg-amber-500/10 text-amber-300' : 'border-violet-400/30 bg-violet-500/10 text-violet-300';
  const inputClass = 'h-8 min-w-[72px] border-violet-400/20 bg-black/20 text-xs focus:border-violet-400/60';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><h1 className="text-2xl font-bold font-display text-foreground">Fechamento</h1><p className="text-sm text-muted-foreground">Preencha o apontamento diretamente na grade e gere Excel ou PDF somente quando estiver pronto.</p></div>
        <Badge variant="outline" className={statusColor}>{fechamento.status.replace('_', ' ')}</Badge>
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <select value={selectedCompany} onChange={(event) => setSelectedCompany(event.target.value)} className="h-10 min-w-64 rounded-lg border border-violet-400/25 bg-background px-3 text-sm text-foreground outline-none focus:border-violet-400/60">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
        <Input type="month" value={competencia} onChange={(event) => setCompetencia(event.target.value)} className="w-48" />
        <span className="text-xs text-muted-foreground">Dias úteis:</span><DecimalInput value={diasUteisManual} decimals={0} onValueChange={setDiasUteisManual} className="w-16 text-xs h-8" />
        <span className="text-xs text-muted-foreground">Dom/Feriados:</span><DecimalInput value={domingosFeriados} decimals={0} onValueChange={setDomingosFeriados} className="w-16 text-xs h-8" />
        <Button variant="outline" size="sm" className="ml-auto" disabled={saving} onClick={async () => { await refreshEntries(); toast.success('Lançamentos recarregados.'); }}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Recarregar</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card-premium p-4"><p className="text-[11px] uppercase text-muted-foreground">Funcionários</p><p className="mt-1 text-xl font-extrabold text-amber-300">{compEmps.length}</p></div>
        <div className="card-premium p-4"><p className="text-[11px] uppercase text-muted-foreground">Proventos estimados</p><p className="mt-1 text-xl font-extrabold text-foreground">{formatCurrency(totals.proventos)}</p></div>
        <div className="card-premium p-4"><p className="text-[11px] uppercase text-muted-foreground">Descontos estimados</p><p className="mt-1 text-xl font-extrabold text-amber-300">{formatCurrency(totals.descontos)}</p></div>
        <div className="card-premium p-4"><p className="text-[11px] uppercase text-muted-foreground">Líquido estimado</p><p className="mt-1 text-xl font-extrabold text-violet-300">{formatCurrency(totals.liquido)}</p></div>
      </div>

      <section className="card-premium overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-violet-400/20 p-4 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-base font-bold text-foreground">Apontamento para Contabilidade</h2><p className="text-xs text-muted-foreground">Grade única e editável. Funcionário e empresa são fixos; os demais apontamentos podem ser preenchidos aqui.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={exportApontamentoCsv}><Table className="mr-2 h-4 w-4" /> Exportar Excel</Button><Button variant="outline" size="sm" onClick={openPdf}><FileText className="mr-2 h-4 w-4" /> PDF</Button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1680px] text-sm">
            <thead className="bg-violet-500/[0.055]"><tr className="border-b border-violet-400/20">{['Funcionário','Empresa','Faltas','Datas','Horas desc.','Horas doc.',heSemanalLabel,'HE 100%','Comissão','Adicional','Desc. extra','Adiantamento','Líquido','Observações'].map((header) => <th key={header} className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{header}</th>)}</tr></thead>
            <tbody>{compEmps.map((emp) => {
              const entry = compEntries.find((item) => item.employeeId === emp.id); if (!entry) return null;
              const calc = calcPayroll(emp, entry);
              const update = (data: Partial<MonthlyEntry>) => queueEntryPersistence(entry, data);
              const docHoras = getHorasDocumento(entry.observacoes);
              return <tr key={emp.id} className="border-b border-violet-400/10 align-top hover:bg-violet-500/[0.025]">
                <td className="px-3 py-3 font-semibold whitespace-nowrap">{emp.name}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{selectedCompanyData?.name || '-'}</td>
                <td className="px-2 py-2"><DecimalInput value={entry.faltasDias} decimals={1} onValueChange={(value) => update({ faltasDias: value })} className={`${inputClass} w-20`} /></td>
                <td className="px-2 py-2"><Input value={getFaltaDatas(entry.observacoes)} onChange={(event) => update({ observacoes: setFaltaDatas(entry.observacoes, event.target.value) })} placeholder="Ex.: 03, 17" className={`${inputClass} w-28`} /></td>
                <td className="px-2 py-2 min-w-28"><DecimalInput value={entry.atrasos} decimals={2} onValueChange={(value) => update({ atrasos: value })} className={`${inputClass} w-20`} /><div className="mt-1 text-[10px] text-muted-foreground">{formatCurrency(calc.atrasoVal)}</div></td>
                <td className="px-2 py-2"><DecimalInput value={docHoras} decimals={2} onValueChange={(value) => update({ observacoes: setHorasDocumento(entry.observacoes, value) })} className={`${inputClass} w-20`} /></td>
                <td className="px-2 py-2 min-w-28"><DecimalInput value={entry.he50} decimals={2} onValueChange={(value) => update({ he50: value })} className={`${inputClass} w-20`} /><div className="mt-1 text-[10px] text-violet-300">{formatCurrency(calc.he50Val)}</div></td>
                <td className="px-2 py-2 min-w-28"><DecimalInput value={entry.he100} decimals={2} onValueChange={(value) => update({ he100: value })} className={`${inputClass} w-20`} /><div className="mt-1 text-[10px] text-violet-300">{formatCurrency(calc.he100Val)}</div></td>
                <td className="px-2 py-2 min-w-36"><MoneyInput value={entry.comissaoBase || 0} onValueChange={(value) => update({ comissaoBase: value })} className={`${inputClass} w-28 text-right`} /><div className="mt-1 text-[10px] text-amber-300">{(calc.comissaoPct * 100).toFixed(0)}% = {formatCurrency(calc.comissaoVal)}</div></td>
                <td className="px-2 py-2"><MoneyInput value={entry.adicionais || 0} onValueChange={(value) => update({ adicionais: value })} className={`${inputClass} w-28 text-right`} /></td>
                <td className="px-2 py-2"><MoneyInput value={entry.descontosDiversos || 0} onValueChange={(value) => update({ descontosDiversos: value })} className={`${inputClass} w-28 text-right`} /></td>
                <td className="px-2 py-2"><MoneyInput value={entry.adiantamento || 0} onValueChange={(value) => update({ adiantamento: value })} className={`${inputClass} w-28 text-right`} /></td>
                <td className="px-3 py-3 font-extrabold text-violet-200 whitespace-nowrap">{formatCurrency(calc.liquido)}</td>
                <td className="px-2 py-2 min-w-64"><Input value={getObservacaoLivre(entry.observacoes)} onChange={(event) => update({ observacoes: setObservacaoLivre(entry.observacoes, event.target.value) })} placeholder="Observação..." className={`${inputClass} w-64`} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="card-premium space-y-3 p-4">
        <label className="text-xs font-semibold text-muted-foreground">Observação geral do fechamento</label>
        <textarea value={fechamento.observacoes} onChange={(event) => updateFechamento(selectedCompany, competencia, { observacoes: event.target.value }, { persist: false })} className="min-h-[72px] w-full rounded-lg border border-violet-400/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-violet-400/60" placeholder="Observações gerais da competência..." />
        <div className="flex flex-wrap gap-3"><Button disabled={saving} onClick={handleSalvarFechamento} className="gradient-primary text-primary-foreground"><Save className="mr-2 h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Fechamento'}</Button><Button disabled={saving} onClick={handleMarcarFechado} variant="outline"><Lock className="mr-2 h-4 w-4" /> Marcar como Fechado</Button><Button onClick={openPdf} variant="outline"><FileText className="mr-2 h-4 w-4" /> Gerar PDF</Button><Button onClick={exportApontamentoCsv} variant="outline"><Table className="mr-2 h-4 w-4" /> Exportar Excel</Button></div>
      </section>
    </div>
  );
};

export default FechamentoPage;
