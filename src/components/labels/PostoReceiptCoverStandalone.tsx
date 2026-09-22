import React, { useEffect, useState } from 'react';
import { CalendarDays, Fuel, Printer, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type PrintedPeriod = {
  id: string;
  period_start: string;
  period_end: string;
  created_at: string;
};
type PendingPrint = { start: string; end: string; lastId: string | null };

const todayLocal = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const dayAfter = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day + 1, 12);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const brDate = (date: string) => date ? date.split('-').reverse().join('/') : '__/__/____';

const PostoReceiptCoverStandalone: React.FC = () => {
  const [last, setLast] = useState<PrintedPeriod | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(todayLocal);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingPrint | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadPeriod = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('receipt_post_label_prints')
      .select('id,period_start,period_end,created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (error) {
      setLoadError(true);
      toast.error('Não foi possível consultar o último período. Tente novamente.');
      return;
    }
    setLoadError(false);
    setLast((data || null) as PrintedPeriod | null);
    setStart(data ? dayAfter(data.period_end) : '');
    setEnd(todayLocal());
    setPending(null);
  };

  useEffect(() => { void loadPeriod(); }, []);

  const valid = !!start && !!end && start <= end && end <= todayLocal();
  const makePrint = () => {
    if (loading || loadError) return toast.error('Aguarde a consulta do último período.');
    if (!valid) return toast.error('Informe um período válido, sem datas futuras.');
    const win = window.open('', '_blank');
    if (!win) return toast.error('Habilite a janela de impressão no navegador.');

    // Folha A4 inteira. Somente o bloco central ocupa 10 cm de altura;
    // nenhum recorte, faixa avulsa ou marca de corte na impressão.
    const period = `${brDate(start)} até ${brDate(end)}`;
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibos do Posto - ${period}</title><style>
      @page{size:A4 portrait;margin:0}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:white;font-family:Arial,Helvetica,sans-serif;color:#073d29}
      .toolbar{display:flex;gap:12px;align-items:center;padding:12px 16px;background:#f3f4f6;color:#1f2937}
      .toolbar button{border:0;border-radius:8px;padding:10px 16px;background:#06432c;color:white;font-weight:800;cursor:pointer}
      .toolbar span{font-size:12px}
      .sheet{width:210mm;height:297mm;position:relative;overflow:hidden;background:white;margin:0 auto}
      .face{position:absolute;left:18mm;top:98.5mm;width:174mm;height:100mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .rule{height:.55mm;width:142mm;background:#063d29;flex-shrink:0}
      .pump{height:19mm;width:19mm;margin:3mm 0 1mm;flex-shrink:0}
      .heading{font-size:26pt;line-height:1.03;letter-spacing:-.6pt;font-weight:900;margin:0 0 3.5mm;text-transform:uppercase}
      .period{width:142mm;background:#eef4f1;border-radius:3mm;padding:2.8mm 2mm 3.3mm;margin-bottom:3.5mm}
      .period b{display:block;font-size:12pt;line-height:1.1;margin-bottom:1.5mm}
      .dates{font-size:14pt;font-weight:800;white-space:nowrap;line-height:1.3}
      @media screen{body{background:#eee}.sheet{margin:22px auto 36px;box-shadow:0 6px 30px #0002}}
      @media print{.toolbar{display:none}.sheet{margin:0;box-shadow:none}}
    </style></head><body>
    <div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>Uma folha A4 inteira • retrato • não recortar • imprimir em tamanho real (100%)</span></div>
    <main class="sheet"><section class="face">
    <div class="rule"></div>
    <svg class="pump" viewBox="0 0 24 24" fill="none" stroke="#063d29" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h12M5 21V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M5 11h10M8 6h4M15 7h2l3 3v8a2 2 0 0 1-4 0v-5"/><path d="M20 10v3h-4"/></svg>
    <h1 class="heading">RECIBOS<br>DO POSTO</h1>
    <div class="period"><b>PERÍODO</b><div class="dates">${period}</div></div>
    <div class="rule"></div>
    </section></main></body></html>`);
    win.document.close();
    win.focus();
    setPending({ start, end, lastId: last?.id ?? null });
    toast.info('Após imprimir ou salvar o PDF, confirme o fechamento aqui para avançar o próximo período.');
  };

  const confirmPrint = async () => {
    if (!pending || saving) return;
    setSaving(true);
    try {
      // Reconsultar impede confirmar uma faixa baseada num fechamento já alterado em outra sessão.
      const { data: latest, error: readError } = await (supabase as any)
        .from('receipt_post_label_prints')
        .select('id').order('created_at', { ascending: false })
        .order('id', { ascending: false }).limit(1).maybeSingle();
      if (readError) throw readError;
      if ((latest?.id ?? null) !== pending.lastId) {
        toast.error('Outro fechamento foi registrado. Período atualizado; gere a folha novamente.');
        await loadPeriod();
        return;
      }
      const { error } = await (supabase as any).from('receipt_post_label_prints')
        .insert({ period_start: pending.start, period_end: pending.end });
      if (error) throw error;
      toast.success('Período fechado e salvo. A próxima folha começará no dia seguinte.');
      await loadPeriod();
    } catch {
      toast.error('Não foi possível salvar o fechamento. Não foi avançado nenhum período.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-5">
    <div className="rounded-xl border border-[#30263b] bg-black/20 p-4">
      <p className="text-sm font-bold text-white">Capa para enrolar os recibos</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">Uma folha sulfite A4 inteira, em retrato, sem recortar. A identificação fica no meio da folha, totalmente dentro de 10 cm de altura, para aparecer na parte externa do pacote.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-2"><span className="text-xs font-bold text-zinc-300">Data inicial (editável)</span><Input type="date" value={start} onChange={e => { setStart(e.target.value); setPending(null); }} disabled={loading || saving} /></label>
      <label className="space-y-2"><span className="text-xs font-bold text-zinc-300">Data final (editável)</span><Input type="date" value={end} onChange={e => { setEnd(e.target.value); setPending(null); }} disabled={loading || saving} /></label>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
      <CalendarDays className="h-4 w-4 text-emerald-400" />
      {loading ? 'Consultando último período...' : loadError ? 'Erro ao carregar histórico.' : last
        ? `Último período fechado: ${brDate(last.period_start)} até ${brDate(last.period_end)}. A data inicial sugerida é o dia seguinte.`
        : 'Primeiro uso: escolha a data inicial dos recibos antigos. Depois, as próximas datas serão sugeridas automaticamente.'}
      <Button size="sm" variant="ghost" disabled={saving || loading} onClick={() => void loadPeriod()}><RefreshCw className="mr-1 h-3 w-3" />Atualizar</Button>
    </div>
    <div className="mx-auto w-full max-w-[365px] overflow-hidden rounded border border-zinc-300 bg-white text-[#063d29] shadow-xl" style={{aspectRatio:'210 / 297'}}>
      <div className="relative h-full w-full">
        <div className="absolute left-[8.57%] top-[33.16%] flex h-[33.67%] w-[82.86%] flex-col items-center justify-center text-center">
          <div className="h-[2px] w-[82%] bg-[#063d29]" />
          <Fuel className="my-[4%] h-[19%] w-[19%]" strokeWidth={1.9} />
          <strong className="text-[clamp(15px,4vw,24px)] font-black leading-[.99]">RECIBOS<br/>DO POSTO</strong>
          <div className="my-[4%] w-[82%] rounded-md bg-[#eef4f1] px-1 py-[3%]">
            <strong className="block text-[clamp(10px,2.8vw,14px)]">PERÍODO</strong>
            <span className="mt-1 block whitespace-nowrap text-[clamp(10px,2.5vw,13px)] font-bold">{brDate(start)} até {brDate(end)}</span>
          </div>
          <div className="h-[2px] w-[82%] bg-[#063d29]" />
        </div>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button onClick={makePrint} disabled={loading || loadError || saving || !valid} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd633]"><Printer className="mr-2 h-4 w-4" />Gerar folha A4 / imprimir</Button>
      {pending && <Button onClick={() => void confirmPrint()} disabled={saving} variant="outline" className="border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"><CheckCircle2 className="mr-2 h-4 w-4" />{saving ? 'Salvando...' : 'Já imprimi — confirmar período'}</Button>}
    </div>
    {pending && <p className="text-xs text-amber-300">Confirme somente depois de imprimir ou salvar o PDF. Fechar a aba de impressão não altera o último período salvo.</p>}
  </div>;
};

export default PostoReceiptCoverStandalone;
