import React, { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Download, Printer, AlertTriangle } from 'lucide-react';

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
  /** PDF gerado a partir de registro histórico quando não existe arquivo físico. */
  sourceBlob?: Blob | null;
}

const PdfDocumentViewer: React.FC<PdfDocumentViewerProps> = ({
  emptyMessage = 'Nenhum PDF vinculado.',
  sourceUrl,
  source,
  title = 'Documento PDF',
  filename,
  sourceBlob,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobMime, setBlobMime] = useState('application/pdf');
  const [savedPath, setSavedPath] = useState<string>('');

  const effectiveSource: DocumentSource | string | undefined = source ?? sourceUrl;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const load = async () => {
      if (!effectiveSource && !sourceBlob) {
        setError('');
        setResolvedUrl(null);
        setBlobUrl(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      setResolvedUrl(null);
      setBlobUrl(null);
      setSavedPath(typeof effectiveSource === 'string' ? effectiveSource : (effectiveSource.url || effectiveSource.path || ''));

      try {
        if (sourceBlob) {
          objectUrl = URL.createObjectURL(sourceBlob);
          setBlobMime(sourceBlob.type || 'application/pdf');
          if (active) { setBlobUrl(objectUrl); setResolvedUrl(objectUrl); }
          return;
        }
        const url = await getDocumentUrl(effectiveSource);
        if (!active) return;
        if (!url) {
          setError('Documento não localizado no armazenamento.');
          return;
        }

        setResolvedUrl(url);

        // O preview usa uma cópia binária local do PDF. Isso evita páginas brancas
        // causadas por renderização em canvas/PDF.js e também elimina dependência de
        // headers/CORS do Storage durante a exibição dentro da plataforma.
        const response = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Falha ao carregar o PDF (${response.status}).`);
        }

        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength) {
          throw new Error('O arquivo PDF está vazio.');
        }

        const contentType = response.headers.get('content-type') || '';
        const looksImage = /\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(url);
        const mime = contentType.startsWith('image/') ? contentType.split(';')[0]
          : looksImage ? ('image/' + (url.match(/\.(png|jpe?g|webp|gif)/i)?.[1]?.toLowerCase().replace('jpg', 'jpeg') || 'png'))
          : 'application/pdf';
        setBlobMime(mime);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }

        setBlobUrl(objectUrl);
      } catch (err: any) {
        if (!active) return;
        setBlobUrl(null);
        setError(err?.message || 'Não foi possível abrir o PDF dentro da plataforma.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [JSON.stringify(effectiveSource ?? null), sourceBlob]);

  const handleOpen = async () => {
    if (blobUrl) {
      const w = window.open(blobUrl, '_blank', 'noopener,noreferrer');
      if (!w) setError('O navegador bloqueou a abertura. Permita pop-ups e tente novamente.');
      return;
    }

    if (resolvedUrl) {
      const w = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      if (!w) setError('O navegador bloqueou a abertura. Permita pop-ups e tente novamente.');
      return;
    }

    const ok = await openDocumentInNewTab(effectiveSource);
    if (!ok) setError('Não foi possível abrir o documento.');
  };

  const handleDownload = async () => {
    const name = filename || `${title.replace(/[^\w-]+/g, '_')}.pdf`;
    if (sourceBlob) {
      const url = URL.createObjectURL(sourceBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const ok = await downloadDocument(effectiveSource, name);
    if (!ok) setError('Não foi possível baixar o arquivo.');
  };

  const handlePrint = async () => {
    const url = blobUrl || resolvedUrl || (await getDocumentUrl(effectiveSource));
    if (!url) {
      setError('Documento indisponível para impressão.');
      return;
    }

    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      setError('Pop-ups bloqueados. Libere para imprimir.');
      return;
    }

    try {
      w.addEventListener('load', () => {
        try {
          w.focus();
          w.print();
        } catch {
          // O visualizador nativo continua aberto para impressão manual.
        }
      });
    } catch {
      // O visualizador nativo continua aberto para impressão manual.
    }
  };

  if (!effectiveSource && !sourceBlob) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
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

      {!loading && !error && blobUrl && (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          {blobMime.startsWith('image/') ? (
            <img src={blobUrl} alt={title} className="block max-h-[70vh] w-full object-contain bg-white" />
          ) : <object
            aria-label={title}
            className="block h-[70vh] min-h-[520px] w-full bg-white"
            data={`${blobUrl}#view=FitH`}
            type="application/pdf"
          >
            <iframe
              className="block h-[70vh] min-h-[520px] w-full border-0 bg-white"
              src={`${blobUrl}#view=FitH`}
              title={title}
            />
          </object>}
        </div>
      )}

      {!loading && !error && !blobUrl && resolvedUrl && (
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground">
          Pré-visualização indisponível. Use “Abrir em nova aba” ou “Baixar”.
        </div>
      )}
    </div>
  );
};

export default PdfDocumentViewer;
