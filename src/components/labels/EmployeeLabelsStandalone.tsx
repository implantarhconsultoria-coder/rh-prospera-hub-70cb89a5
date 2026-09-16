import React, { useEffect, useMemo, useState } from 'react';
import { Printer, UserPlus, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Mode = 'todos' | 'novos' | 'manual';
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;').replace(/'/g, '&#039;');

const currentCompetencia = () => new Date().toISOString().slice(0, 7);

const EmployeeLabelsStandalone: React.FC = () => {
  const { employees, companies } = useApp();
  const [companyId, setCompanyId] = useState('');
  const [competencia, setCompetencia] = useState(currentCompetencia());
  const [mode, setMode] = useState<Mode>('todos');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId && companies[0]?.id) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const company = companies.find((item) => item.id === companyId);
  const activeEmployees = useMemo(() => employees
    .filter((item) => item.companyId === companyId && item.status === 'ativo' && item.categoria === 'operacional')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [companyId, employees]);
  const newEmployees = useMemo(() => activeEmployees.filter((item) => String(item.dataAdmissao || '').startsWith(competencia)), [activeEmployees, competencia]);

  useEffect(() => {
    if (mode === 'manual') return;
    setSelected((mode === 'novos' ? newEmployees : activeEmployees).map((item) => item.id));
  }, [activeEmployees, newEmployees, mode]);

  const selectedEmployees = activeEmployees.filter((item) => selected.includes(item.id));
  const competenciaLabel = useMemo(() => {
    const [ano, mes] = competencia.split('-');
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    return `${nomes[Number(mes) - 1] || mes}/${ano || ''}`;
  }, [competencia]);

  const empresaEtiqueta = () => {
    const codigo = String((company as any)?.codigo || '').toLowerCase();
    const nome = String(company?.name || 'TOPAC');
    if (codigo.includes('lmt') || nome.toLowerCase().includes('lmt')) return 'LMT';
    if (codigo.includes('alqui') || nome.toLowerCase().includes('alqui')) return 'Alqui';
    return 'Topac';
  };
  const limparFuncao = (value?: string) => String(value || '').trim()
    .replace(/\s*-?\s*R\$\s*[\d.,]+.*$/i, '')
    .replace(/\s*[+-]\s*(INSALUBRIDADE|INSALUBRID\.?|PERICULOSIDADE|ADICIONAL).*$/i, '')
    .trim() || '-';

  const setPreset = (next: Mode) => {
    setMode(next);
    if (next === 'todos') setSelected(activeEmployees.map((item) => item.id));
    if (next === 'novos') setSelected(newEmployees.map((item) => item.id));
  };
  const toggle = (id: string) => {
    setMode('manual');
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const imprimir = () => {
    if (!selectedEmployees.length) return toast.error('Selecione pelo menos um funcionário.');
    const empresa = escapeHtml(empresaEtiqueta());
    const mes = escapeHtml(competenciaLabel);
    const render = (emp: typeof selectedEmployees[number]) => `<section class="label"><div class="company">${empresa}</div><div class="name">${escapeHtml(emp.name)}</div><div class="role">${escapeHtml(limparFuncao(emp.cargo))}</div><div class="month">${mes}</div><div class="line">Seg. e Qui. - 7:30 as 12:00 / 13:00 as 17:30</div><div class="line">Sex. - 7:30 as 12:00 / 13:00 as 16:30</div></section>`;
    const labels = selectedEmployees.flatMap((emp) => [render(emp), render(emp)]).join('');
    const win = window.open('', '_blank');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão.');
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Etiquetas ${empresa} ${mes}</title><style>@page{size:A4 portrait;margin:18mm 20mm 16mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:10px 14px;background:#f3f4f6;border-bottom:1px solid #d1d5db}.toolbar button{border:0;border-radius:8px;padding:8px 12px;background:#111827;color:#fff;font-weight:700;cursor:pointer}.toolbar span{font-size:12px;color:#374151}.sheet{width:170mm;margin:0 auto;display:grid;grid-template-columns:repeat(2,73mm);column-gap:5.2mm;row-gap:3.1mm;justify-content:center;align-content:start}.label{width:73mm;height:29.8mm;border:.6pt solid #555;border-radius:2mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;text-align:center;overflow:hidden;padding:1.7mm 2.2mm 1.1mm;break-inside:avoid}.company{font-size:9.4pt;line-height:1;font-weight:800;margin-bottom:1.2mm}.name{max-width:100%;font-size:12.4pt;line-height:1;font-style:italic;font-weight:800;text-decoration:underline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1.1mm}.role{max-width:100%;font-size:6.8pt;line-height:1.05;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:.5mm}.month{font-size:6.7pt;line-height:1.05;font-weight:800;margin-bottom:1.1mm}.line{font-size:5.3pt;line-height:1.13;font-weight:700;white-space:nowrap}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${selectedEmployees.length} funcionários • ${selectedEmployees.length * 2} etiquetas</span></div><main class="sheet">${labels}</main></body></html>`);
    win.document.close();
    win.focus();
  };

  return <div className="space-y-5">
    <div className="grid gap-3 md:grid-cols-[1fr_220px]">
      <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="h-11 rounded-lg border border-[#30263b] bg-[#080b10] px-3 text-sm text-white outline-none">{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <Input type="month" value={competencia} onChange={(event) => setCompetencia(event.target.value)} />
    </div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant={mode === 'todos' ? 'default' : 'outline'} onClick={() => setPreset('todos')}><Users className="mr-1 h-4 w-4" />Todos ({activeEmployees.length})</Button>
      <Button size="sm" variant={mode === 'novos' ? 'default' : 'outline'} onClick={() => setPreset('novos')}><UserPlus className="mr-1 h-4 w-4" />Novos do mês ({newEmployees.length})</Button>
      <Button size="sm" variant={mode === 'manual' ? 'default' : 'outline'} onClick={() => setMode('manual')}>Seleção manual</Button>
    </div>
    {mode === 'manual' && <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-[#30263b] bg-black/20 p-3 md:grid-cols-2 xl:grid-cols-3">{activeEmployees.map((emp) => <label key={emp.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs text-zinc-300 hover:bg-white/5"><input type="checkbox" checked={selected.includes(emp.id)} onChange={() => toggle(emp.id)} className="h-4 w-4 accent-violet-500" /><span className="truncate">{emp.name}</span></label>)}</div>}
    <div className="rounded-xl border border-[#30263b] bg-black/20 p-4 text-xs text-zinc-500"><strong className="text-white">{selectedEmployees.length}</strong> funcionário(s) selecionado(s). Serão impressas duas etiquetas iguais por funcionário.</div>
    <Button onClick={imprimir} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd633]"><Printer className="mr-2 h-4 w-4" />Imprimir etiquetas A4</Button>
  </div>;
};

export default EmployeeLabelsStandalone;
