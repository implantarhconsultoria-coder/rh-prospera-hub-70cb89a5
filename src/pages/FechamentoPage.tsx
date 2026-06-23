import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, FileText, Lock, Save, Table, Trash2, Upload, UtensilsCrossed, Bus, RefreshCw, Tags, Printer, UserPlus } from 'lucide-react';
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
  const [etiquetaModo, setEtiquetaModo] = useState<'todos' | 'novos' | 'manual'>('todos');
  const [etiquetaSelecionados, setEtiquetaSelecionados] = useState<string[]>([]);
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
  const novosFuncionarios = compEmps.filter(e => (e.dataAdmissao || '').startsWith(competencia));

  useEffect(() => {
    if (etiquetaModo === 'manual') return;
    const base = etiquetaModo === 'novos' ? novosFuncionarios : compEmps;
    setEtiquetaSelecionados(base.map(e => e.id));
  }, [selectedCompany, competencia, etiquetaModo, compEmps.length, novosFuncionarios.length]);

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
      acc.tProventos += p.proventos;
      acc.tDescontos += p.descontosLegais + p.descontosOperacionais + p.adiantamento + p.descontosDiversos;
      acc.tBruto += p.bruto; acc.tINSS += p.inss; acc.tIRRF += p.irrf; acc.tFGTS += p.fgts; acc.tLiq += p.liquido;
      acc.tBen += c.vrVal + c.vaVal + c.vtVal; acc.tIns += p.insVal; acc.tPeric += p.periculosidadeVal; acc.tFD += entry.faltasDias; acc.tFV += p.faltaVal;
      acc.tAdiant += p.adiantamento; acc.tComissao += p.comissaoVal; acc.tDSRHE += p.dsrHE; acc.tDSRComissao += p.dsrComissao;
      acc.tHE50Qtd += Number(entry.he50 || 0); acc.tHE100Qtd += Number(entry.he100 || 0);
      acc.tHE50Val += p.he50Val; acc.tHE100Val += p.he100Val;
      acc.tDescOp += p.descontosOperacionais; acc.tDescDiv += p.descontosDiversos;
      return acc;
    }, { tProventos: 0, tDescontos: 0, tBruto: 0, tINSS: 0, tIRRF: 0, tFGTS: 0, tLiq: 0, tBen: 0, tIns: 0, tPeric: 0, tFD: 0, tFV: 0, tAdiant: 0, tComissao: 0, tDSRHE: 0, tDSRComissao: 0, tHE50Qtd: 0, tHE100Qtd: 0, tHE50Val: 0, tHE100Val: 0, tDescOp: 0, tDescDiv: 0 });
  }, [compEmps, compEntries, diasUteis, domingosFeriados, comissaoPct]);

  const fechamentoTotals = {
    totalFuncionarios: compEmps.length,
    totalProventos: totals.tProventos,
    totalDescontos: totals.tDescontos,
    totalLiquido: totals.tLiq,
  };

  const handleSalvarFechamento = async () => {
    const result = await updateFechamento(selectedCompany, competencia, {
      status: 'em_conferencia',
      observacoes: fechamento.observacoes,
      ...fechamentoTotals,
    });
    if (result.ok) toast.success('Fechamento salvo!');
    else toast.error('Erro ao salvar fechamento no banco.');
  };

  const handleMarcarFechado = async () => {
    const result = await updateFechamento(selectedCompany, competencia, {
      status: 'fechado',
      observacoes: fechamento.observacoes,
      dataFechamento: new Date().toISOString(),
      ...fechamentoTotals,
    });
    if (result.ok) toast.success('Fechamento marcado como fechado!');
    else toast.error('Erro ao marcar fechamento como fechado.');
  };

  const competenciaLabel = (() => {
    const [ano, mes] = competencia.split('-');
    const nomes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${nomes[Number(mes) - 1] || mes}/${ano || ''}`;
  })();

  const empresaEtiqueta = () => {
    const codigo = selectedCompanyData?.codigo?.toLowerCase() || '';
    const nome = selectedCompanyData?.name || 'Topac';
    if (codigo.includes('lmt') || nome.toLowerCase().includes('lmt')) return 'LMT';
    if (codigo.includes('alqui') || nome.toLowerCase().includes('alqui')) return 'Alqui';
    return 'Topac';
  };

  const escapeHtml = (value: string) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const funcionariosParaEtiqueta = compEmps.filter(e => etiquetaSelecionados.includes(e.id));

  const toggleEtiquetaFuncionario = (id: string) => {
    setEtiquetaModo('manual');
    setEtiquetaSelecionados(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const imprimirEtiquetas = () => {
    if (!funcionariosParaEtiqueta.length) {
      toast.error('Selecione pelo menos um funcionario para imprimir etiquetas.');
      return;
    }

    const empresa = escapeHtml(empresaEtiqueta());
    const mes = escapeHtml(competenciaLabel);
    const renderEtiqueta = (emp: typeof funcionariosParaEtiqueta[0]) => `
      <section class="label">
        <div class="company">${empresa}</div>
        <div class="name">${escapeHtml(emp.name)}</div>
        <div class="role">${escapeHtml(emp.cargo || '-')}</div>
        <div class="month">${mes}</div>
        <div class="line">Seg. e Qui. - 7:30 as 12:00 / 13:00 as 17:30</div>
        <div class="line">Sex. - 7:30 as 12:00 / 13:00 as 16:30</div>
      </section>
    `;
    const etiquetas = funcionariosParaEtiqueta.flatMap(emp => [renderEtiqueta(emp), renderEtiqueta(emp)]).join('');

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('O navegador bloqueou a janela de impressao. Libere pop-ups para continuar.');
      return;
    }

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Etiquetas ${empresa} ${mes}</title>
  <style>
    @page { size: A4 portrait; margin: 18mm 20mm 16mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: #f3f4f6; border-bottom: 1px solid #d1d5db; }
    .toolbar button { border: 0; border-radius: 8px; padding: 8px 12px; background: #111827; color: #fff; font-weight: 700; cursor: pointer; }
    .toolbar span { font-size: 12px; color: #374151; }
    .sheet { width: 170mm; margin: 0 auto; padding: 0; display: grid; grid-template-columns: repeat(2, 73mm); column-gap: 5.2mm; row-gap: 3.1mm; justify-content: center; align-content: start; }
    .label { width: 73mm; height: 29.8mm; border: 0.6pt solid #555; border-radius: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; overflow: hidden; padding: 2.1mm 2.4mm 1.4mm; break-inside: avoid; page-break-inside: avoid; }
    .company { font-size: 8.4pt; line-height: 1; font-weight: 800; margin-bottom: 1.8mm; }
    .name { max-width: 100%; font-size: 9.7pt; line-height: 1.04; font-style: italic; font-weight: 700; text-decoration: underline; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 1.6mm; }
    .role { max-width: 100%; font-size: 5.8pt; line-height: 1.1; font-weight: 800; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: .7mm; }
    .month { font-size: 5.8pt; line-height: 1.1; font-weight: 800; margin-bottom: 1.9mm; }
    .line { font-size: 4.7pt; line-height: 1.22; font-weight: 700; white-space: nowrap; }
    @media print {
      .toolbar { display: none; }
      .sheet { margin: 0 auto; }
      .label { border-color: #555; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${funcionariosParaEtiqueta.length} funcionarios - ${funcionariosParaEtiqueta.length * 2} etiquetas em pares iguais - ${empresa} - ${mes}</span></div>
  <main class="sheet">${etiquetas}</main>
</body>
</html>`);
    win.document.close();
    win.focus();
  };

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

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: 'Lancamentos', icon: CalendarDays, action: () => navigate(`/admin/lancamentos?empresa=${selectedCompany}&comp=${competencia}`) },
          { label: 'Ponto', icon: Clock, action: () => navigate('/admin/fechamento-ponto') },
          { label: 'Importar ponto', icon: Upload, action: () => navigate('/admin/importar-fechamento') },
          { label: 'Conferencia', icon: FileText, action: () => navigate('/admin/conferencia-ponto') },
          { label: 'VR', icon: UtensilsCrossed, action: () => navigate(`/admin/relatorio-vr?empresa=${selectedCompany}&competencia=${competencia}`) },
          { label: 'VT', icon: Bus, action: () => navigate(`/admin/relatorio-vt?empresa=${selectedCompany}&competencia=${competencia}`) },
          { label: 'Etiquetas', icon: Tags, action: imprimirEtiquetas },
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

      <div className="card-premium p-4 space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase flex items-center gap-2"><Tags className="w-3.5 h-3.5" /> Etiquetas A4 - modelo fixo</p>
            <h2 className="text-base font-bold text-foreground">{selectedCompanyData?.name || 'Empresa'} - {competenciaLabel}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={etiquetaModo === 'todos' ? 'default' : 'outline'} onClick={() => setEtiquetaModo('todos')}>Todos da empresa</Button>
            <Button type="button" size="sm" variant={etiquetaModo === 'novos' ? 'default' : 'outline'} onClick={() => setEtiquetaModo('novos')}><UserPlus className="w-3.5 h-3.5 mr-1" />Novos do mês ({novosFuncionarios.length})</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setEtiquetaModo('manual'); setEtiquetaSelecionados(compEmps.map(e => e.id)); }}>Selecionar todos</Button>
            <Button type="button" size="sm" variant="outline" onClick={imprimirEtiquetas}><Printer className="w-3.5 h-3.5 mr-1" />Imprimir etiquetas</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
          {compEmps.map(emp => {
            const checked = etiquetaSelecionados.includes(emp.id);
            const novo = novosFuncionarios.some(n => n.id === emp.id);
            return (
              <label key={emp.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-primary/10 border-primary/40' : 'bg-muted/20 border-border'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggleEtiquetaFuncionario(emp.id)} />
                <span className="min-w-0 flex-1 truncate font-medium">{emp.name}</span>
                {novo && <Badge variant="secondary" className="text-[10px]">novo</Badge>}
              </label>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">A impressao usa sempre o mes selecionado acima e separa pelo filtro de empresa escolhido no fechamento. Cada funcionario sai em duas etiquetas iguais, lado a lado, para dobrar e colocar no cartao de ponto.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Total Bruto', totals.tBruto], ['Total INSS', totals.tINSS], ['Total IRRF', totals.tIRRF], ['FGTS Info', totals.tFGTS], ['Beneficios VR/VT/VA', totals.tBen], ['Liquido Estimado', totals.tLiq], ['Faltas (dias)', totals.tFD], ['Funcionarios', compEmps.length]].map(([label, value]) => (
          <div key={String(label)} className="card-premium p-4 text-center"><p className="text-xs text-muted-foreground uppercase">{label}</p><p className="text-lg font-bold font-display mt-1">{typeof value === 'number' && label !== 'Faltas (dias)' && label !== 'Funcionarios' ? formatCurrency(value) : value}</p></div>
        ))}
      </div>

      <div className="card-premium p-4 space-y-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase">Fechamento por empresa/filial</p>
            <h2 className="text-lg font-bold text-foreground">{selectedCompanyData?.name || 'Empresa'}</h2>
          </div>
          <div className="text-sm text-muted-foreground">Competencia {competencia}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-3">
          {[
            ['Funcionarios', compEmps.length, false],
            ['Salario base', compEmps.reduce((sum, emp) => sum + Number(emp.salarioBase || 0), 0), true],
            ['Insalubridade', totals.tIns, true],
            ['Periculosidade', totals.tPeric, true],
            ['HE 50% qtd.', `${totals.tHE50Qtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, false],
            ['HE 100% qtd.', `${totals.tHE100Qtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`, false],
            ['Adiantamentos', totals.tAdiant, true],
            ['Faltas/desc.', totals.tDescOp + totals.tDescDiv, true],
            ['Liquido previsto', totals.tLiq, true],
            ['FGTS info', totals.tFGTS, true],
            ['Status', fechamento.status.replace('_', ' '), false],
          ].map(([label, value, currency]) => (
            <div key={String(label)} className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {currency && typeof value === 'number' ? formatCurrency(value) : String(value)}
              </p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                {['Funcionario','Cargo','Salario','Insal.','Peric.','HE50 qtd','HE100 qtd','Adiant.','Faltas/Desc.','Liquido'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compEmps.map(emp => {
                const entry = compEntries.find(e => e.employeeId === emp.id);
                if (!entry) return null;
                const p = calcPayroll(emp, entry);
                return (
                  <tr key={emp.id} className="border-b">
                    <td className="px-2 py-2 font-medium whitespace-nowrap">{emp.name}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{emp.cargo || '-'}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(emp.salarioBase || 0)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(p.insVal || 0)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(p.periculosidadeVal || 0)}</td>
                    <td className="px-2 py-2 text-right">{Number(entry.he50 || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                    <td className="px-2 py-2 text-right">{Number(entry.he100 || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(p.adiantamento || 0)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency((p.descontosOperacionais || 0) + (p.descontosDiversos || 0))}</td>
                    <td className="px-2 py-2 text-right font-bold text-success">{formatCurrency(p.liquido || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Nome', 'Cargo', 'Salario fixo', 'Insalubridade', 'Periculosidade', 'HE 50%', 'HE 100%', 'DSR HE', 'Comissao', 'DSR Comissao', 'Faltas/Desc.', 'Adiantamento', 'INSS', 'IRRF', 'Liquido final', 'FGTS info', 'Acoes'].map(h => (
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
                <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">{p.periculosidadeVal > 0 ? formatCurrency(p.periculosidadeVal) : '-'}</td>
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
                  <MoneyInput value={entry.adicionais || 0} onValueChange={(value) => update({ adicionais: value })} className="mt-2 w-28 h-8 text-xs text-right" />
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

      <div className="card-premium p-4 space-y-3"><label className="text-xs text-muted-foreground">Observacao do Fechamento</label><textarea value={fechamento.observacoes} onChange={e => updateFechamento(selectedCompany, competencia, { observacoes: e.target.value }, { persist: false })} className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-h-[60px]" placeholder="Observacoes gerais..." /><div className="flex gap-3 flex-wrap"><Button onClick={handleSalvarFechamento} className="gradient-primary text-primary-foreground"><Save className="w-4 h-4 mr-2" />Salvar Fechamento</Button><Button onClick={handleMarcarFechado} variant="outline"><Lock className="w-4 h-4 mr-2" />Marcar como Fechado</Button><Button onClick={() => navigate(`/relatorio-impressao?empresa=${selectedCompany}&competencia=${competencia}`)} variant="outline"><FileText className="w-4 h-4 mr-2" />Relatorio para Impressao</Button><Button onClick={imprimirEtiquetas} variant="outline"><Tags className="w-4 h-4 mr-2" />Etiquetas</Button></div></div>
    </div>
  );
};

export default FechamentoPage;
