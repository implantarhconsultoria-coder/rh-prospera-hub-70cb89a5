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
const cutoutCache = new Map<number, HTMLCanvasElement>();

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

const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
  family = 'Arial Black, Arial, sans-serif',
) => {
  let size = start;
  while (size > min) {
    ctx.font = `900 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
};

const drawImageCover = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
};

const drawImageContain = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const scale = Math.min(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};

const getEquipmentCutout = async (item: EquipmentLabelTemplate) => {
  const cached = cutoutCache.get(item.spriteIndex);
  if (cached) return cached;

  const sprite = await loadImage(SPRITE_URI);
  const cols = 4;
  const rows = 7;
  const cellW = Math.floor(sprite.width / cols);
  const cellH = Math.floor(sprite.height / rows);
  const col = item.spriteIndex % cols;
  const row = Math.floor(item.spriteIndex / cols);

  const raw = document.createElement('canvas');
  raw.width = cellW;
  raw.height = cellH;
  const rctx = raw.getContext('2d', { willReadFrequently: true });
  if (!rctx) return raw;
  rctx.drawImage(sprite, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);

  // Remove o papel branco/cinza do catálogo e preserva o equipamento real.
  const image = rctx.getImageData(0, 0, cellW, cellH);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const brightness = (r + g + b) / 3;
    if (brightness > 244 && chroma < 16) d[i + 3] = 0;
    else if (brightness > 225 && chroma < 18) d[i + 3] = Math.round(255 * ((244 - brightness) / 19));
  }
  rctx.putImageData(image, 0, 0);
  cutoutCache.set(item.spriteIndex, raw);
  return raw;
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
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 18 * scale;
  ctx.shadowOffsetY = 8 * scale;
  roundedRect(ctx, x, y, w, h, 20 * scale);
  ctx.fillStyle = '#071a35';
  ctx.fill();
  ctx.restore();

  roundedRect(ctx, x, y, w, h, 20 * scale);
  ctx.strokeStyle = '#ffd400';
  ctx.lineWidth = Math.max(3, 5 * scale);
  ctx.stroke();

  const headerH = h * 0.36;
  ctx.save();
  roundedRect(ctx, x, y, w, headerH + 12 * scale, 20 * scale);
  ctx.clip();
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, '#ffdf00');
  grad.addColorStop(1, '#ffc400');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, headerH + 12 * scale);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#061325';
  ctx.font = `900 ${Math.max(18, 29 * scale)}px Arial Black, Arial, sans-serif`;
  ctx.fillText(label, x + w / 2, y + headerH / 2);

  const safe = value.trim() || '---';
  const fontSize = fitText(ctx, safe, w * 0.90, 66 * scale, 27 * scale);
  ctx.font = `900 ${fontSize}px Impact, Arial Black, Arial, sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 5 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.fillText(safe, x + w / 2, y + headerH + (h - headerH) / 2 + 3 * scale);
  ctx.shadowColor = 'transparent';
};

const iconForSpec = (spec: string) => {
  const s = spec.toLowerCase();
  if (s.includes('peso')) return 'KG';
  if (s.includes('pressão')) return '◴';
  if (s.includes('motor') || s.includes('potência')) return '⚙';
  if (s.includes('combustível') || s.includes('tanque')) return '▣';
  if (s.includes('dimens') || s.includes('comprimento') || s.includes('largura')) return '◇';
  if (s.includes('ruído')) return ')))';
  if (s.includes('consumo de ar') || s.includes('pcm') || s.includes('descarga')) return '≋';
  if (s.includes('golpes') || s.includes('impactos') || s.includes('frequência')) return '◷';
  if (s.includes('ferramenta') || s.includes('encaixe')) return '⌕';
  if (s.includes('profundidade')) return '↓';
  if (s.includes('velocidade')) return '≫';
  if (s.includes('área')) return 'm²';
  return '◆';
};

const splitSpec = (spec: string) => {
  const index = spec.indexOf(':');
  if (index < 0) return { label: '', value: spec };
  return { label: spec.slice(0, index + 1), value: spec.slice(index + 1).trim() };
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

  // Mantém exatamente a arte aprovada do M-27 e troca somente os valores.
  ctx.fillStyle = '#06162f';
  ctx.fillRect(width * 0.718, height * 0.409, width * 0.238, height * 0.056);
  ctx.fillRect(width * 0.718, height * 0.516, width * 0.238, height * 0.056);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.72)';
  ctx.shadowBlur = Math.max(3, width * 0.004);
  ctx.shadowOffsetY = Math.max(2, width * 0.003);

  const drawValue = (value: string, y: number) => {
    const safe = value.trim() || '---';
    const size = fitText(ctx, safe, width * 0.224, width * 0.065, width * 0.035, 'Impact, Arial Black, Arial, sans-serif');
    ctx.font = `900 ${size}px Impact, Arial Black, Arial, sans-serif`;
    ctx.fillText(safe, width * 0.837, height * y);
  };
  drawValue(patrimonio, 0.437);
  drawValue(serie, 0.544);
  ctx.shadowColor = 'transparent';
};

const drawFinalPoster = async (
  ctx: CanvasRenderingContext2D,
  item: EquipmentLabelTemplate,
  patrimonio: string,
  serie: string,
  width: number,
  height: number,
) => {
  const base = await loadImage(M27_URI);
  drawImageCover(ctx, base, 0, 0, width, height);
  const scale = width / 1535;

  // Refaz a área central no mesmo padrão das artes finais aprovadas.
  const central = ctx.createLinearGradient(0, height * 0.19, 0, height * 0.90);
  central.addColorStop(0, '#061a38');
  central.addColorStop(0.46, '#082b55');
  central.addColorStop(1, '#05182f');
  ctx.fillStyle = central;
  ctx.fillRect(0, height * 0.19, width, height * 0.705);

  // textura geométrica discreta
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = '#2a75b8';
  ctx.lineWidth = 2 * scale;
  for (let i = -2; i < 11; i++) {
    ctx.beginPath();
    ctx.moveTo(i * width * 0.13, height * 0.19);
    ctx.lineTo((i + 4) * width * 0.13, height * 0.89);
    ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${Math.max(16, width * 0.024)}px Arial, sans-serif`;
  ctx.fillText('DA LOCAÇÃO À MANUTENÇÃO E TRANSPORTE', width / 2, height * 0.205);

  const title = item.title.toUpperCase();
  const titleSize = fitText(ctx, title, width * 0.91, width * 0.091, width * 0.046, 'Impact, Arial Black, Arial, sans-serif');
  ctx.font = `900 ${titleSize}px Impact, Arial Black, Arial, sans-serif`;
  ctx.fillStyle = '#f7f7f7';
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 7 * scale;
  ctx.shadowOffsetY = 5 * scale;
  ctx.fillText(title, width / 2, height * 0.262);
  ctx.shadowColor = 'transparent';

  const bandX = width * 0.20;
  const bandY = height * 0.303;
  const bandW = width * 0.61;
  const bandH = height * 0.050;
  const band = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY);
  band.addColorStop(0, '#ffdf00');
  band.addColorStop(0.8, '#ffc400');
  band.addColorStop(1, '#e4a300');
  ctx.fillStyle = band;
  ctx.fillRect(bandX, bandY, bandW, bandH);
  ctx.fillStyle = '#07162f';
  const modelText = `${item.brand} ${item.model}`.toUpperCase();
  const modelSize = fitText(ctx, modelText, bandW * 0.88, width * 0.050, width * 0.025);
  ctx.font = `900 ${modelSize}px Arial Black, Arial, sans-serif`;
  ctx.fillText(modelText, width / 2, bandY + bandH / 2);

  const cutout = await getEquipmentCutout(item);
  const imageX = width * 0.025;
  const imageY = height * 0.355;
  const imageW = width * 0.66;
  const imageH = height * 0.255;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.52)';
  ctx.shadowBlur = 22 * scale;
  ctx.shadowOffsetY = 12 * scale;
  drawImageContain(ctx, cutout, imageX, imageY, imageW, imageH);
  ctx.restore();

  const boxX = width * 0.715;
  const boxW = width * 0.255;
  const boxH = height * 0.095;
  drawVariableBox(ctx, 'Patrimônio', patrimonio, boxX, height * 0.382, boxW, boxH, scale);
  drawVariableBox(ctx, 'Número de Série', serie, boxX, height * 0.495, boxW, boxH, scale);

  const specsX = width * 0.035;
  const specsY = height * 0.635;
  const specsW = width * 0.93;
  const specsH = height * 0.235;
  roundedRect(ctx, specsX, specsY, specsW, specsH, 18 * scale);
  ctx.fillStyle = 'rgba(3,23,50,.975)';
  ctx.fill();
  ctx.strokeStyle = '#55c7ff';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.stroke();

  const headerW = specsW * 0.40;
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(specsX, specsY, headerW, height * 0.042);
  ctx.fillStyle = '#07172f';
  ctx.textAlign = 'left';
  ctx.font = `900 ${Math.max(17, width * 0.027)}px Arial Black, Arial, sans-serif`;
  ctx.fillText('DADOS TÉCNICOS', specsX + width * 0.023, specsY + height * 0.021);

  const count = item.specs.length;
  const columns = count >= 5 ? 2 : Math.min(count, 3);
  const rows = Math.ceil(count / columns);
  const innerTop = specsY + height * 0.058;
  const innerBottom = specsY + specsH - height * 0.018;
  const rowH = (innerBottom - innerTop) / Math.max(rows, 1);
  const colW = (specsW - width * 0.05) / columns;

  item.specs.forEach((spec, index) => {
    const col = Math.floor(index / rows);
    const row = index % rows;
    const x = specsX + width * 0.025 + col * colW;
    const y = innerTop + row * rowH;
    const { label, value } = splitSpec(spec);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd400';
    ctx.font = `900 ${Math.max(16, width * 0.025)}px Arial Black, Arial, sans-serif`;
    ctx.fillText(iconForSpec(spec), x + width * 0.028, y + rowH * 0.18);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8edf5';
    ctx.font = `500 ${Math.max(12, width * 0.0155)}px Arial, sans-serif`;
    if (label) ctx.fillText(label, x + width * 0.057, y + rowH * 0.05);
    const valueSize = fitText(ctx, value, colW - width * 0.075, width * 0.025, width * 0.014, 'Arial Black, Arial, sans-serif');
    ctx.fillStyle = '#ffd400';
    ctx.font = `900 ${valueSize}px Arial Black, Arial, sans-serif`;
    ctx.fillText(value, x + width * 0.057, y + rowH * (label ? 0.42 : 0.27));
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
  else await drawFinalPoster(ctx, item, patrimonio, serie, width, height);
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
              <p className="mt-1 text-xs text-zinc-500">Arte final e dados técnicos fixos. Somente Patrimônio e Número de Série podem ser alterados.</p>
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
                  const s = LABEL_SIZES[key];
                  return (
                    <button key={key} onClick={() => setSizeKey(key)} className={`rounded-xl border p-3 text-center ${sizeKey === key ? 'border-[#ffc400] bg-[#ffc400]/10 text-white' : 'border-[#30263b] bg-white/[0.02] text-zinc-400 hover:border-violet-500'}`}>
                      <div className="font-black">{s.label}</div>
                      <div className="text-xs">{s.widthMm / 10} × {s.heightMm / 10} cm</div>
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
