import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileDown, Printer, RefreshCw, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_LABEL_CATALOG,
  LABEL_SIZES,
  type EquipmentLabelTemplate,
  type LabelSizeKey,
} from '@/data/equipmentLabelCatalog';

const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const STORAGE_BASE = 'https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/etiquetas-artes/fixed';
const SOURCE_CELL_WIDTH = 450;
const SOURCE_CELL_HEIGHT = 620;

// Ordem exata das 28 artes finais recuperadas. Quatro artes por faixa.
const FIXED_POSTER_ORDER = [
  'm270', 'm57', 'm122', 'm27',
  't6000', 't3', 't5', 't111',
  't8', 't103', 't275', 't43_68',
  't58_68', 't1910', 'ram', 'mole',
  'gsh500', 'gsh11de', 'gsh16_28', 'gsh27vc',
  'mini_dumper', 'ibix25p', 'srv620', 'concret_cutter',
  'rcw900', 'cf2', 'gerador_portatil', 'gerador_estacionario',
] as const;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
let syncPromise: Promise<void> | null = null;

const posterPosition = (id: string) => {
  const index = FIXED_POSTER_ORDER.indexOf(id as (typeof FIXED_POSTER_ORDER)[number]);
  if (index < 0) throw new Error(`Arte final não cadastrada para ${id}.`);
  return {
    row: Math.floor(index / 4) + 1,
    col: index % 4,
  };
};

const rowUrl = (row: number) => `${STORAGE_BASE}/posters-row-${row}.webp`;

const loadImage = (src: string, bustCache = false) => {
  const effectiveSrc = bustCache ? `${src}?v=${Date.now()}` : src;
  if (!bustCache) {
    const cached = imageCache.get(src);
    if (cached) return cached;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a arte final deste equipamento.'));
    img.src = effectiveSrc;
  });
  if (!bustCache) imageCache.set(src, promise);
  return promise;
};

const syncFixedPosters = async () => {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const { data, error } = await supabase.functions.invoke('etiquetas-artes-sync', { body: {} });
    if (error) throw error;
    if (data?.ok === false) throw new Error('Não foi possível sincronizar as artes finais.');
    imageCache.clear();
  })();

  try {
    await syncPromise;
  } finally {
    syncPromise = null;
  }
};

const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
) => {
  let size = start;
  while (size > min) {
    ctx.font = `900 ${size}px Impact, Arial Black, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
};

type ArtRect = { x: number; y: number; width: number; height: number };

const drawPosterContain = (
  ctx: CanvasRenderingContext2D,
  rowImage: HTMLImageElement,
  col: number,
  canvasWidth: number,
  canvasHeight: number,
): ArtRect => {
  const scale = Math.min(canvasWidth / SOURCE_CELL_WIDTH, canvasHeight / SOURCE_CELL_HEIGHT);
  const width = SOURCE_CELL_WIDTH * scale;
  const height = SOURCE_CELL_HEIGHT * scale;
  const x = (canvasWidth - width) / 2;
  const y = (canvasHeight - height) / 2;

  ctx.fillStyle = '#06162f';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(
    rowImage,
    col * SOURCE_CELL_WIDTH,
    0,
    SOURCE_CELL_WIDTH,
    SOURCE_CELL_HEIGHT,
    x,
    y,
    width,
    height,
  );

  return { x, y, width, height };
};

const drawEditableValue = (
  ctx: CanvasRenderingContext2D,
  art: ArtRect,
  value: string,
  normalizedY: number,
) => {
  const x = art.x + art.width * 0.704;
  const y = art.y + art.height * normalizedY;
  const width = art.width * 0.252;
  const height = art.height * 0.059;

  // Cobre somente o valor-padrão da arte. Título, bordas e restante da arte ficam intactos.
  ctx.fillStyle = '#071a35';
  ctx.fillRect(x, y, width, height);

  const safe = value.trim() || '---';
  const size = fitText(ctx, safe, width * 0.92, art.width * 0.063, art.width * 0.030);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${size}px Impact, Arial Black, Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,.75)';
  ctx.shadowBlur = Math.max(2, art.width * 0.004);
  ctx.shadowOffsetY = Math.max(1, art.width * 0.002);
  ctx.fillText(safe, x + width / 2, y + height / 2);
  ctx.restore();
};

const renderFixedLabel = async (
  canvas: HTMLCanvasElement,
  item: EquipmentLabelTemplate,
  patrimonio: string,
  serie: string,
  sizeKey: LabelSizeKey,
  allowSync: boolean,
) => {
  const size = LABEL_SIZES[sizeKey];
  const width = Math.round(size.widthMm * MM_TO_PX);
  const height = Math.round(size.heightMm * MM_TO_PX);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível para gerar a etiqueta.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const { row, col } = posterPosition(item.id);
  const src = rowUrl(row);
  let rowImage: HTMLImageElement;

  try {
    rowImage = await loadImage(src);
  } catch (firstError) {
    imageCache.delete(src);
    if (!allowSync) throw firstError;
    await syncFixedPosters();
    rowImage = await loadImage(src, true);
  }

  const art = drawPosterContain(ctx, rowImage, col, width, height);
  drawEditableValue(ctx, art, patrimonio, 0.407);
  drawEditableValue(ctx, art, serie, 0.516);
};

type Props = { embedded?: boolean };

const EquipmentLabelGenerator: React.FC<Props> = ({ embedded = false }) => {
  const [selectedId, setSelectedId] = useState('m27');
  const [patrimonio, setPatrimonio] = useState('A10.157');
  const [serie, setSerie] = useState('1165');
  const [sizeKey, setSizeKey] = useState<LabelSizeKey>('large');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selected = useMemo(
    () => EQUIPMENT_LABEL_CATALOG.find((item) => item.id === selectedId) || EQUIPMENT_LABEL_CATALOG[0],
    [selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EQUIPMENT_LABEL_CATALOG.filter((item) =>
      (category === 'Todos' || item.category === category) &&
      (!q || `${item.title} ${item.brand} ${item.model}`.toLowerCase().includes(q)),
    );
  }, [query, category]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    setRendering(true);
    setRenderError('');

    renderFixedLabel(canvas, selected, patrimonio, serie, sizeKey, true)
      .catch((error) => {
        console.error('[etiquetas] arte final', error);
        if (active) setRenderError(error instanceof Error ? error.message : 'Falha ao carregar a arte final.');
      })
      .finally(() => active && setRendering(false));

    return () => { active = false; };
  }, [selected, patrimonio, serie, sizeKey, retryKey]);

  const selectItem = (item: EquipmentLabelTemplate) => {
    setSelectedId(item.id);
    setSizeKey(item.recommendedSize);
    setPatrimonio('');
    setSerie('');
    setRenderError('');
  };

  const retry = async () => {
    setRendering(true);
    setRenderError('');
    try {
      await syncFixedPosters();
      setRetryKey((value) => value + 1);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'Falha ao sincronizar as artes finais.');
      setRendering(false);
    }
  };

  const fileBase = `${selected.brand}-${selected.model}-${patrimonio || 'sem-patrimonio'}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const canExport = !rendering && !renderError && Boolean(patrimonio.trim()) && Boolean(serie.trim());

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canExport) return;
    const link = document.createElement('a');
    link.download = `${fileBase}-${LABEL_SIZES[sizeKey].label.toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const downloadPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas || !canExport) return;
    const size = LABEL_SIZES[sizeKey];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [size.widthMm, size.heightMm], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, size.widthMm, size.heightMm, undefined, 'FAST');
    pdf.save(`${fileBase}-${size.widthMm}x${size.heightMm}mm.pdf`);
  };

  return (
    <div className={embedded ? '' : 'min-h-screen'}>
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-[#30263b] bg-[#080b10] p-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="Buscar equipamento ou modelo..." />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setCategory('Todos')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category === 'Todos' ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Todos</button>
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category === cat ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400'}`}>{cat}</button>
              ))}
            </div>
          </div>

          <div className="max-h-[760px] space-y-2 overflow-auto pr-1">
            {filtered.map((item) => (
              <button key={item.id} onClick={() => selectItem(item)} className={`w-full rounded-xl border p-4 text-left transition ${selected.id === item.id ? 'border-[#ffc400] bg-[#171122] shadow-[0_0_24px_rgba(255,196,0,.08)]' : 'border-[#29232f] bg-[#080b10] hover:border-violet-500/60'}`}>
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-600">{item.category}</div>
                <div className="mt-1 font-black text-white">{item.title}</div>
                <div className="text-sm font-bold text-[#ffc400]">{item.brand} • {item.model}</div>
                <div className="mt-2 text-[11px] text-zinc-500">ARTE FINAL FIXA • {LABEL_SIZES[item.recommendedSize].widthMm / 10} × {LABEL_SIZES[item.recommendedSize].heightMm / 10} cm</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_500px]">
          <section className="rounded-xl border border-[#30263b] bg-[#080b10] p-5">
            <div className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-[.15em] text-violet-400">{selected.category}</div>
              <h2 className="mt-1 text-xl font-black text-white">{selected.title} • {selected.brand} {selected.model}</h2>
              <p className="mt-1 text-xs text-zinc-500">Arte final travada. Somente Patrimônio e Número de Série são editáveis.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Patrimônio</label>
                <Input value={patrimonio} onChange={(e) => setPatrimonio(e.target.value.toUpperCase())} className="mt-2 h-12 text-lg font-black" placeholder="Ex.: A10.157" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Número de Série</label>
                <Input value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} className="mt-2 h-12 text-lg font-black" placeholder="Ex.: 1165" />
              </div>
            </div>

            <div className="mt-5">
              <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Tamanho de impressão</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(Object.keys(LABEL_SIZES) as LabelSizeKey[]).map((key) => {
                  const size = LABEL_SIZES[key];
                  return (
                    <button key={key} onClick={() => setSizeKey(key)} className={`rounded-xl border p-3 text-center ${sizeKey === key ? 'border-[#ffc400] bg-[#ffc400]/10 text-white' : 'border-[#30263b] bg-white/[0.02] text-zinc-400 hover:border-violet-500'}`}>
                      <div className="font-black">{size.label}</div>
                      <div className="text-xs">{size.widthMm / 10} × {size.heightMm / 10} cm</div>
                      {selected.recommendedSize === key && <div className="mt-1 text-[9px] font-bold text-[#ffc400]">RECOMENDADO</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#29232f] bg-black/20 p-4">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#ffc400]">Dados técnicos fixos</div>
              <div className="grid gap-x-4 gap-y-1.5 text-xs text-zinc-400 md:grid-cols-2">
                {selected.specs.map((spec) => <div key={spec}>• {spec}</div>)}
              </div>
            </div>

            {renderError && (
              <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                <div className="font-bold">{renderError}</div>
                <Button variant="outline" size="sm" onClick={retry} className="mt-3 border-red-400/40">
                  <RefreshCw className="mr-2 h-4 w-4" />Sincronizar artes e tentar novamente
                </Button>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={downloadPdf} disabled={!canExport} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd633]"><FileDown className="mr-2 h-4 w-4" />Gerar PDF / Imprimir</Button>
              <Button variant="outline" onClick={downloadPng} disabled={!canExport}><Download className="mr-2 h-4 w-4" />Baixar PNG</Button>
              <Button variant="outline" onClick={downloadPdf} disabled={!canExport}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
            </div>
          </section>

          <section className="rounded-xl border border-[#30263b] bg-[#05070a] p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] font-bold text-zinc-500"><span>PRÉ-VISUALIZAÇÃO</span><span>{LABEL_SIZES[sizeKey].widthMm / 10} × {LABEL_SIZES[sizeKey].heightMm / 10} cm • 300 DPI</span></div>
            <div className="flex min-h-[650px] items-center justify-center overflow-auto rounded-lg bg-[#11141a] p-3">
              {rendering && <div className="absolute z-10 rounded-lg bg-black/70 px-4 py-2 text-xs font-bold text-white">Carregando arte final...</div>}
              <canvas ref={canvasRef} className="h-auto max-h-[780px] max-w-full bg-[#06162f] shadow-2xl" style={{ aspectRatio: `${LABEL_SIZES[sizeKey].widthMm}/${LABEL_SIZES[sizeKey].heightMm}` }} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default EquipmentLabelGenerator;
