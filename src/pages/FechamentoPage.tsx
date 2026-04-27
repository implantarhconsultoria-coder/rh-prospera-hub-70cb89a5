import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { calcFalta, calcAtraso, calcINSS, calcIRRF, calcFGTS, formatCurrency, calcTotalFuncionario } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Lock, FileText, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const FechamentoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries, updateEntry, deleteEntry, refreshEntries, getFechamento, updateFechamento } = useApp();
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));

  const diasUteisDefault = getWorkingDays(competencia);
  const [diasUteisManual, setDiasUteisManual] = useState<number>(diasUteisDefault);
  const [domingosFeriados, setDomingosFeriados] = useState<number>(() => {
    const [y, m] = new Date().toISOString().slice(0, 7).split('-').map(Number);
    return new Date(y, m, 0).getDate() - diasUteisDefault;
  });

  // Recalculate defaults when competencia changes
  useEffect(() => {
    const du = getWorkingDays(competencia);
    setDiasUteisManual(du);
    const [y, m] = competencia.split('-').map(Number);
    const diasNoMes = new Date(y, m, 0).getDate();
    setDomingosFeriados(diasNoMes - du);
  }, [competencia]);

  const diasUteis = diasUteisManual;

  useEffect(() => {
    if (selectedCompany && competencia) getOrCreateEntries(selectedCompany, competencia);
  }, [selectedCompany, competencia]);

  const compEmps = employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional');
  const compEntries = entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia);
  const fechamento = getFechamento(selectedCompany, competencia);

  const comissaoPct = selectedCompany === 'topac-gyn' ? 0.02 : 0.01;

  // Calculate per-employee payroll
  const calcPayroll = (emp: typeof compEmps[0], entry: typeof compEntries[0]) => {
    // Adiantamento: respeita o que o usuário lançou manualmente. Só usa 40% como
    // sugestão quando o entry ainda não tem valor explícito (zero/undefined).
    const adiantamento = (entry.adiantamento && entry.adiantamento > 0)
      ? entry.adiantamento
      : Math.round(emp.salarioBase * 0.4 * 100) / 100;
    const insVal = entry.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0;
    const baseHE = emp.salarioBase + insVal;
    const valorHora = baseHE / 220;
    const he50Val = valorHora * 1.5 * entry.he50;
    const he100Val = valorHora * 2 * entry.he100;
    const totalHE = he50Val + he100Val;
    const dsrHE = diasUteis > 0 ? (totalHE / diasUteis) * domingosFeriados : 0;
    const comissaoVal = (entry.comissaoBase || 0) * comissaoPct;
    const faltaVal = calcFalta(emp.salarioBase, entry.faltasDias);
    const atrasoVal = calcAtraso(emp.salarioBase, entry.atrasos);

    // Proventos brutos (base INSS/FGTS)
    const bruto = emp.salarioBase + insVal + he50Val + he100Val + dsrHE + comissaoVal + entry.adicionais - faltaVal - atrasoVal;

    const inss = calcINSS(bruto);
    const irrf = calcIRRF(bruto - inss);
    const fgts = calcFGTS(bruto);

    // Líquido = bruto - INSS - IRRF - adiantamento - outros descontos (sem desconto de VT)
    const liquido = bruto - inss - irrf - adiantamento - entry.descontosDiversos;

    // Calc VR/VT display values (info only, not in líquido)
    const calc = calcTotalFuncionario(emp, entry, diasUteis);

    return {
      he50Val, he100Val, dsrHE, insVal, comissaoVal, faltaVal, atrasoVal,
      bruto, inss, irrf, fgts, adiantamento, liquido,
      vrDisplay: calc.vrVal, vrDiasEfetivos: calc.vrDiasEfetivos,
      vtDisplay: calc.vtVal,
    };
  };

  const totals = useMemo(() => {
    let tBruto = 0, tINSS = 0, tIRRF = 0, tFGTS = 0, tLiq = 0, tBen = 0, tIns = 0, tFD = 0, tFV = 0, tAdiant = 0, tComissao = 0;
    compEmps.forEach(emp => {
      const entry = compEntries.find(e => e.employeeId === emp.id);
      if (!entry) return;
      const p = calcPayroll(emp, entry);
      tBruto += p.bruto; tINSS += p.inss; tIRRF += p.irrf; tFGTS += p.fgts;
      tLiq += p.liquido; tIns += p.insVal; tFD += entry.faltasDias; tFV += p.faltaVal;
      tAdiant += p.adiantamento; tComissao += p.comissaoVal;
      const c = calcTotalFuncionario(emp, entry, diasUteis);
      tBen += c.vrVal + c.vaVal + c.vtVal;
    });
    return { tBruto, tINSS, tIRRF, tFGTS, tLiq, tBen, tIns, tFD, tFV, tAdiant, tComissao };
  }, [compEmps, compEntries, diasUteis, comissaoPct]);

  const statusColor = fechamento.status === 'fechado' ? 'bg-success text-success-foreground' : fechamento.status === 'em_conferencia' ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground';

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold font-display text-foreground">Fechamento por Empresa</h1>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-center">
        <select value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-48" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Dias úteis:</span>
          <Input type="number" value={diasUteisManual} onChange={e => setDiasUteisManual(Number(e.target.value))} className="w-16 text-xs h-7" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Dom/Feriados:</span>
          <Input type="number" value={domingosFeriados} onChange={e => setDomingosFeriados(Number(e.target.value))} className="w-16 text-xs h-7" />
        </div>
        <Badge className={`${statusColor} ml-2`}>{fechamento.status.replace('_', ' ')}</Badge>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total Bruto', v: formatCurrency(totals.tBruto), c: 'text-success' },
          { l: 'Total INSS', v: formatCurrency(totals.tINSS), c: 'text-destructive' },
          { l: 'Total IRRF', v: formatCurrency(totals.tIRRF), c: 'text-destructive' },
          { l: 'Total FGTS', v: formatCurrency(totals.tFGTS), c: 'text-primary' },
          { l: 'Benefícios (VR/VT/VA)', v: formatCurrency(totals.tBen), c: 'text-primary' },
          { l: 'Líquido Estimado', v: formatCurrency(totals.tLiq), c: 'text-accent' },
          { l: 'Insalubridade', v: formatCurrency(totals.tIns), c: 'text-foreground' },
          { l: 'Funcionários', v: String(compEmps.length), c: 'text-foreground' },
          { l: 'Faltas (dias)', v: `${totals.tFD}`, c: 'text-destructive' },
          { l: 'Desc. Faltas', v: formatCurrency(totals.tFV), c: 'text-destructive' },
          { l: 'Adiantamentos', v: formatCurrency(totals.tAdiant), c: 'text-destructive' },
          { l: 'Comissões', v: formatCurrency(totals.tComissao), c: 'text-success' },
        ].map((card, i) => (
          <div key={i} className="card-premium p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase">{card.l}</p>
            <p className={`text-lg font-bold font-display ${card.c} mt-1`}>{card.v}</p>
          </div>
        ))}
      </div>

      {/* Employee table */}
      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Funcionário','Salário','Faltas','Atrasos','HE50','HE100','DSR','Adic.','Insal.','VR','VT','Comissão','INSS','FGTS','IRRF','Desc.','Adiant.','Líquido','Ações'].map(h => (
                <th key={h} className="px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compEmps.map(emp => {
              const entry = compEntries.find(e => e.employeeId === emp.id);
              if (!entry) return null;
              const p = calcPayroll(emp, entry);
              const update = (data: any) => updateEntry(emp.id, competencia, data);

              return (
                <tr key={emp.id} className="border-b hover:bg-muted/20">
                  <td className="px-2 py-2 font-medium whitespace-nowrap text-xs">{emp.name}</td>
                  <td className="px-2 py-2 text-xs">{formatCurrency(emp.salarioBase)}</td>
                  <td className="px-2 py-2"><Input type="number" value={entry.faltasDias} onChange={e => update({ faltasDias: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.atrasos} onChange={e => update({ atrasos: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.he50} onChange={e => update({ he50: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2"><Input type="number" value={entry.he100} onChange={e => update({ he100: Number(e.target.value) })} className="w-14 text-xs h-7" /></td>
                  <td className="px-2 py-2 text-xs">{formatCurrency(p.dsrHE)}</td>
                  <td className="px-2 py-2"><Input type="number" value={entry.adicionais} onChange={e => update({ adicionais: Number(e.target.value) })} className="w-16 text-xs h-7" /></td>
                  <td className="px-2 py-2 text-xs">{emp.insalubridadeAtiva ? formatCurrency(emp.insalubridadeValor) : '—'}</td>
                  <td className="px-2 py-2 text-xs">{entry.vrAplicado && emp.vrAtivo ? `${formatCurrency(p.vrDisplay)} (${p.vrDiasEfetivos}d)` : '—'}</td>
                  <td className="px-2 py-2 text-xs">{entry.vtAplicado && emp.vtAtivo ? formatCurrency(p.vtDisplay) : '—'}</td>
                  <td className="px-2 py-2">
                    <Input type="number" value={entry.comissaoBase || ''} onChange={e => update({ comissaoBase: Number(e.target.value) })}
                      placeholder="Base" className="w-20 text-xs h-7" />
                    {p.comissaoVal > 0 && <span className="text-[10px] text-success block">{formatCurrency(p.comissaoVal)}</span>}
                  </td>
                  <td className="px-2 py-2 text-xs text-destructive">{formatCurrency(p.inss)}</td>
                  <td className="px-2 py-2 text-xs">{formatCurrency(p.fgts)}</td>
                  <td className="px-2 py-2 text-xs text-destructive">{p.irrf > 0 ? formatCurrency(p.irrf) : '—'}</td>
                  <td className="px-2 py-2"><Input type="number" value={entry.descontosDiversos} onChange={e => update({ descontosDiversos: Number(e.target.value) })} className="w-16 text-xs h-7" /></td>
                  <td className="px-2 py-2 text-xs">{formatCurrency(p.adiantamento)}</td>
                  <td className="px-2 py-2 font-bold text-xs">{formatCurrency(p.liquido)}</td>
                  <td className="px-2 py-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" title="Apagar lançamento">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Apagar lançamento de {emp.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Os valores variáveis (faltas, atrasos, HE, descontos) serão removidos
                            do fechamento de <b>{competencia}</b>. O histórico fica registrado para auditoria.
                            Você pode reabrir a tela e os defaults serão recriados.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              try {
                                await deleteEntry(emp.id, competencia);
                                toast.success(`Lançamento de ${emp.name} apagado.`);
                              } catch (err: any) {
                                toast.error('Falha ao apagar: ' + (err?.message || ''));
                              }
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Apagar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await refreshEntries();
            toast.success('Lançamentos recarregados do banco.');
          }}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Recarregar do banco
        </Button>
      </div>

      {/* Actions */}
      <div className="card-premium p-4 space-y-3">
        <label className="text-xs text-muted-foreground">Observação do Fechamento</label>
        <textarea value={fechamento.observacoes}
          onChange={e => updateFechamento(selectedCompany, competencia, { observacoes: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" placeholder="Observações gerais..." />
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => { updateFechamento(selectedCompany, competencia, { status: 'em_conferencia' }); toast.success('Fechamento salvo!'); }}
            className="gradient-primary text-primary-foreground"><Save className="w-4 h-4 mr-2" />Salvar Fechamento</Button>
          <Button onClick={() => { updateFechamento(selectedCompany, competencia, { status: 'fechado', dataFechamento: new Date().toISOString() }); toast.success('Fechamento marcado como fechado!'); }}
            variant="outline"><Lock className="w-4 h-4 mr-2" />Marcar como Fechado</Button>
          <Button onClick={() => navigate(`/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`)} variant="outline">
            <FileText className="w-4 h-4 mr-2" />Relatório para Impressão
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FechamentoPage;
