import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Plus, Printer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type CabinetLabel = {
  id: string;
  text: string;
};

const STORAGE_KEY = 'topac-cabinet-labels-v1';

const DEFAULT_LABELS: CabinetLabel[] = [
  { id: 'compressores', text: 'Compressores' },
  { id: 'veiculos', text: 'Veículos' },
  { id: 'funcionarios', text: 'Funcionários' },
  { id: 'contratos-pendencias', text: 'Contratos C/Pendências' },
  { id: 'contratos-sem-assinatura', text: 'Contratos Sem Assinatura' },
  { id: 'contratos-locacao', text: 'Contratos de Locação' },
  { id: 'contratos-locacao-orcados', text: 'Contratos de Locação Orçados' },
  { id: 'contratos-finalizados-locadoras-k7', text: 'Contratos Finalizados\nLocadoras K - 7' },
];

const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#039;');

const labelHtml = (value: string) => escapeHtml(value).replace(/\n/g, '<br />');

const readStoredLabels = (): CabinetLabel[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LABELS;
    const parsed = JSON.parse(raw) as CabinetLabel[];
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_LABELS;
    return parsed.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string');
  } catch {
    return DEFAULT_LABELS;
  }
};

const CabinetLabelsAddon: React.FC = () => {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<CabinetLabel[]>(readStoredLabels);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(labels));
  }, [labels]);

  useEffect(() => {
    let ownedHost: HTMLElement | null = null;
    const locate = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.card-premium'));
      const card = cards.find((item) => normalize(item.textContent).includes('etiquetas a4 - modelo fixo'));
      if (!card) return;

      const buttonGroups = Array.from(card.querySelectorAll<HTMLElement>('div.flex.flex-wrap.gap-2'));
      const target = buttonGroups.find((group) => normalize(group.textContent).includes('imprimir etiquetas')) || buttonGroups[0];
      if (!target) return;

      let host = target.querySelector<HTMLElement>('[data-topac-cabinet-tools="true"]');
      if (!host) {
        host = document.createElement('span');
        host.dataset.topacCabinetTools = 'true';
        host.style.display = 'contents';
        target.appendChild(host);
      }
      ownedHost = host;
      setPortalHost((current) => current === host ? current : host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (ownedHost?.isConnected) ownedHost.remove();
      setPortalHost(null);
    };
  }, []);

  const selectedLabels = useMemo(() => labels.filter((label) => selectedIds.includes(label.id)), [labels, selectedIds]);

  const openDialog = () => {
    setSelectedIds(labels.map((label) => label.id));
    setNewLabel('');
    setOpen(true);
  };

  const toggleLabel = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const updateLabel = (id: string, text: string) => {
    setLabels((current) => current.map((label) => label.id === id ? { ...label, text } : label));
  };

  const removeLabel = (id: string) => {
    setLabels((current) => current.filter((label) => label.id !== id));
    setSelectedIds((current) => current.filter((item) => item !== id));
  };

  const addLabel = () => {
    const text = newLabel.trim();
    if (!text) return toast.error('Digite o nome da etiqueta.');
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLabels((current) => [...current, { id, text }]);
    setSelectedIds((current) => [...current, id]);
    setNewLabel('');
  };

  const restoreDefaults = () => {
    setLabels(DEFAULT_LABELS);
    setSelectedIds(DEFAULT_LABELS.map((label) => label.id));
  };

  const printLabels = () => {
    const printable = selectedLabels
      .map((label) => ({ ...label, text: label.text.trim() }))
      .filter((label) => label.text);
    if (!printable.length) return toast.error('Selecione pelo menos uma etiqueta para imprimir.');

    const pages: CabinetLabel[][] = [];
    for (let index = 0; index < printable.length; index += 3) pages.push(printable.slice(index, index + 3));

    const pagesHtml = pages.map((page, pageIndex) => `
      <section class="print-page ${pageIndex === pages.length - 1 ? 'last' : ''}">
        ${page.map((label) => `<div class="cabinet-label"><div class="label-text">${labelHtml(label.text)}</div></div>`).join('')}
      </section>
    `).join('');

    const win = window.open('', '_blank');
    if (!win) return toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para continuar.');

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Etiquetas de Armário - TOPAC</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 5mm; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,Helvetica,sans-serif; }
    .toolbar { position:sticky; top:0; z-index:2; display:flex; gap:8px; align-items:center; padding:10px 14px; background:#f3f4f6; border-bottom:1px solid #d1d5db; }
    .toolbar button { border:0; border-radius:8px; padding:8px 12px; background:#111827; color:#fff; font-weight:700; cursor:pointer; }
    .toolbar span { font-size:12px; color:#374151; }
    .print-page { width:200mm; min-height:273mm; display:flex; flex-direction:column; gap:7mm; break-after:page; page-break-after:always; }
    .print-page.last { break-after:auto; page-break-after:auto; }
    .cabinet-label { width:200mm; height:80mm; flex:0 0 80mm; border:.7pt dashed #777; display:flex; align-items:center; justify-content:center; padding:7mm 10mm; text-align:center; overflow:hidden; break-inside:avoid; page-break-inside:avoid; }
    .label-text { display:flex; width:100%; height:100%; align-items:center; justify-content:center; text-align:center; font-size:38pt; line-height:1.04; font-weight:900; text-transform:uppercase; overflow:hidden; }
    @media print { .toolbar { display:none; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Imprimir / salvar PDF</button><span>${printable.length} etiqueta(s) • medida exata 20 × 8 cm • até 3 por folha A4</span></div>
  ${pagesHtml}
  <script>
    (() => {
      const fit = () => {
        document.querySelectorAll('.label-text').forEach((el) => {
          let size = 38;
          el.style.fontSize = size + 'pt';
          while ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) && size > 14) {
            size -= 0.5;
            el.style.fontSize = size + 'pt';
          }
        });
      };
      fit();
      window.addEventListener('beforeprint', fit);
    })();
  </script>
</body>
</html>`);
    win.document.close();
    win.focus();
    setOpen(false);
  };

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Archive className="h-5 w-5" /> Etiquetas de Armário — 20 × 8 cm</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            Selecione as etiquetas que deseja imprimir. Cada etiqueta mede exatamente <strong>20 × 8 cm</strong>; a fonte diminui automaticamente somente quando necessário para o texto caber.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(labels.map((label) => label.id))}>Selecionar todas</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
            <Button type="button" size="sm" variant="ghost" onClick={restoreDefaults}>Restaurar nomes padrão</Button>
          </div>

          <div className="space-y-2">
            {labels.map((label) => {
              const selected = selectedIds.includes(label.id);
              return (
                <div key={label.id} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center ${selected ? 'border-primary bg-primary/5' : ''}`}>
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={selected} onChange={() => toggleLabel(label.id)} />
                  <textarea
                    value={label.text}
                    onChange={(event) => updateLabel(label.id, event.target.value)}
                    rows={label.text.includes('\n') ? 2 : 1}
                    className="min-h-10 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold uppercase"
                    aria-label="Texto da etiqueta"
                  />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeLabel(label.id)} aria-label="Excluir etiqueta"><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border p-4">
            <label className="text-xs font-semibold text-muted-foreground">Adicionar outra etiqueta</label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLabel(); } }} placeholder="Ex.: Documentos de Veículos" />
              <Button type="button" variant="outline" onClick={addLabel}><Plus className="mr-2 h-4 w-4" />Adicionar</Button>
            </div>
          </div>

          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            <strong>{selectedLabels.length}</strong> etiqueta(s) selecionada(s). A impressão usa até <strong>3 etiquetas por folha A4</strong>, preservando a medida real de 20 × 8 cm.
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={printLabels}><Printer className="mr-2 h-4 w-4" />Imprimir etiquetas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!portalHost) return dialog;

  return (
    <>
      {createPortal(
        <Button type="button" size="sm" variant="outline" onClick={openDialog}>
          <Archive className="mr-1 h-3.5 w-3.5" /> Etiquetas armário 20×8
        </Button>,
        portalHost,
      )}
      {dialog}
    </>
  );
};

export default CabinetLabelsAddon;
