import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

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
  const [error, setError] = useState('');
  const [pageUrls, setPageUrls] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!sourceUrl) {
        setPageUrls([]);
        setError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const { pageUrls: renderedPages } = await renderPdfPagesToDataUrls(sourceUrl, 1.3);
        if (active) {
          setPageUrls(renderedPages);
        }
      } catch {
        if (active) {
          setPageUrls([]);
          setError('Não foi possível renderizar o PDF dentro da plataforma.');
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
    return <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando PDF...
      </div>
    );
  }

  if (error) {
    return <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 text-center text-sm text-destructive">{error}</div>;
  }

  return (
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
  );
};

export default PdfDocumentViewer;