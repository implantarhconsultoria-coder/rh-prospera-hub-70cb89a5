/**
 * Página de impressão dos QR Codes TOPAC-ABAST.
 * Acessível em /admin/combustivel/imprimir
 *
 * Estratégia: pré-gera todos os QR como dataURL (PNG) e renderiza como <img>.
 * Isso garante que a impressão e o "Salvar como PDF" do navegador
 * capturem a imagem corretamente — canvas pode aparecer em branco
 * em alguns navegadores quando impresso.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCodeLib from 'qrcode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';

interface Vale {
  id: string;
  codigo: string;
  posto_nome: string;
  posto_cnpj: string;
  posto_endereco: string;
  status: string;
  qrDataUrl?: string;
}

const PUBLIC_BASE = 'https://implantarhprpro.com/abastecimento';

const escapeHtml = (value?: string | null) =>
  (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const ImprimirQRCombustivelPage: React.FC = () => {
  const [vales, setVales] = useState<Vale[]>([]);
  const [loading, setLoading] = useState(true);
  const [search] = useSearchParams();

  useEffect(() => {
    (async () => {
      const codigosParam = search.get('codigos');
      let query = supabase
        .from('vales_combustivel')
        .select('id, codigo, posto_nome, posto_cnpj, posto_endereco, status')
        .like('codigo', 'TOPAC-ABAST-%')
        .is('deleted_at', null)
        .order('codigo');

      if (codigosParam) {
        const lista = codigosParam.split(',').map((s) => s.trim()).filter(Boolean);
        query = supabase
          .from('vales_combustivel')
          .select('id, codigo, posto_nome, posto_cnpj, posto_endereco, status')
          .in('codigo', lista);
      }

      const { data } = await query;
      const list = (data as any[]) || [];
      // Pré-gera QR como dataURL para impressão confiável
      const withQr = await Promise.all(
        list.map(async (v) => {
          const url = `${PUBLIC_BASE}/${v.codigo}`;
          const qrDataUrl = await QRCodeLib.toDataURL(url, {
            width: 480,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
          return { ...v, qrDataUrl };
        })
      );
      setVales(withQr);
      setLoading(false);
    })();
  }, [search]);

  const handlePrint = () => {
    const cards = vales.map((v) => `
      <article class="qr-card">
        <div class="brand">TOPAC</div>
        <div class="subtitle">Autorização de Abastecimento</div>
        ${v.posto_nome ? `<div class="posto">${escapeHtml(v.posto_nome)}</div>` : ''}
        ${v.posto_cnpj ? `<div class="meta">CNPJ: ${escapeHtml(v.posto_cnpj)}</div>` : ''}
        ${v.posto_endereco ? `<div class="meta endereco">${escapeHtml(v.posto_endereco)}</div>` : ''}
        ${v.qrDataUrl ? `<img class="qr" src="${v.qrDataUrl}" alt="${escapeHtml(v.codigo)}" />` : ''}
        <div class="codigo">${escapeHtml(v.codigo)}</div>
        <div class="hint">Escaneie o QR Code, informe os dados e tire foto da bomba e do painel.</div>
      </article>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>QR Codes TOPAC-ABAST</title>
          <style>
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #0f172a; }
            body { padding: 8mm; }
            .qr-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8mm; }
            .qr-card {
              border: 2px solid #0f172a;
              border-radius: 8mm;
              padding: 5mm;
              min-height: 88mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              text-align: center;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .brand { font-size: 14pt; font-weight: 800; line-height: 1; margin-bottom: 2mm; }
            .subtitle { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.18em; color: #475569; margin-bottom: 3mm; }
            .posto { font-size: 10pt; font-weight: 700; line-height: 1.2; }
            .meta { font-size: 7pt; color: #64748b; line-height: 1.3; }
            .endereco { margin-bottom: 2.5mm; }
            .qr { width: 42mm; height: 42mm; object-fit: contain; display: block; margin: 1mm 0 2mm; }
            .codigo { font-size: 11pt; font-weight: 800; letter-spacing: 0.12em; margin-top: 1mm; }
            .hint { font-size: 6.5pt; color: #64748b; line-height: 1.25; margin-top: 2.5mm; }
            @page { size: A4 portrait; margin: 8mm; }
          </style>
        </head>
        <body>
          <main class="qr-grid">${cards}</main>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
    if (!printWindow) {
      window.alert('Libere a abertura da janela de impressão neste navegador e tente novamente.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const waitForImages = Array.from(printWindow.document.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    });

    Promise.all(waitForImages).finally(() => {
      printWindow.focus();
      printWindow.print();
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .qr-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 8mm !important; }
          .qr-card { break-inside: avoid; page-break-inside: avoid; border: 2px solid #0f172a !important; }
        }
        @page { size: A4 portrait; margin: 8mm; }
      `}</style>

      <div className="no-print bg-white border-b sticky top-0 z-10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/combustivel">
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Button>
          </Link>
          <div>
            <h1 className="font-bold">Impressão de QR Codes TOPAC-ABAST</h1>
            <p className="text-xs text-muted-foreground">{vales.length} autorização(ões) prontas para impressão</p>
          </div>
        </div>
        <Button onClick={handlePrint}><Printer className="w-4 h-4 mr-2" /> Imprimir</Button>
      </div>

      <div id="print-area" className="p-6">
        <div className="qr-grid grid grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {vales.map((v) => (
            <div key={v.id}
              className="qr-card border-2 border-slate-800 rounded-2xl p-4 bg-white text-slate-900 flex flex-col items-center text-center"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              <div className="text-2xl font-black tracking-tight">TOPAC</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                Autorização de Abastecimento
              </div>
              {v.posto_nome && (
                <div className="text-sm font-semibold leading-tight">{v.posto_nome}</div>
              )}
              {v.posto_cnpj && (
                <div className="text-[10px] text-slate-500">CNPJ: {v.posto_cnpj}</div>
              )}
              {v.posto_endereco && (
                <div className="text-[10px] text-slate-500 mb-2">{v.posto_endereco}</div>
              )}
              {v.qrDataUrl && (
                <img src={v.qrDataUrl} alt={v.codigo} width={240} height={240}
                  style={{ width: 240, height: 240, display: 'block', margin: '8px 0' }} />
              )}
              <div className="font-mono text-base font-bold tracking-wider">{v.codigo}</div>
              <div className="text-[9px] text-slate-500 mt-2 px-2 leading-tight">
                Escaneie o QR Code, informe os dados e tire foto da bomba e do painel.
              </div>
            </div>
          ))}
        </div>
        {vales.length === 0 && (
          <p className="text-center text-muted-foreground mt-12">Nenhuma autorização TOPAC-ABAST encontrada.</p>
        )}
      </div>
    </div>
  );
};

export default ImprimirQRCombustivelPage;
