import React, { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { renderPdfPagesToDataUrls } from '@/lib/pdf';

interface PdfDocumentViewerProps {
  emptyMessage?: string;
  sourceUrl?: string;
  title?: string;
}

const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  emptyMessage = 'Nenhum PDF vinculado.',
  sourceUrl,
  title = 'Documento PDF',
}) => {
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [pageUrls, setPageUrls] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!sourceUrl) {
        setPageUrls([]);
        setRenderError(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setRenderError(false);

      try {
        const { pageUrls: renderedPages } = await renderPdfPagesToDataUrls(sourceUrl, 1.3);
        if (active) {
          setPageUrls(renderedPages);
        }
      } catch {
        if (active) {
          setPageUrls([]);
          setRenderError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [sourceUrl]);

  if (!sourceUrl) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const ActionBar = (
    <div className="flex flex-wrap gap-2 justify-end mb-3">
      <Button size="sm" variant="outline" onClick={() => window.open(sourceUrl, '_blank', 'noopener,noreferrer')}>
        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir em nova aba
      </Button>
      <Button size="sm" variant="outline" asChild>
        <a href={sourceUrl} download target="_blank" rel="noopener noreferrer">
          <Download className="w-3.5 h-3.5 mr-1" /> Baixar
        </a>
      </Button>
      <Button size="sm" variant="outline" onClick={() => {
        const w = window.open(sourceUrl, '_blank', 'noopener,noreferrer');
        if (w) {
          w.addEventListener('load', () => { try { w.print(); } catch { /* noop */ } });
        }
      }}>
        <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div>
        {ActionBar}
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando PDF...
        </div>
      </div>
    );
  }

  // Se a renderização falhou, ainda assim mostramos uma <iframe> + botões.
  if (renderError || pageUrls.length === 0) {
    return (
      <div>
        {ActionBar}
        <iframe
          src={sourceUrl}
          title={title}
          className="w-full h-[70vh] rounded-lg border border-border bg-background"
        />
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Se o PDF não aparecer acima, use os botões para abrir em nova aba, baixar ou imprimir.
        </p>
      </div>
    );
  }

  return (
    <div>
      {ActionBar}
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
    </div>
  );
};

export default PdfDocumentViewer;
