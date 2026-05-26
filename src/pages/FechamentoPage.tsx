import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, FileText, Lock, Save, Table, Trash2, Upload, UtensilsCrossed, Bus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { calcPayrollBreakdown, calcTotalFuncionario, formatCurrency, getComissaoPercentual } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DecimalInput, MoneyInput } from '@/components/ui/number-format-input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const FechamentoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, updateEntry, deleteEntry, refreshEntries, getFechamento, updateFechamento } = useApp();
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
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
  }, [selectedCompany, competencia]);

  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const fechamento = getFechamento(selectedCompany, competencia);
  const selectedCompanyData = companies.find(c => c.id === selectedCompany);
  const comissaoPct = getComissaoPercentual(selectedCompanyData);
  const diasUteis = diasUteisManual;

  const getFaltaDatas = (observacoes = '') => observacoes.match(/FALTAS:\s*([^|]+)/i)?.[1]?.trim() || '';
  const setFaltaDatas = (observacoes = '', datas: string) => {
    const without = observacoes.replace(/(^|\s*\|\s*)FALTAS:\s*[^|]+/i, '').trim();
    return [datas.trim() ? `FALTAS: ${datas.trim()}` : '', without].filter(Boolean).join(' | ');
  };

  const calcPayroll = (emp: typeof compEmps[0], entry: typeof compEntries[0]) => {
    const calc = calcTotalFuncionario(emp, entry, diasUteis);
    return {
      ...calcPayrollBreakdown(emp, entry, { diasUteis, domingosFeriados, comissaoPct }),
      vrDisplay: calc.vrVal,
      vrDiasEfetivos: calc.vrDiasEfetivos,
      vtDisplay: calc.vtVal,
    };
  };

  const totals = useMemo(() => {
    return compEmps.reduce((acc, emp) => {
      const entry = compEntries.find(e => e.employeeId === emp.id);
      if (!entry) return acc;
      const p = calcPayroll(emp, entry);
      const c = calcTotalFuncionario(emp, entry, diasUteis);
      acc.tBruto += p.bruto; acc.tINSS += p.inss; acc.tIRRF += p.irrf; acc.tFGTS += p.fgts; acc.tLiq += p.liquido;
      acc.tBen += c.vrVal + c.vaVal + c.vtVal; acc.tIns += p.insVal; acc.tFD += entry.faltasDias; acc.tFV += p.faltaVal;
      acc.tAdiant += p.adiantamento; acc.tComissao += p.comissaoVal; acc.tDSRHE += p.dsrHE; acc.tDSRComissao += p.dsrComissao;
      return acc;
    }, { tBruto: 0, tINSS: 0, tIRRF: 0, tFGTS: 0, tLiq: 0, tBen: 0, tIns: 0, tFD: 0, tFV: 0, tAdiant: 0, tComissao: 0, tDSRHE: 0, tDSRComissao: 0 });
  }, [compEmps, compEntries, diasUteis, domingosFeriados, comissaoPct]);

  const exportApontamentoCsv = () => {
    const headers = ['Funcionario', 'Empresa', 'Faltas', 'Datas das faltas', 'HE 50%', 'HE 100%', 'Valor HE', 'DSR HE', 'Comissao', 'DSR Comissao', 'Adicional', 'INSS', 'IRRF', 'FGTS informativo', 'Liquido', 'Observacoes'];
    const rows = compEmps.map(emp => {
      const entry = compEntries.find(e => e.employeeId === emp.id);
      if (!entry) return null;
      const p = calcPayroll(emp, entry);
      return [emp.name, companies.find(c => c.id === emp.companyId)?.name || '', entry.faltasDias, getFaltaDatas(entry.observacoes), entry.he50, entry.he100, p.totalHE, p.dsrHE, p.comissaoVal, p.dsrComissao, entry.adicionais, p.inss, p.irrf, p.fgtsInformativo, p.liquido, entry.observacoes];
    }).filter(Boolean) as Array<Array<string | number>>;
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apontamento-contabilidade-${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = fechamento.status === 'fechado' ? 'bg-success text-success-foreground' : fechamento.status === 'em_conferencia' ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Fechamento</h1>
        <p className="text-sm text-muted-foreground">Modulo unico para lancamentos, ponto, apontamento contabil, VR/VT, PDFs e fechamento consolidado.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: 'Lancamentos', icon: CalendarDays, action: () => navigate(`/admin/lancamentos?empresa=${selectedCompany}&comp=${competencia}`) },
          { label: 'Ponto', icon: Clock, action: () => navigate('/admin/fechamento-ponto') },
          { label: 'Importar ponto', icon: Upload, action: () => navigate('/admin/importar-fechamento') },
          { label: 'Conferencia', icon: FileText, action: () => navigate('/admin/conferencia-ponto') },
          { label: 'VR', icon: UtensilsCrossed, action: () => navigate(`/admin/relatorio-vr?empresa=${selectedCompany}&competencia=${competencia}`) },
          { label: 'VT', icon: Bus, action: () => navigate(`/admin/relatorio-vt?empresa=${selectedCompany}&competencia=${competencia}`) },
          { label: 'Excel', icon: Table, action: exportApontamentoCsv },
        ].map(item => <button key={item.label} onClick={item.action} className="card-premium p-3 text-left hover:ring-2 hover:ring-primary/30 transition-all"><item.icon className="w-4 h-4 text-primary mb-2" /><span className="text-xs font-semibold text-foreground">{item.label}</span></button>)}
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-48" />
        <span className="text-xs text-muted-foreground">Dias uteis:</span><DecimalInput value={diasUteisManual} decimals={0} onValueChange={setDiasUteisManual} className="w-16 text-xs h-7" />
        <span className="text-xs text-muted-foreground">Dom/Feriados:</span><DecimalInput value={domingosFeriados} decimals={0} onValueChange={setDomingosFeriados} className="w-16 text-xs h-7" />
        <Badge className={`${statusColor} ml-2`}>{fechamento.status.replace('_', ' ')}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Total Bruto', totals.tBruto], ['Total INSS', totals.tINSS], ['Total IRRF', totals.tIRRF], ['FGTS Info', totals.tFGTS], ['Beneficios VR/VT/VA', totals.tBen], ['Liquido Estimado', totals.tLiq], ['Faltas (dias)', totals.tFD], ['Funcionarios', compEmps.length]].map(([label, value]) => (
          <div key={String(label)} className="card-premium p-4 text-center"><p className="text-xs text-muted-foreground uppercase">{label}</p><p className="text-lg font-bold font-display mt-1">{typeof value === 'number' && label !== 'Faltas (dias)' && label !== 'Funcionarios' ? formatCurrency(value) : value}</p></div>
        ))}
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Nome', 'Cargo', 'Salario fixo', 'Insalubridade', 'HE 50%', 'HE 100%', 'DSR HE', 'Comissao', 'DSR Comissao', 'Faltas/Desc.', 'Adiantamento', 'INSS', 'IRRF', 'Liquido final', 'FGTS info', 'Acoes'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{compEmps.map(emp => {
            const entry = compEntries.find(e => e.employeeId === emp.id); if (!entry) return null;
            const p = calcPayroll(emp, entry); const update = (data: any) => updateEntry(emp.id, competencia, data);
            return (
              <tr key={emp.id} className="border-b hover:bg-muted/20 align-top">
                <td className="px-3 py-3 font-medium whitespace-nowrap text-xs">
                  {emp.name}
                  {p.pendencias.length > 0 && <Badge variant="destructive" className="ml-2 text-[10px]">Pendente conferencia</Badge>}
                </td>
                <td className="px-3 py-3 text-xs min-w-32">{emp.cargo || '-'}</td>
                <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">{formatCurrency(emp.salarioBase)}</td>
                <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">{p.insVal > 0 ? formatCurrency(p.insVal) : '-'}</td>
                <td className="px-3 py-3 min-w-36">
                  <DecimalInput value={entry.he50} decimals={2} onValueChange={(value) => update({ he50: value })} className="w-24 h-8 text-xs text-right" />
                  <div className="mt-1 text-[11px] text-muted-foreground">Hora {formatCurrency(p.valorHora)} | {formatCurrency(p.he50Val)}</div>
                </td>
                <td className="px-3 py-3 min-w-36">
                  <DecimalInput value={entry.he100} decimals={2} onValueChange={(value) => update({ he100: value })} className="w-24 h-8 text-xs text-right" />
                  <div className="mt-1 text-[11px] text-muted-foreground">Hora {formatCurrency(p.valorHora)} | {formatCurrency(p.he100Val)}</div>
                </td>
                <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">{formatCurrency(p.dsrHE)}</td>
                <td className="px-3 py-3 min-w-40">
                  <MoneyInput value={entry.comissaoBase || 0} onValueChange={(value) => update({ comissaoBase: value })} placeholder="Base" className="w-28 h-8 text-xs text-right" />
                  <div className="mt-1 text-[11px] text-muted-foreground">{(p.comissaoPct * 100).toFixed(0)}% = {formatCurrency(p.comissaoVal)}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground">Adicionais</div>
                  <MoneyInput value={entry.adicionais || 0} onValueChange={(value) => update({ adicionais: value })} className="w-28 h-8 text-xs text-right" />
                </td>
                <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">{formatCurrency(p.dsrComissao)}</td>
                <td className="px-3 py-3 min-w-44">
                  <div className="flex items-center gap-2">
                    <DecimalInput value={entry.faltasDias} decimals={1} onValueChange={(value) => update({ faltasDias: value })} className="w-20 h-8 text-xs text-right" />
                    <Input value={getFaltaDatas(entry.observacoes)} onChange={e => update({ observacoes: setFaltaDatas(entry.observacoes, e.target.value) })} placeholder="Datas" className="w-24 text-xs h-8" />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>Atrasos h</span>
                    <DecimalInput value={entry.atrasos} decimals={2} onValueChange={(value) => update({ atrasos: value })} className="w-20 h-8 text-xs text-right" />
                  </div>
                  <div className="mt-1 text-[11px] text-destructive">Faltas/atrasos {formatCurrency(p.descontosOperacionais)}</div>
                  <MoneyInput value={entry.descontosDiversos || 0} onValueChange={(value) => update({ descontosDiversos: value })} className="mt-2 w-28 h-8 text-xs text-right" />
                </td>
                <td className="px-3 py-3">
                  <MoneyInput value={p.adiantamento} onValueChange={(value) => update({ adiantamento: value })} className="w-28 h-8 text-xs text-right" />
                </td>
                <td className="px-3 py-3 text-xs text-destructive tabular-nums whitespace-nowrap">
                  {formatCurrency(p.inss)}
                  <div className="text-[11px] text-muted-foreground">Base {formatCurrency(p.baseINSS)}</div>
                </td>
                <td className="px-3 py-3 text-xs text-destructive tabular-nums whitespace-nowrap">
                  {p.irrf > 0 ? formatCurrency(p.irrf) : '-'}
                  <div className="text-[11px] text-muted-foreground">Base {formatCurrency(p.baseIRRF)}</div>
                </td>
                <td className="px-3 py-3 font-bold text-xs text-success tabular-nums whitespace-nowrap">{formatCurrency(p.liquido)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatCurrency(p.fgtsInformativo)}
                  <div className="text-[11px]">Base {formatCurrency(p.baseFGTS)}</div>
                </td>
                <td className="px-3 py-3">
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Apagar lancamento de {emp.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Os valores variaveis serao removidos deste fechamento.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteEntry(emp.id, competencia)} className="bg-destructive text-destructive-foreground">Apagar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={async () => { await refreshEntries(); toast.success('Lancamentos recarregados.'); }}><RefreshCw className="w-3.5 h-3.5 mr-2" />Recarregar</Button></div>

      <div className="card-premium p-4 overflow-x-auto"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3"><div><h2 className="text-sm font-bold text-foreground">Apontamento para Contabilidade</h2><p className="text-xs text-muted-foreground">Relatorio operacional; nao substitui o fechamento financeiro final.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportApontamentoCsv}><Table className="w-4 h-4 mr-2" />Exportar Excel</Button><Button variant="outline" size="sm" onClick={() => navigate(`/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`)}><FileText className="w-4 h-4 mr-2" />PDF</Button></div></div>
        <table className="w-full text-sm"><thead><tr className="border-b bg-muted/50">{['Funcionario','Empresa','Faltas','Datas','HE 50%','HE 100%','Adicional/Comissao','Observacoes'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{compEmps.map(emp => { const entry = compEntries.find(e => e.employeeId === emp.id); if (!entry) return null; const p = calcPayroll(emp, entry); return <tr key={emp.id} className="border-b hover:bg-muted/20"><td className="px-3 py-2 font-medium whitespace-nowrap">{emp.name}</td><td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{companies.find(c => c.id === emp.companyId)?.name}</td><td className="px-3 py-2">{entry.faltasDias || '-'}</td><td className="px-3 py-2">{getFaltaDatas(entry.observacoes) || '-'}</td><td className="px-3 py-2">{entry.he50 || '-'}</td><td className="px-3 py-2">{entry.he100 || '-'}</td><td className="px-3 py-2">{p.comissaoVal || entry.adicionais ? formatCurrency(p.comissaoVal + entry.adicionais) : '-'}</td><td className="px-3 py-2 text-muted-foreground max-w-xs truncate">{entry.observacoes || '-'}</td></tr>; })}</tbody></table>
      </div>

      <div className="card-premium p-4 space-y-3"><label className="text-xs text-muted-foreground">Observacao do Fechamento</label><textarea value={fechamento.observacoes} onChange={e => updateFechamento(selectedCompany, competencia, { observacoes: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" placeholder="Observacoes gerais..." /><div className="flex gap-3 flex-wrap"><Button onClick={() => { updateFechamento(selectedCompany, competencia, { status: 'em_conferencia' }); toast.success('Fechamento salvo!'); }} className="gradient-primary text-primary-foreground"><Save className="w-4 h-4 mr-2" />Salvar Fechamento</Button><Button onClick={() => { updateFechamento(selectedCompany, competencia, { status: 'fechado', dataFechamento: new Date().toISOString() }); toast.success('Fechamento marcado como fechado!'); }} variant="outline"><Lock className="w-4 h-4 mr-2" />Marcar como Fechado</Button><Button onClick={() => navigate(`/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`)} variant="outline"><FileText className="w-4 h-4 mr-2" />Relatorio para Impressao</Button></div></div>
    </div>
  );
};

export default FechamentoPage;
