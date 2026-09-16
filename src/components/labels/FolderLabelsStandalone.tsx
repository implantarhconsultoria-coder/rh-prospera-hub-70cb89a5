import React, { useMemo, useState } from 'react';
import { Building2, Layers3, Printer, Search, UserRound } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Mode = 'employee' | 'company' | 'all';
const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;').replace(/'/g, '&#039;');

const FolderLabelsStandalone: React.FC = () => {
  const { employees, companies } = useApp();
  const [mode, setMode] = useState<Mode>('company');
  const [query, setQuery] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [companyIds, setCompanyIds] = useState<string[]>([]);

  const activeEmployees = useMemo(() => employees
    .filter((employee) => employee.status === 'ativo' && employee.categoria === 'operacional' && !!employee.companyId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [employees]);
  const sortedCompanies = useMemo(() => [...companies].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [companies]);
  const counts = useMemo(() => activeEmployees.reduce<Record<string, number>>((acc, employee) => {
    if (employee.companyId) acc[employee.companyId] = (acc[employee.companyId] || 0) + 1;
    return acc;
  }, {}), [activeEmployees]);
  const candidates = useMemo(() => {
    const term = normalize(query);
    if (!term) return [];
    return activeEmployees.filter((employee) => {
      const company = companies.find((item) => item.id === employee.companyId);
      return normalize(`${employee.name} ${employee.cpf || ''} ${employee.cargo || ''} ${company?.name || ''}`).includes(term);
    }).slice(0, 20);
  }, [activeEmployees, companies, query]);
  const selectedEmployee = activeEmployees.find((employee) => employee.id === employeeId) || null;
  const targets = useMemo(() => {
    if (mode === 'employee') return selectedEmployee ? [selectedEmployee] : [];
    if (mode === 'company') return activeEmployees.filter((employee) => !!employee.companyId && companyIds.includes(employee.companyId));
    return activeEmployees;
  }, [activeEmployees, companyIds, mode, selectedEmployee]);

  const shortName = (employee: typeof activeEmployees[number]) => {
    const parts = employee.name.trim().split(/\s+/).filter(Boolean);
    const rawFirst = parts[0] || employee.name;
    const first = rawFirst.toLocaleUpperCase('pt-BR');
    const sameFirst = activeEmployees.filter((item) => (item.name.trim().split(/\s+/)[0] || '').localeCompare(rawFirst, 'pt-BR', { sensitivity: 'base' }) === 0);
    if (sameFirst.length <= 1 || parts.length < 2) return first;
    const surname = parts.find((part, index) => index > 0 && !['DE','DA','DO','DAS','DOS','E'].includes(part.toUpperCase())) || parts[parts.length - 1];
    return `${first} ${surname.charAt(0).toUpperCase()}.`;
  };

  const toggleCompany = (id: string) => setCompanyIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const imprimir = () => {
    if (!targets.length) return toast.error('Selecione pelo menos um funcionário ou empresa.');
    const ordered = [...targets].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
    const labels = ordered.map((employee) => `<section class="folder-label"><strong>${escapeHtml(shortName(employee))}</strong></section>`).join('');
    const win = window.open('', '_blank');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão.');
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Etiquetas Pasta A-Z</title><style>@page{size:A4 portrait;margin:20mm 12mm 12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:10px 14px;background:#f3f4f6;border-bottom:1px solid #d1d5db}.toolbar button{border:0;border-radius:8px;padding:8px 12px;background:#111827;color:#fff;font-weight:700;cursor:pointer}.toolbar span{font-size:12px;color:#374151}.sheet{display:grid;grid-template-columns:repeat(6,25mm);gap:3mm 5mm;justify-content:center;align-content:start}.folder-label{width:25mm;height:10mm;border:.6pt solid #777;border-radius:1.5mm;display:flex;align-items:center;justify-content:center;padding:.65mm .55mm;text-align:center;overflow:hidden;break-inside:avoid}.folder-label strong{display:block;width:100%;font-size:14pt;line-height:1;font-weight:900;white-space:nowrap;overflow:hidden;text-align:center}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${ordered.length} etiqueta(s) • 2,5 × 1 cm • ordem alfabética</span></div><main class="sheet">${labels}</main><script>(()=>{const fit=()=>document.querySelectorAll('.folder-label strong').forEach((el)=>{let s=14;el.style.fontSize=s+'pt';while(el.scrollWidth>el.clientWidth&&s>7){s-=.25;el.style.fontSize=s+'pt'}});fit();window.addEventListener('beforeprint',fit)})()</script></body></html>`);
    win.document.close();
    win.focus();
  };

  return <div className="space-y-5">
    <div className="grid gap-2 md:grid-cols-3">
      <button onClick={() => setMode('employee')} className={`rounded-xl border p-4 text-left ${mode === 'employee' ? 'border-[#ffc400] bg-[#ffc400]/10' : 'border-[#30263b] bg-black/20 hover:border-violet-500'}`}><UserRound className="mb-2 h-5 w-5 text-violet-400" /><strong className="block text-sm text-white">Por funcionário</strong><span className="text-xs text-zinc-500">Uma pessoa específica</span></button>
      <button onClick={() => setMode('company')} className={`rounded-xl border p-4 text-left ${mode === 'company' ? 'border-[#ffc400] bg-[#ffc400]/10' : 'border-[#30263b] bg-black/20 hover:border-violet-500'}`}><Building2 className="mb-2 h-5 w-5 text-violet-400" /><strong className="block text-sm text-white">Por empresas</strong><span className="text-xs text-zinc-500">Uma ou várias empresas</span></button>
      <button onClick={() => setMode('all')} className={`rounded-xl border p-4 text-left ${mode === 'all' ? 'border-[#ffc400] bg-[#ffc400]/10' : 'border-[#30263b] bg-black/20 hover:border-violet-500'}`}><Layers3 className="mb-2 h-5 w-5 text-violet-400" /><strong className="block text-sm text-white">Todas</strong><span className="text-xs text-zinc-500">RH completo em A-Z</span></button>
    </div>

    {mode === 'employee' && <div className="space-y-2"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" /><Input className="pl-9" value={query} onChange={(event) => { setQuery(event.target.value); setEmployeeId(''); }} placeholder="Digite o nome do funcionário" /></div>{!selectedEmployee && candidates.length > 0 && <div className="max-h-56 overflow-y-auto rounded-xl border border-[#30263b] bg-[#080b10] p-1">{candidates.map((employee) => <button key={employee.id} onClick={() => { setEmployeeId(employee.id); setQuery(employee.name); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5">{employee.name}</button>)}</div>}{selectedEmployee && <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-300">Selecionado: <strong>{selectedEmployee.name}</strong></div>}</div>}

    {mode === 'company' && <div className="space-y-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setCompanyIds(sortedCompanies.filter((company) => counts[company.id]).map((company) => company.id))}>Selecionar todas</Button><Button size="sm" variant="ghost" onClick={() => setCompanyIds([])}>Limpar</Button></div><div className="grid gap-2 md:grid-cols-2">{sortedCompanies.map((company) => { const count = counts[company.id] || 0; const checked = companyIds.includes(company.id); return <label key={company.id} className={`flex items-center gap-3 rounded-xl border p-3 ${count ? 'cursor-pointer' : 'opacity-40'} ${checked ? 'border-[#ffc400] bg-[#ffc400]/5' : 'border-[#30263b] bg-black/20'}`}><input type="checkbox" disabled={!count} checked={checked} onChange={() => toggleCompany(company.id)} className="h-4 w-4 accent-yellow-400" /><span className="min-w-0"><strong className="block truncate text-sm text-white">{company.name}</strong><span className="text-xs text-zinc-500">{count} funcionário(s)</span></span></label>; })}</div></div>}

    {mode === 'all' && <div className="rounded-xl border border-[#30263b] bg-black/20 p-4 text-sm text-zinc-400"><strong className="text-white">{targets.length} funcionários ativos</strong> serão reunidos numa única sequência alfabética.</div>}

    <Button onClick={imprimir} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd633]"><Printer className="mr-2 h-4 w-4" />Imprimir etiquetas 2,5 × 1 cm</Button>
  </div>;
};

export default FolderLabelsStandalone;
