import React, { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Download, Printer, AlertTriangle } from 'lucide-react';

import { renderPdfPagesToDataUrls } from '@/lib/pdf';
import { getDocumentUrl, downloadDocument, openDocumentInNewTab, type DocumentSource } from '@/lib/documentUrl';
import { Button } from '@/components/ui/button';

interface PdfDocumentViewerProps {
  emptyMessage?: string;
  /** URL pública/assinada/caminho. Mantido p/ compatibilidade. */
  sourceUrl?: string;
  /** Fonte estruturada (bucket, path, tipo). Tem prioridade sobre sourceUrl quando informado. */
  source?: DocumentSource;
  title?: string;
  /** Nome de arquivo sugerido p/ download. */
  filename?: string;
}

const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  emptyMessage = 'Nenhum PDF vinculado.',
  sourceUrl,
  source,
  title = 'Documento PDF',
  filename,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string>('');

  const effectiveSource: DocumentSource | string | undefined = source ?? sourceUrl;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!effectiveSource) {
        setPageUrls([]); setError(''); setResolvedUrl(null); setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      setResolvedUrl(null);
      setSavedPath(typeof effectiveSource === 'string' ? effectiveSource : (effectiveSource.url || effectiveSource.path || ''));

      try {
        const url = await getDocumentUrl(effectiveSource);
        if (!active) return;
        if (!url) {
          setPageUrls([]);
          setError('Documento não localizado no armazenamento.');
          setLoading(false);
          return;
        }
        setResolvedUrl(url);

        const { pageUrls: rendered } = await renderPdfPagesToDataUrls(url, 1.3);
        if (!active) return;
        setPageUrls(rendered);
      } catch {
        if (!active) return;
        setPageUrls([]);
        setError('Não foi possível renderizar o PDF dentro da plataforma. Use “Abrir em nova aba”.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [JSON.stringify(effectiveSource ?? null)]);

  const handleOpen = async () => {
    const ok = resolvedUrl
      ? (window.open(resolvedUrl, '_blank', 'noopener,noreferrer'), true)
      : await openDocumentInNewTab(effectiveSource);
    if (!ok) setError('O navegador bloqueou a abertura. Permita pop-ups e tente novamente.');
  };

  const handleDownload = async () => {
    const name = filename || `${title.replace(/[^\w-]+/g, '_')}.pdf`;
    const ok = await downloadDocument(effectiveSource, name);
    if (!ok) setError('Não foi possível baixar o arquivo.');
  };

  const handlePrint = async () => {
    const url = resolvedUrl || (await getDocumentUrl(effectiveSource));
    if (!url) { setError('Documento indisponível para impressão.'); return; }
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) { setError('Pop-ups bloqueados. Libere para imprimir.'); return; }
    // Tenta acionar print após carregar
    try { w.addEventListener('load', () => { try { w.focus(); w.print(); } catch { /* noop */ } }); } catch { /* noop */ }
  };

  if (!effectiveSource) {
    return <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <Button size="sm" variant="outline" onClick={handleOpen} disabled={loading && !resolvedUrl}>
          <ExternalLink className="w-4 h-4 mr-1" /> Abrir em nova aba
        </Button>
        <Button size="sm" variant="outline" onClick={handleDownload} disabled={loading && !resolvedUrl}>
          <Download className="w-4 h-4 mr-1" /> Baixar
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading && !resolvedUrl}>
          <Printer className="w-4 h-4 mr-1" /> Imprimir
        </Button>
      </div>

      {loading && (
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando PDF...
        </div>
      )}

      {!loading && error && (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <p>{error}</p>
          {savedPath && <p className="text-[11px] text-muted-foreground break-all">Caminho salvo: {savedPath}</p>}
        </div>
      )}

      {!loading && !error && pageUrls.length > 0 && (
        <div className="max-h-[70vh] space-y-4 overflow-auto rounded-lg border border-border bg-muted/20 p-3">
          {pageUrls.map((pageUrl, index) => (
            <img
              key={`${title}-${index + 1}`}
              alt={`${title} — página ${index + 1}`}
              className="w-full rounded-md border border-border bg-background shadow-sm"
              loading="lazy"
              src={pageUrl}
            />
          ))}
        </div>
      )}

      {!loading && !error && pageUrls.length === 0 && resolvedUrl && (
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          Pré-visualização indisponível. Use “Abrir em nova aba” ou “Baixar”.
        </div>
      )}
    </div>
  );
};

export default PdfDocumentViewer;
