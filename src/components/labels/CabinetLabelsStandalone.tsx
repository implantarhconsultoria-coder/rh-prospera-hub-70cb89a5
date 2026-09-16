import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Label = { id: string; text: string };
const STORAGE_KEY = 'topac-cabinet-labels-v1';
const DEFAULT_LABELS: Label[] = [
  { id: 'compressores', text: 'Compressores' },
  { id: 'veiculos', text: 'Veículos' },
  { id: 'funcionarios', text: 'Funcionários' },
  { id: 'contratos-pendencias', text: 'Contratos C/Pendências' },
  { id: 'contratos-sem-assinatura', text: 'Contratos Sem Assinatura' },
  { id: 'contratos-locacao', text: 'Contratos de Locação' },
  { id: 'contratos-locacao-orcados', text: 'Contratos de Locação Orçados' },
  { id: 'contratos-finalizados-locadoras-k7', text: 'Contratos Finalizados\nLocadoras K - 7' },
];
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
const labelHtml = (value: string) => escapeHtml(value).replace(/\n/g, '<br />');
const readStored = (): Label[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LABELS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LABELS;
  } catch { return DEFAULT_LABELS; }
};

const CabinetLabelsStandalone: React.FC = () => {
  const [labels, setLabels] = useState<Label[]>(readStored);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readStored().map((item) => item.id));
  const [newLabel, setNewLabel] = useState('');
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels)); }, [labels]);
  const selected = useMemo(() => labels.filter((label) => selectedIds.includes(label.id)), [labels, selectedIds]);
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const remove = (id: string) => { setLabels((current) => current.filter((item) => item.id !== id)); setSelectedIds((current) => current.filter((item) => item !== id)); };
  const add = () => {
    const text = newLabel.trim();
    if (!text) return toast.error('Digite o nome da etiqueta.');
    const id = `custom-${Date.now()}`;
    setLabels((current) => [...current, { id, text }]);
    setSelectedIds((current) => [...current, id]);
    setNewLabel('');
  };
  const imprimir = () => {
    const printable = selected.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text);
    if (!printable.length) return toast.error('Selecione pelo menos uma etiqueta.');
    const pages: Label[][] = [];
    for (let i = 0; i < printable.length; i += 3) pages.push(printable.slice(i, i + 3));
    const html = pages.map((page, index) => `<section class="print-page ${index === pages.length - 1 ? 'last' : ''}">${page.map((label) => `<div class="cabinet-label"><div class="label-text">${labelHtml(label.text)}</div></div>`).join('')}</section>`).join('');
    const win = window.open('', '_blank');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão.');
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Etiquetas de Armário - TOPAC</title><style>@page{size:A4 portrait;margin:12mm 5mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.toolbar{position:sticky;top:0;z-index:2;display:flex;gap:8px;align-items:center;padding:10px 14px;background:#f3f4f6;border-bottom:1px solid #d1d5db}.toolbar button{border:0;border-radius:8px;padding:8px 12px;background:#111827;color:#fff;font-weight:700;cursor:pointer}.toolbar span{font-size:12px;color:#374151}.print-page{width:200mm;min-height:273mm;display:flex;flex-direction:column;gap:7mm;break-after:page}.print-page.last{break-after:auto}.cabinet-label{width:200mm;height:80mm;flex:0 0 80mm;border:.7pt dashed #777;display:flex;align-items:center;justify-content:center;padding:7mm 10mm;text-align:center;overflow:hidden;break-inside:avoid}.label-text{display:flex;width:100%;height:100%;align-items:center;justify-content:center;text-align:center;font-size:38pt;line-height:1.04;font-weight:900;text-transform:uppercase;overflow:hidden}@media print{.toolbar{display:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${printable.length} etiqueta(s) • 20 × 8 cm • até 3 por folha</span></div>${html}<script>(()=>{const fit=()=>document.querySelectorAll('.label-text').forEach((el)=>{let s=38;el.style.fontSize=s+'pt';while((el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight)&&s>14){s-=.5;el.style.fontSize=s+'pt'}});fit();window.addEventListener('beforeprint',fit)})()</script></body></html>`);
    win.document.close(); win.focus();
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedIds(labels.map((label) => label.id))}>Selecionar todas</Button><Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar</Button><Button size="sm" variant="ghost" onClick={() => { setLabels(DEFAULT_LABELS); setSelectedIds(DEFAULT_LABELS.map((label) => label.id)); }}>Restaurar padrão</Button></div>
    <div className="space-y-2">{labels.map((label) => <div key={label.id} className={`grid gap-2 rounded-xl border p-3 md:grid-cols-[auto_1fr_auto] md:items-center ${selectedIds.includes(label.id) ? 'border-[#ffc400] bg-[#ffc400]/5' : 'border-[#30263b] bg-black/20'}`}><input type="checkbox" checked={selectedIds.includes(label.id)} onChange={() => toggle(label.id)} className="h-5 w-5 accent-yellow-400" /><textarea value={label.text} onChange={(event) => setLabels((current) => current.map((item) => item.id === label.id ? { ...item, text: event.target.value } : item))} rows={label.text.includes('\n') ? 2 : 1} className="min-h-10 w-full resize-y rounded-lg border border-[#30263b] bg-[#080b10] px-3 py-2 text-sm font-bold uppercase text-white outline-none" /><Button size="icon" variant="ghost" onClick={() => remove(label.id)}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
    <div className="rounded-xl border border-[#30263b] bg-black/20 p-4"><label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Adicionar etiqueta</label><div className="mt-2 flex gap-2"><Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="Ex.: Documentos de Veículos" /><Button variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div></div>
    <Button onClick={imprimir} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd633]"><Printer className="mr-2 h-4 w-4" />Imprimir etiquetas 20 × 8 cm</Button>
  </div>;
};

export default CabinetLabelsStandalone;
