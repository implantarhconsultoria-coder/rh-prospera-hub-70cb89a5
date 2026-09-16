import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileDown, Printer, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_LABEL_CATALOG,
  LABEL_SIZES,
  type EquipmentLabelTemplate,
  type LabelSizeKey,
} from '@/data/equipmentLabelCatalog';

const DPI = 300;
const MM_TO_PX = DPI / 25.4;

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

const fitText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, min: number) => {
  let size = start;
  while (size > min) {
    ctx.font = `900 ${size}px Arial, sans-serif`;
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

const drawVariableBox = (ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, w: number, h: number, scale: number) => {
  roundedRect(ctx, x, y, w, h, 18 * scale);
  ctx.fillStyle = '#061a3a';
  ctx.fill();
  ctx.strokeStyle = '#f5c400';
  ctx.lineWidth = Math.max(2, 4 * scale);
  ctx.stroke();

  const headerH = h * 0.36;
  ctx.save();
  roundedRect(ctx, x, y, w, headerH + 12 * scale, 18 * scale);
  ctx.clip();
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(x, y, w, headerH + 12 * scale);
  ctx.restore();

  ctx.fillStyle = '#07172f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.max(18, 26 * scale)}px Arial, sans-serif`;
  ctx.fillText(label, x + w / 2, y + headerH / 2 + 1 * scale);

  const safeValue = value.trim() || '---';
  const fontSize = fitText(ctx, safeValue, w * 0.88, 58 * scale, 25 * scale);
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(safeValue, x + w / 2, y + headerH + (h - headerH) / 2 + 2 * scale);
};

const drawEquipmentGlyph = (ctx: CanvasRenderingContext2D, item: EquipmentLabelTemplate, x: number, y: number, w: number, h: number, scale: number) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#f5c400';
  ctx.strokeStyle = '#061a38';
  ctx.lineWidth = Math.max(3, 8 * scale);
  const cat = item.category;

  if (cat === 'Compressores de Ar') {
    roundedRect(ctx, w * 0.10, h * 0.20, w * 0.70, h * 0.52, 28 * scale); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#061a38'; ctx.fillRect(w * 0.60, h * 0.28, w * 0.13, h * 0.28);
    ctx.fillStyle = '#f5c400'; ctx.beginPath(); ctx.arc(w * 0.25, h * 0.78, h * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(w * 0.67, h * 0.78, h * 0.13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c9d0d8'; ctx.fillRect(w * 0.77, h * 0.58, w * 0.20, h * 0.06); ctx.strokeRect(w * 0.77, h * 0.58, w * 0.20, h * 0.06);
  } else if (cat === 'Equipamentos Pneumáticos' || item.title.toLowerCase().includes('rompedor')) {
    roundedRect(ctx, w * 0.38, h * 0.10, w * 0.24, h * 0.36, 24 * scale); ctx.fill(); ctx.stroke();
    ctx.fillRect(w * 0.43, h * 0.43, w * 0.14, h * 0.30); ctx.strokeRect(w * 0.43, h * 0.43, w * 0.14, h * 0.30);
    ctx.beginPath(); ctx.moveTo(w * 0.50, h * 0.72); ctx.lineTo(w * 0.42, h * 0.95); ctx.lineTo(w * 0.58, h * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(w * 0.22, h * 0.18, w * 0.56, h * 0.07); ctx.strokeRect(w * 0.22, h * 0.18, w * 0.56, h * 0.07);
  } else if (cat === 'Corte e Compactação') {
    roundedRect(ctx, w * 0.15, h * 0.32, w * 0.62, h * 0.36, 24 * scale); ctx.fill(); ctx.stroke();
    ctx.fillRect(w * 0.28, h * 0.12, w * 0.08, h * 0.28); ctx.strokeRect(w * 0.28, h * 0.12, w * 0.08, h * 0.28);
    ctx.fillRect(w * 0.20, h * 0.72, w * 0.64, h * 0.10); ctx.strokeRect(w * 0.20, h * 0.72, w * 0.64, h * 0.10);
  } else if (cat === 'Geradores') {
    roundedRect(ctx, w * 0.16, h * 0.22, w * 0.68, h * 0.58, 26 * scale); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#061a38';
    for (let i=0;i<4;i++) ctx.fillRect(w * 0.28, h * (0.34 + i*0.08), w * 0.34, h * 0.035);
    ctx.fillStyle = '#f5c400'; ctx.beginPath(); ctx.arc(w * 0.71, h * 0.49, h * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    roundedRect(ctx, w * 0.16, h * 0.25, w * 0.68, h * 0.48, 26 * scale); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#061a38'; ctx.fillRect(w * 0.30, h * 0.37, w * 0.40, h * 0.06);
    ctx.fillRect(w * 0.30, h * 0.50, w * 0.30, h * 0.06);
  }

  ctx.fillStyle = '#061a38';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.max(22, 38 * scale)}px Arial, sans-serif`;
  ctx.fillText(item.model, w / 2, h * 0.53);
  ctx.restore();
};

const drawGeneric = (
  ctx: CanvasRenderingContext2D,
  item: EquipmentLabelTemplate,
  patrimonio: string,
  serie: string,
  width: number,
  height: number,
) => {
  const scale = width / 1535;
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#031631');
  bg.addColorStop(0.5, '#062b59');
  bg.addColorStop(1, '#04162d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#0a376c';
  ctx.fillRect(0, 0, width, height * 0.13);
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(0, height * 0.13, width, Math.max(8, height * 0.008));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${50 * scale}px Arial, sans-serif`;
  ctx.fillText('GRUPO TOPAC', width / 2, height * 0.045);
  ctx.font = `800 ${24 * scale}px Arial, sans-serif`;
  ctx.fillText('LOCAÇÕES • DA LOCAÇÃO À MANUTENÇÃO E TRANSPORTE', width / 2, height * 0.09);

  ctx.fillStyle = '#ffffff';
  const title = item.title.toUpperCase();
  const titleSize = fitText(ctx, title, width * 0.9, 76 * scale, 38 * scale);
  ctx.font = `900 ${titleSize}px Arial, sans-serif`;
  ctx.fillText(title, width / 2, height * 0.18);

  const bandX = width * 0.16;
  const bandY = height * 0.215;
  const bandW = width * 0.68;
  const bandH = height * 0.055;
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(bandX, bandY, bandW, bandH);
  ctx.fillStyle = '#07172f';
  const modelText = `${item.brand} ${item.model}`;
  ctx.font = `900 ${fitText(ctx, modelText, bandW * 0.92, 54 * scale, 28 * scale)}px Arial, sans-serif`;
  ctx.fillText(modelText, width / 2, bandY + bandH / 2);

  const imageX = width * 0.055;
  const imageY = height * 0.305;
  const imageW = width * 0.53;
  const imageH = height * 0.27;
  roundedRect(ctx, imageX, imageY, imageW, imageH, 22 * scale);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#2a6ca7';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.stroke();

  drawEquipmentGlyph(ctx, item, imageX + 8 * scale, imageY + 8 * scale, imageW - 16 * scale, imageH - 16 * scale, scale);

  const boxX = width * 0.62;
  const boxW = width * 0.325;
  const boxH = height * 0.117;
  drawVariableBox(ctx, 'Patrimônio', patrimonio, boxX, height * 0.315, boxW, boxH, scale);
  drawVariableBox(ctx, 'Número de Série', serie, boxX, height * 0.455, boxW, boxH, scale);

  const specsX = width * 0.055;
  const specsY = height * 0.615;
  const specsW = width * 0.89;
  const specsH = height * 0.29;
  roundedRect(ctx, specsX, specsY, specsW, specsH, 22 * scale);
  ctx.fillStyle = 'rgba(2, 21, 48, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#56b8ef';
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.stroke();

  ctx.fillStyle = '#f5c400';
  ctx.fillRect(specsX, specsY, specsW * 0.37, height * 0.048);
  ctx.fillStyle = '#061a3a';
  ctx.textAlign = 'left';
  ctx.font = `900 ${32 * scale}px Arial, sans-serif`;
  ctx.fillText('DADOS TÉCNICOS', specsX + 24 * scale, specsY + height * 0.024);

  const contentTop = specsY + height * 0.068;
  const contentBottom = specsY + specsH - height * 0.025;
  const twoCols = item.specs.length > 6;
  const colGap = width * 0.035;
  const colW = twoCols ? (specsW - colGap - 48 * scale) / 2 : specsW - 48 * scale;
  const maxRows = twoCols ? Math.ceil(item.specs.length / 2) : item.specs.length;
  const lineBoxH = (contentBottom - contentTop) / Math.max(maxRows, 1);
  const specFont = Math.max(16, Math.min(31 * scale, lineBoxH * 0.42));
  ctx.font = `700 ${specFont}px Arial, sans-serif`;
  ctx.textBaseline = 'top';

  item.specs.forEach((spec, index) => {
    const col = twoCols && index >= Math.ceil(item.specs.length / 2) ? 1 : 0;
    const row = twoCols ? index % Math.ceil(item.specs.length / 2) : index;
    const x = specsX + 24 * scale + col * (colW + colGap);
    const y = contentTop + row * lineBoxH;
    ctx.fillStyle = '#f5c400';
    ctx.beginPath();
    ctx.arc(x + 6 * scale, y + specFont * 0.52, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    const lines = wrapText(ctx, spec, colW - 28 * scale).slice(0, 2);
    lines.forEach((line, lineIndex) => ctx.fillText(line, x + 20 * scale, y + lineIndex * specFont * 1.08));
  });

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5c400';
  ctx.font = `900 ${30 * scale}px Arial, sans-serif`;
  ctx.fillText('TOPAC. MAIS QUE LOCAÇÃO, PARCERIA PARA O SEU SUCESSO.', width / 2, height * 0.955);
};

const renderLabel = async (canvas: HTMLCanvasElement, item: EquipmentLabelTemplate, patrimonio: string, serie: string, sizeKey: LabelSizeKey) => {
  const size = LABEL_SIZES[sizeKey];
  const width = Math.round(size.widthMm * MM_TO_PX);
  const height = Math.round(size.heightMm * MM_TO_PX);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawGeneric(ctx, item, patrimonio, serie, width, height);
};

type Props = { onBack?: () => void };

const EquipmentLabelGenerator: React.FC<Props> = ({ onBack }) => {
  const [selectedId, setSelectedId] = useState('m27');
  const [patrimonio, setPatrimonio] = useState('A10.157');
  const [serie, setSerie] = useState('1165');
  const [sizeKey, setSizeKey] = useState<LabelSizeKey>('large');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const selected = useMemo(() => EQUIPMENT_LABEL_CATALOG.find((item) => item.id === selectedId) || EQUIPMENT_LABEL_CATALOG[0], [selectedId]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EQUIPMENT_LABEL_CATALOG.filter((item) => (category === 'Todos' || item.category === category) && (!q || `${item.title} ${item.brand} ${item.model}`.toLowerCase().includes(q)));
  }, [query, category]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    setRendering(true);
    renderLabel(canvas, selected, patrimonio, serie, sizeKey)
      .catch(console.error)
      .finally(() => { if (active) setRendering(false); });
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
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, size.widthMm, size.heightMm, undefined, 'FAST');
    pdf.save(`${fileBase}-${size.widthMm}x${size.heightMm}mm.pdf`);
  };

  return <div className="min-h-screen bg-[#F7F8FC] text-slate-900">
    <div className="mx-auto w-full max-w-[1780px] px-5 py-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          {onBack && <button onClick={onBack} className="mb-3 flex items-center gap-2 text-sm font-bold text-violet-700"><ArrowLeft className="h-4 w-4"/>Voltar ao Almoxarifado</button>}
          <div className="text-sm font-bold text-violet-700">TOPAC RH PRO • CATÁLOGO DE EQUIPAMENTOS</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Gerador de Etiquetas</h1>
          <p className="mt-1 text-slate-500">Modelos e dados técnicos fixos. Edite somente patrimônio, número de série e escolha o tamanho de impressão.</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 text-sm shadow-sm"><b>{EQUIPMENT_LABEL_CATALOG.length} modelos únicos</b><div className="text-xs text-slate-500">Duplicados do catálogo foram desconsiderados</div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[430px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} className="pl-9" placeholder="Buscar modelo ou equipamento..."/></div>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>setCategory('Todos')} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category==='Todos'?'bg-violet-700 text-white':'bg-slate-100 text-slate-600'}`}>Todos</button>{EQUIPMENT_CATEGORIES.map((cat)=><button key={cat} onClick={()=>setCategory(cat)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${category===cat?'bg-violet-700 text-white':'bg-slate-100 text-slate-600'}`}>{cat}</button>)}</div>
          </div>

          <div className="max-h-[720px] space-y-2 overflow-auto pr-1">
            {filtered.map((item) => <button key={item.id} onClick={()=>selectItem(item)} className={`w-full rounded-2xl border p-4 text-left transition ${selected.id===item.id?'border-violet-500 bg-violet-50 shadow-sm':'bg-white hover:border-violet-200 hover:shadow-sm'}`}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{item.category}</div>
              <div className="mt-1 font-black text-slate-950">{item.title}</div>
              <div className="text-sm font-bold text-violet-700">{item.brand} • {item.model}</div>
              <div className="mt-2 text-xs text-slate-500">Tamanho sugerido: {LABEL_SIZES[item.recommendedSize].label} ({LABEL_SIZES[item.recommendedSize].widthMm/10} x {LABEL_SIZES[item.recommendedSize].heightMm/10} cm)</div>
            </button>)}
          </div>
        </aside>

        <main className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_480px]">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Patrimônio</label><Input value={patrimonio} onChange={(e)=>setPatrimonio(e.target.value)} className="mt-2 h-12 text-lg font-bold" placeholder="Ex.: A10.157"/></div>
              <div><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Número de Série</label><Input value={serie} onChange={(e)=>setSerie(e.target.value)} className="mt-2 h-12 text-lg font-bold" placeholder="Ex.: 1165"/></div>
            </div>

            <div className="mt-5"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Tamanho de impressão</div><div className="mt-2 grid gap-2 sm:grid-cols-3">{(Object.keys(LABEL_SIZES) as LabelSizeKey[]).map((key)=>{const s=LABEL_SIZES[key]; return <button key={key} onClick={()=>setSizeKey(key)} className={`rounded-xl border p-3 text-center ${sizeKey===key?'border-violet-600 bg-violet-50 ring-2 ring-violet-100':'bg-white hover:border-violet-200'}`}><div className="font-black">{s.label}</div><div className="text-xs text-slate-500">{s.widthMm/10} x {s.heightMm/10} cm</div>{selected.recommendedSize===key&&<div className="mt-1 text-[10px] font-bold text-violet-700">RECOMENDADO</div>}</button>})}</div></div>

            <div className="mt-5 rounded-xl bg-slate-50 p-4"><div className="font-black">{selected.title} • {selected.brand} {selected.model}</div><div className="mt-2 grid gap-x-4 gap-y-1 text-sm text-slate-600 md:grid-cols-2">{selected.specs.map((spec)=><div key={spec}>• {spec}</div>)}</div><div className="mt-3 text-xs font-bold text-slate-400">Os dados técnicos são bloqueados e não podem ser alterados nesta tela.</div></div>

            <div className="mt-5 flex flex-wrap gap-3"><Button onClick={downloadPdf} disabled={rendering} className="bg-violet-700 hover:bg-violet-800"><FileDown className="mr-2 h-4 w-4"/>Gerar PDF para impressão</Button><Button variant="outline" onClick={downloadPng} disabled={rendering}><Download className="mr-2 h-4 w-4"/>Baixar PNG</Button><Button variant="outline" onClick={downloadPdf} disabled={rendering}><Printer className="mr-2 h-4 w-4"/>Imprimir</Button></div>
          </div>

          <div className="rounded-2xl border bg-slate-200 p-4 shadow-inner">
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-500"><span>PRÉ-VISUALIZAÇÃO</span><span>{LABEL_SIZES[sizeKey].widthMm/10} x {LABEL_SIZES[sizeKey].heightMm/10} cm • 300 DPI</span></div>
            <div className="flex min-h-[640px] items-center justify-center overflow-auto rounded-xl bg-slate-300 p-4"><canvas ref={canvasRef} className="h-auto max-h-[760px] max-w-full bg-white shadow-2xl" style={{aspectRatio:`${LABEL_SIZES[sizeKey].widthMm}/${LABEL_SIZES[sizeKey].heightMm}`}}/></div>
          </div>
        </main>
      </div>
    </div>
  </div>;
};

export default EquipmentLabelGenerator;
