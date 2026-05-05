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

  const handlePrint = async () => {
    // Garante que todas as imagens da própria página estejam carregadas
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('#print-area img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
    // Imprime a própria tela — sem popup, sem about:blank
    window.focus();
    window.print();
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
          .no-print, nav, aside, header.no-print { display: none !important; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .qr-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6mm !important; padding: 0 !important; max-width: none !important; margin: 0 !important; }
          .qr-card { break-inside: avoid; page-break-inside: avoid; border: 2px solid #0f172a !important; padding: 4mm !important; }
          .qr-card img { width: 38mm !important; height: 38mm !important; }
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
