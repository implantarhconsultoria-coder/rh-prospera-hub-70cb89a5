import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileDown, Printer, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import m27Data from '@/assets/labels/m27-1';
import sprite1 from '@/assets/labels/sprite-1';
import sprite2 from '@/assets/labels/sprite-2';
import sprite3 from '@/assets/labels/sprite-3';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_LABEL_CATALOG,
  LABEL_SIZES,
  type EquipmentLabelTemplate,
  type LabelSizeKey,
} from '@/data/equipmentLabelCatalog';

const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const M27_URI = `data:image/webp;base64,${m27Data}`;
const SPRITE_URI = `data:image/webp;base64,${sprite1}${sprite2}${sprite3}`;

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const loadImage = (src: string) => {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem da etiqueta.'));
    img.src = src;
  });
  imageCache.set(src, promise);
  return promise;
};

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, min: number, family = 'Arial Black, Arial, sans-serif') => {
  let size = start;
  while (size > min) {
    ctx.font = `900 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
};

const drawImageCover = (ctx: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) => {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
};

const drawVariableBox = (
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
) => {
  roundedRect(ctx, x, y, w, h, 18 * scale);
  ctx.fillStyle = '#06162f';
  ctx.fill();
  ctx.strokeStyle = '#ffd400';
  ctx.lineWidth = Math.max(3, 5 * scale);
  ctx.stroke();

  const headerH = h * 0.36;
  ctx.save();
  roundedRect(ctx, x, y, w, headerH + 12 * scale, 18 * scale);
  ctx.clip();
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(x, y, w, headerH + 12 * scale);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#050d1b';
  ctx.font = `900 ${Math.max(17, 24 * scale)}px Arial Black, Arial, sans-serif`;
  ctx.fillText(label, x + w / 2, y + headerH / 2);

  const safe = value.trim() || '---';
  const fontSize = fitText(ctx, safe, w * 0.88, 60 * scale, 25 * scale);
  ctx.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 4 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.fillText(safe, x + w / 2, y + headerH + (h - headerH) / 2 + 2 * scale);
  ctx.shadowColor = 'transparent';
};

const drawApprovedM27 = async (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  patrimonio: string,
  serie: string,
) => {
  const base = await loadImage(M27_URI);
  drawImageCover(ctx, base, 0, 0, width, height);

  // A arte-base aprovada permanece intacta. Apenas o conteúdo dos dois campos variáveis é limpo e reescrito.
  const bodyColor = '#06162f';
  ctx.fillStyle = bodyColor;
  ctx.fillRect(width * 0.718, height * 0.409, width * 0.238, height * 0.056);
  ctx.fillRect(width * 0.718, height * 0.516, width * 0.238, height * 0.056);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,.72)';
  ctx.shadowBlur = Math.max(3, width * 0.004);
  ctx.shadowOffsetY = Math.max(2, width * 0.003);

  const drawValue = (value: string, y: number) => {
    const safe = value.trim() || '---';
    const size = fitText(ctx, safe, width * 0.224, width * 0.065, width * 0.035, 'Arial Black, Impact, Arial, sans-serif');
    ctx.font = `900 ${size}px Arial Black, Impact, Arial, sans-serif`;
    ctx.fillText(safe, width * 0.837, height * y);
  };
  drawValue(patrimonio, 0.437);
  drawValue(serie, 0.544);
  ctx.shadowColor = 'transparent';
};

const drawApprovedStyle = async (
  ctx: CanvasRenderingContext2D,
  item: EquipmentLabelTemplate,
  patrimonio: string,
  serie: string,
  width: number,
  height: number,
) => {
  const base = await loadImage(M27_URI);
  const sprite = await loadImage(SPRITE_URI);
  drawImageCover(ctx, base, 0, 0, width, height);
  const scale = width / 1535;

  // Mantém topo, logo, textura e rodapé da identidade aprovada; substitui somente a área específica do equipamento.
  const cover = ctx.createLinearGradient(0, height * 0.19, 0, height * 0.89);
  cover.addColorStop(0, '#061a39');
  cover.addColorStop(0.48, '#07305a');
  cover.addColorStop(1, '#051a36');
  ctx.fillStyle = cover;
  ctx.fillRect(0, height * 0.195, width, height * 0.69);

  // linhas decorativas do padrão TOPAC
  ctx.strokeStyle = 'rgba(255,212,0,.65)';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.beginPath();
  ctx.moveTo(width * 0.03, height * 0.23);
  ctx.lineTo(width * 0.20, height * 0.23);
  ctx.moveTo(width * 0.80, height * 0.23);
  ctx.lineTo(width * 0.97, height * 0.23);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  const title = item.title.toUpperCase();
  const titleSize = fitText(ctx, title, width * 0.91, width * 0.082, width * 0.045, 'Impact, Arial Black, Arial, sans-serif');
  ctx.font = `900 ${titleSize}px Impact, Arial Black, Arial, sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = 5 * scale;
  ctx.fillText(title, width / 2, height * 0.255);
  ctx.shadowColor = 'transparent';

  const bandX = width * 0.20;
  const bandY = height * 0.292;
  const bandW = width * 0.60;
  const bandH = height * 0.052;
  const band = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY);
  band.addColorStop(0, '#ffd400');
  band.addColorStop(0.75, '#ffca00');
  band.addColorStop(1, '#e9a900');
  ctx.fillStyle = band;
  ctx.fillRect(bandX, bandY, bandW, bandH);
  ctx.fillStyle = '#06162f';
  const modelText = `${item.brand} ${item.model}`.toUpperCase();
  const modelSize = fitText(ctx, modelText, bandW * 0.88, width * 0.048, width * 0.025);
  ctx.font = `900 ${modelSize}px Arial Black, Arial, sans-serif`;
  ctx.fillText(modelText, width / 2, bandY + bandH / 2);

  const imageX = width * 0.035;
  const imageY = height * 0.37;
  const imageW = width * 0.64;
  const imageH = height * 0.225;
  roundedRect(ctx, imageX, imageY, imageW, imageH, 18 * scale);
  ctx.fillStyle = '#061c3c';
  ctx.fill();

  // sprite: 4 colunas x 7 linhas, 28 equipamentos únicos, na mesma ordem do catálogo.
  const cols = 4;
  const rows = 7;
  const cellW = sprite.width / cols;
  const cellH = sprite.height / rows;
  const col = item.spriteIndex % cols;
  const row = Math.floor(item.spriteIndex / cols);
  const sx = col * cellW;
  const sy = row * cellH;
  const photoCanvas = document.createElement('canvas');
  photoCanvas.width = Math.max(1, Math.round(cellW));
  photoCanvas.height = Math.max(1, Math.round(cellH));
  const pctx = photoCanvas.getContext('2d');
  if (pctx) pctx.drawImage(sprite, sx, sy, cellW, cellH, 0, 0, photoCanvas.width, photoCanvas.height);
  drawImageCover(ctx, photoCanvas, imageX + 5 * scale, imageY + 5 * scale, imageW - 10 * scale, imageH - 10 * scale);

  const boxX = width * 0.705;
  const boxW = width * 0.26;
  const boxH = height * 0.096;
  drawVariableBox(ctx, 'Patrimônio', patrimonio, boxX, height * 0.382, boxW, boxH, scale);
  drawVariableBox(ctx, 'Número de Série', serie, boxX, height * 0.495, boxW, boxH, scale);

  const specsX = width * 0.035;
  const specsY = height * 0.625;
  const specsW = width * 0.93;
  const specsH = height * 0.235;
  roundedRect(ctx, specsX, specsY, specsW, specsH, 18 * scale);
  ctx.fillStyle = 'rgba(3,23,50,.97)';
  ctx.fill();
  ctx.strokeStyle = '#55c7ff';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.stroke();

  const headerW = specsW * 0.40;
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(specsX, specsY, headerW, height * 0.043);
  ctx.fillStyle = '#07172f';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.max(17, width * 0.026)}px Arial Black, Arial, sans-serif`;
  ctx.fillText('DADOS TÉCNICOS', specsX + width * 0.022, specsY + height * 0.0215);

  const count = item.specs.length;
  const columns = count > 5 ? 2 : 1;
  const perColumn = Math.ceil(count / columns);
  const innerTop = specsY + height * 0.058;
  const innerBottom = specsY + specsH - height * 0.018;
  const rowH = (innerBottom - innerTop) / Math.max(perColumn, 1);
  const colGap = width * 0.035;
  const colW = columns === 2 ? (specsW - colGap - width * 0.05) / 2 : specsW - width * 0.05;
  const fontSize = Math.max(14, Math.min(width * 0.019, rowH * 0.33));
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  ctx.textBaseline = 'top';

  item.specs.forEach((spec, index) => {
    const c = columns === 2 && index >= perColumn ? 1 : 0;
    const r = columns === 2 ? index % perColumn : index;
    const x = specsX + width * 0.025 + c * (colW + colGap);
    const y = innerTop + r * rowH;
    ctx.fillStyle = '#ffd400';
    ctx.beginPath();
    ctx.arc(x, y + fontSize * 0.47, Math.max(3, width * 0.0032), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    const lines = wrapText(ctx, spec, colW - width * 0.018).slice(0, 2);
    lines.forEach((line, lineIndex) => ctx.fillText(line, x + width * 0.012, y + lineIndex * fontSize * 1.06));
  });
};

const renderLabel = async (
  canvas: HTMLCanvasElement,
  item: EquipmentLabelTemplate,
  patrimonio: string,
  serie: string,
  sizeKey: LabelSizeKey,
) => {
  const size = LABEL_SIZES[sizeKey];
  const width = Math.round(size.widthMm * MM_TO_PX);
  const height = Math.round(size.heightMm * MM_TO_PX);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, width, height);
  if (item.specialTemplate === 'm27') await drawApprovedM27(ctx, width, height, patrimonio, serie);
  else await drawApprovedStyle(ctx, item, patrimonio, serie, width, height);
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
    renderLabel(canvas, selected, patrimonio, serie, sizeKey)
      .catch((error) => console.error('[etiquetas] render', error))
      .finally(() => active && setRendering(false));
    return () => { active = false; };
  }, [selected, patrimonio, serie, sizeKey]);

  const selectItem = (item: EquipmentLabelTemplate) => {
    setSelectedId(item.id);
    setSizeKey(item.recommendedSize);
    setPatrimonio('');
    setSerie('');
  };

  const fileBase = `${selected.brand}-${selected.model}-${patrimonio || 'sem-patrimonio'}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${fileBase}-${LABEL_SIZES[sizeKey].label.toLowerCase()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  const downloadPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = LABEL_SIZES[sizeKey];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [size.widthMm, size.heightMm], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, size.widthMm, size.heightMm, undefined, 'FAST');
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
              {EQUIPMENT_CATEGORIES.map((cat) => <button key={cat} onClick={() => setCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category === cat ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400'}`}>{cat}</button>)}
            </div>
          </div>

          <div className="max-h-[760px] space-y-2 overflow-auto pr-1">
            {filtered.map((item) => (
              <button key={item.id} onClick={() => selectItem(item)} className={`w-full rounded-xl border p-4 text-left transition ${selected.id === item.id ? 'border-[#ffc400] bg-[#171122] shadow-[0_0_24px_rgba(255,196,0,.08)]' : 'border-[#29232f] bg-[#080b10] hover:border-violet-500/60'}`}>
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-zinc-600">{item.category}</div>
                <div className="mt-1 font-black text-white">{item.title}</div>
                <div className="text-sm font-bold text-[#ffc400]">{item.brand} • {item.model}</div>
                <div className="mt-2 text-[11px] text-zinc-500">{LABEL_SIZES[item.recommendedSize].label} • {LABEL_SIZES[item.recommendedSize].widthMm / 10} × {LABEL_SIZES[item.recommendedSize].heightMm / 10} cm</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_500px]">
          <section className="rounded-xl border border-[#30263b] bg-[#080b10] p-5">
            <div className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-[.15em] text-violet-400">{selected.category}</div>
              <h2 className="mt-1 text-xl font-black text-white">{selected.title} • {selected.brand} {selected.model}</h2>
              <p className="mt-1 text-xs text-zinc-500">A arte e os dados técnicos são fixos. Somente os dois campos abaixo podem ser alterados.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Patrimônio</label><Input value={patrimonio} onChange={(e) => setPatrimonio(e.target.value.toUpperCase())} className="mt-2 h-12 text-lg font-black" placeholder="Ex.: A10.157" /></div>
              <div><label className="text-xs font-bold uppercase tracking-wide text-zinc-500">Número de Série</label><Input value={serie} onChange={(e) => setSerie(e.target.value.toUpperCase())} className="mt-2 h-12 text-lg font-black" placeholder="Ex.: 1165" /></div>
            </div>

            <div className="mt-5">
              <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Tamanho de impressão</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {(Object.keys(LABEL_SIZES) as LabelSizeKey[]).map((key) => {
                  const s = LABEL_SIZES[key];
                  return <button key={key} onClick={() => setSizeKey(key)} className={`rounded-xl border p-3 text-center ${sizeKey === key ? 'border-[#ffc400] bg-[#ffc400]/10 text-white' : 'border-[#30263b] bg-white/[0.02] text-zinc-400 hover:border-violet-500'}`}><div className="font-black">{s.label}</div><div className="text-xs">{s.widthMm / 10} × {s.heightMm / 10} cm</div>{selected.recommendedSize === key && <div className="mt-1 text-[9px] font-bold text-[#ffc400]">RECOMENDADO</div>}</button>;
                })}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#29232f] bg-black/20 p-4">
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-[#ffc400]">Dados técnicos fixos</div>
              <div className="grid gap-x-4 gap-y-1.5 text-xs text-zinc-400 md:grid-cols-2">{selected.specs.map((spec) => <div key={spec}>• {spec}</div>)}</div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={downloadPdf} disabled={rendering || !patrimonio.trim() || !serie.trim()} className="bg-[#ffc400] font-black text-black hover:bg-[#ffd633]"><FileDown className="mr-2 h-4 w-4" />Gerar PDF / Imprimir</Button>
              <Button variant="outline" onClick={downloadPng} disabled={rendering || !patrimonio.trim() || !serie.trim()}><Download className="mr-2 h-4 w-4" />Baixar PNG</Button>
              <Button variant="outline" onClick={downloadPdf} disabled={rendering || !patrimonio.trim() || !serie.trim()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
            </div>
          </section>

          <section className="rounded-xl border border-[#30263b] bg-[#05070a] p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] font-bold text-zinc-500"><span>PRÉ-VISUALIZAÇÃO</span><span>{LABEL_SIZES[sizeKey].widthMm / 10} × {LABEL_SIZES[sizeKey].heightMm / 10} cm • 300 DPI</span></div>
            <div className="flex min-h-[650px] items-center justify-center overflow-auto rounded-lg bg-[#11141a] p-3">
              <canvas ref={canvasRef} className="h-auto max-h-[780px] max-w-full bg-[#06162f] shadow-2xl" style={{ aspectRatio: `${LABEL_SIZES[sizeKey].widthMm}/${LABEL_SIZES[sizeKey].heightMm}` }} />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default EquipmentLabelGenerator;
