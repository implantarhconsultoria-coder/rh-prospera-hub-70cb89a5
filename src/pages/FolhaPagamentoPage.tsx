import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { calcINSS, calcIRRF, calcFGTS, calcFalta, calcAtraso, formatCurrency } from '@/lib/calculations';
import { getWorkingDays } from '@/lib/workingDays';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Printer, FileText, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { printDocumentInPage } from '@/lib/printInPage';
import { buildHoleriteHtml, buildFolhaConsolidadaHtml } from '@/lib/folhaPdf';

const FolhaPagamentoPage: React.FC = () => {
  const { companies, employees, entries, getOrCreateEntries } = useApp();
  const [selectedCompany, setSelectedCompany] = useState(companies[0]?.id || '');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!selectedCompany && companies.length) setSelectedCompany(companies[0].id);
  }, [companies, selectedCompany]);

  const diasUteis = getWorkingDays(competencia);
  const [y, m] = competencia.split('-').map(Number);
  const diasNoMes = new Date(y, m, 0).getDate();
  const domingosFeriados = diasNoMes - diasUteis;

  useEffect(() => {
    if (selectedCompany && competencia) getOrCreateEntries(selectedCompany, competencia);
  }, [selectedCompany, competencia, getOrCreateEntries]);

  const compEmps = useMemo(
    () => employees.filter(e => e.companyId === selectedCompany && e.status === 'ativo' && e.categoria === 'operacional'),
    [employees, selectedCompany]
  );
  const compEntries = useMemo(
    () => entries.filter(e => e.companyId === selectedCompany && e.competencia === competencia),
    [entries, selectedCompany, competencia]
  );

  const comissaoPct = selectedCompany.includes('gyn') ? 0.02 : 0.01;

  const calc = (emp: typeof compEmps[0], entry: typeof compEntries[0] | undefined) => {
    const e = entry || {
      faltasDias: 0, atrasos: 0, he50: 0, he100: 0, adicionais: 0,
      descontosDiversos: 0, adiantamento: 0, comissaoBase: 0, insalubridadeAplicada: false,
    } as any;
    const adiantamento = e.adiantamento ?? Math.round(emp.salarioBase * 0.4 * 100) / 100;
    const insVal = e.insalubridadeAplicada && emp.insalubridadeAtiva ? emp.insalubridadeValor : 0;
    const baseHE = emp.salarioBase + insVal;
    const valorHora = baseHE / 220;
    const he50Val = valorHora * 1.5 * (e.he50 || 0);
    const he100Val = valorHora * 2 * (e.he100 || 0);
    const totalHE = he50Val + he100Val;
    const dsr = diasUteis > 0 ? (totalHE / diasUteis) * domingosFeriados : 0;
    const comissaoVal = (e.comissaoBase || 0) * comissaoPct;
    const faltaVal = calcFalta(emp.salarioBase, e.faltasDias || 0);
    const atrasoVal = calcAtraso(emp.salarioBase, e.atrasos || 0);
    const bruto =
      emp.salarioBase + insVal + he50Val + he100Val + dsr + comissaoVal + (e.adicionais || 0) - faltaVal - atrasoVal;
    const inss = calcINSS(bruto);
    const irrf = calcIRRF(bruto - inss);
    const fgts = calcFGTS(bruto);
    const liquido = bruto - inss - irrf - adiantamento - (e.descontosDiversos || 0);
    return { he50Val, he100Val, dsr, insVal, comissaoVal, faltaVal, atrasoVal, bruto, inss, irrf, fgts, adiantamento, liquido };
  };

  const totals = useMemo(() => {
    let bruto = 0, inss = 0, irrf = 0, fgts = 0, liq = 0;
    compEmps.forEach(emp => {
      const entry = compEntries.find(en => en.employeeId === emp.id);
      const p = calc(emp, entry);
      bruto += p.bruto; inss += p.inss; irrf += p.irrf; fgts += p.fgts; liq += p.liquido;
    });
    return { bruto, inss, irrf, fgts, liq };
  }, [compEmps, compEntries, diasUteis]);

  const empresa = companies.find(c => c.id === selectedCompany);

  const imprimirFolha = () => {
    if (!empresa) return;
    const linhas = compEmps.map(emp => {
      const entry = compEntries.find(en => en.employeeId === emp.id);
      const p = calc(emp, entry);
      return {
        funcionario: emp.name,
        cargo: emp.cargo,
        bruto: p.bruto, inss: p.inss, irrf: p.irrf,
        outros: p.adiantamento + (entry?.descontosDiversos || 0),
        liquido: p.liquido,
        fgts: p.fgts,
      };
    });
    printDocumentInPage(buildFolhaConsolidadaHtml(empresa.name, competencia, linhas));
    toast.success('Folha gerada para impressão');
  };

  const imprimirHolerite = (empId: string) => {
    if (!empresa) return;
    const emp = compEmps.find(x => x.id === empId);
    const entry = compEntries.find(x => x.employeeId === empId);
    if (!emp) return;
    const p = calc(emp, entry);
    const linhas: any[] = [
      { descricao: 'Salário base', referencia: '30 dias', proventos: emp.salarioBase, descontos: 0 },
    ];
    if (p.insVal > 0) linhas.push({ descricao: 'Insalubridade', referencia: '', proventos: p.insVal, descontos: 0 });
    if (p.he50Val > 0) linhas.push({ descricao: 'Horas Extras 50%', referencia: `${entry?.he50 ?? 0}h`, proventos: p.he50Val, descontos: 0 });
    if (p.he100Val > 0) linhas.push({ descricao: 'Horas Extras 100%', referencia: `${entry?.he100 ?? 0}h`, proventos: p.he100Val, descontos: 0 });
    if (p.dsr > 0) linhas.push({ descricao: 'DSR sobre HE', referencia: '', proventos: p.dsr, descontos: 0 });
    if (p.comissaoVal > 0) linhas.push({ descricao: 'Comissão', referencia: '', proventos: p.comissaoVal, descontos: 0 });
    if (entry?.adicionais) linhas.push({ descricao: 'Adicionais', referencia: '', proventos: entry.adicionais, descontos: 0 });
    if (p.faltaVal > 0) linhas.push({ descricao: 'Faltas', referencia: `${entry?.faltasDias ?? 0} dias`, proventos: 0, descontos: p.faltaVal });
    if (p.atrasoVal > 0) linhas.push({ descricao: 'Atrasos', referencia: `${entry?.atrasos ?? 0}h`, proventos: 0, descontos: p.atrasoVal });
    if (p.inss > 0) linhas.push({ descricao: 'INSS', referencia: '', proventos: 0, descontos: p.inss });
    if (p.irrf > 0) linhas.push({ descricao: 'IRRF', referencia: '', proventos: 0, descontos: p.irrf });
    if (p.adiantamento > 0) linhas.push({ descricao: 'Adiantamento', referencia: '', proventos: 0, descontos: p.adiantamento });
    if (entry?.descontosDiversos) linhas.push({ descricao: 'Descontos diversos', referencia: '', proventos: 0, descontos: entry.descontosDiversos });

    const totalProv = linhas.reduce((s, l) => s + l.proventos, 0);
    const totalDesc = linhas.reduce((s, l) => s + l.descontos, 0);

    printDocumentInPage(buildHoleriteHtml({
      empresa: empresa.name, competencia, funcionario: emp.name, cargo: emp.cargo,
      registro: emp.registro || '—', cpf: emp.cpf || '—', admissao: emp.dataAdmissao || '—',
      salarioBase: emp.salarioBase, linhas, totalProventos: totalProv, totalDescontos: totalDesc,
      liquido: totalProv - totalDesc, baseINSS: p.bruto, baseFGTS: p.bruto, baseIRRF: p.bruto - p.inss, fgtsValor: p.fgts,
    }));
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><Wallet className="w-6 h-6" /> Folha de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Lê os mesmos dados de Lançamentos Mensais — fonte única de verdade.</p>
        </div>
        <Button onClick={imprimirFolha}><Printer className="w-4 h-4 mr-2" />Imprimir Folha</Button>
      </div>

      <Card className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Empresa</label>
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Competência</label>
          <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
        </div>
        <div className="flex items-end">
          <div className="text-sm">
            <div className="text-muted-foreground">Dias úteis: <strong>{diasUteis}</strong></div>
            <div className="text-muted-foreground">Funcionários: <strong>{compEmps.length}</strong></div>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">Funcionário</th>
              <th className="p-2 text-right">Salário</th>
              <th className="p-2 text-right">Insalub</th>
              <th className="p-2 text-right">HE 50%</th>
              <th className="p-2 text-right">HE 100%</th>
              <th className="p-2 text-right">DSR</th>
              <th className="p-2 text-right">Comissão</th>
              <th className="p-2 text-right">Adicionais</th>
              <th className="p-2 text-right">Faltas</th>
              <th className="p-2 text-right">Adiant.</th>
              <th className="p-2 text-right">Outros desc.</th>
              <th className="p-2 text-right">INSS</th>
              <th className="p-2 text-right">IRRF</th>
              <th className="p-2 text-right">FGTS</th>
              <th className="p-2 text-right font-bold">Líquido</th>
              <th className="p-2 text-center">Holerite</th>
            </tr>
          </thead>
          <tbody>
            {compEmps.map(emp => {
              const entry = compEntries.find(e => e.employeeId === emp.id);
              const p = calc(emp, entry);
              return (
                <tr key={emp.id} className="border-t hover:bg-muted/40">
                  <td className="p-2">{emp.name}<div className="text-[10px] text-muted-foreground">{emp.cargo}</div></td>
                  <td className="p-2 text-right">{formatCurrency(emp.salarioBase)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.insVal)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.he50Val)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.he100Val)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.dsr)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.comissaoVal)}</td>
                  <td className="p-2 text-right">{formatCurrency(entry?.adicionais || 0)}</td>
                  <td className="p-2 text-right text-destructive">{formatCurrency(p.faltaVal)}</td>
                  <td className="p-2 text-right text-destructive">{formatCurrency(p.adiantamento)}</td>
                  <td className="p-2 text-right text-destructive">{formatCurrency(entry?.descontosDiversos || 0)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.inss)}</td>
                  <td className="p-2 text-right">{formatCurrency(p.irrf)}</td>
                  <td className="p-2 text-right text-muted-foreground">{formatCurrency(p.fgts)}</td>
                  <td className="p-2 text-right font-bold text-success">{formatCurrency(p.liquido)}</td>
                  <td className="p-2 text-center">
                    <Button size="sm" variant="ghost" onClick={() => imprimirHolerite(emp.id)}><FileText className="w-3 h-3" /></Button>
                  </td>
                </tr>
              );
            })}
            {compEmps.length === 0 && (
              <tr><td colSpan={16} className="p-6 text-center text-muted-foreground">Nenhum funcionário encontrado para esta empresa.</td></tr>
            )}
          </tbody>
          <tfoot className="bg-muted font-bold">
            <tr>
              <td className="p-2">TOTAIS</td>
              <td colSpan={10}></td>
              <td className="p-2 text-right">{formatCurrency(totals.inss)}</td>
              <td className="p-2 text-right">{formatCurrency(totals.irrf)}</td>
              <td className="p-2 text-right">{formatCurrency(totals.fgts)}</td>
              <td className="p-2 text-right text-success">{formatCurrency(totals.liq)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
};

export default FolhaPagamentoPage;
