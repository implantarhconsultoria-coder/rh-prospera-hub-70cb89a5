import React, { useEffect, useState } from 'react';
import { buscarHistoricoFuncionario } from '@/lib/documentoHistorico';
import { getFileUrl } from '@/lib/storageUrl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PdfDocumentViewer from '@/components/PdfDocumentViewer';
import { FileText, Mail, Clock, User, Building2, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface Props { funcionarioId: string; }

const detectarBucket = (url: string): string => {
  const m = url.match(/\/object\/(?:public|sign)\/([^/]+)\//);
  if (m?.[1]) return m[1];
  const lc = url.toLowerCase();
  if (lc.includes('ferias')) return 'ferias-avisos';
  if (lc.includes('atestado')) return 'atestados';
  return 'documentos-funcionarios';
};

const HistoricoDocumentalFuncionario: React.FC<Props> = ({ funcionarioId }) => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<{ url: string; titulo: string; doc: any } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    buscarHistoricoFuncionario(funcionarioId).then(data => {
      if (active) { setDocs(data); setLoading(false); }
    });
    return () => { active = false; };
  }, [funcionarioId]);

  const abrir = async (doc: any) => {
    if (!doc.arquivo_url) {
      setViewing({ url: '', titulo: doc.tipo_documento || 'Documento', doc });
      return;
    }
    try {
      const bucket = detectarBucket(doc.arquivo_url);
      const url = await getFileUrl(bucket, doc.arquivo_url);
      if (!url) {
        toast.error('Documento não localizado. Verifique o arquivo anexado.');
        return;
      }
      setViewing({ url, titulo: doc.tipo_documento || 'Documento', doc });
    } catch {
      toast.error('Documento não localizado. Verifique o arquivo anexado.');
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Carregando histórico...</p>;
  if (docs.length === 0) return (
    <div className="text-center py-8 text-muted-foreground">
      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
      <p className="text-sm">Nenhum documento registrado ainda.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{docs.length} documento(s) no histórico</p>
      {docs.map((doc: any) => (
        <div key={doc.id} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div>
                <span className="text-sm font-medium text-foreground">{doc.tipo_documento}</span>
                {doc.competencia && <span className="text-xs text-muted-foreground ml-2">({doc.competencia})</span>}
              </div>
            </div>
            <Badge className={doc.status_envio === 'enviado' ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}>
              {doc.status_envio === 'enviado' ? 'Enviado' : 'Gerado'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{doc.descricao}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(doc.created_at).toLocaleString('pt-BR')}</span>
            <span className="flex items-center gap-1"><User className="w-3 h-3" />{doc.gerado_por_nome}</span>
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{doc.empresa_nome}</span>
          </div>
          {doc.status_envio === 'enviado' && doc.enviado_em && (
            <div className="flex items-center gap-1 mt-1 text-[10px] text-success">
              <Mail className="w-3 h-3" />
              Enviado em {new Date(doc.enviado_em).toLocaleString('pt-BR')} por {doc.enviado_por_nome}
              {doc.destinatarios && <span className="ml-1">→ {doc.destinatarios}</span>}
            </div>
          )}
          <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => abrir(doc)}>
            <Eye className="w-3 h-3 mr-1" /> Visualizar
          </Button>
        </div>
      ))}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base">{viewing?.titulo}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-muted/30 rounded-lg p-3">
                <div><strong>Funcionário:</strong> {viewing.doc.funcionario_nome}</div>
                <div><strong>Empresa:</strong> {viewing.doc.empresa_nome}</div>
                <div><strong>Tipo:</strong> {viewing.doc.tipo_documento}</div>
                <div><strong>Data:</strong> {new Date(viewing.doc.created_at).toLocaleString('pt-BR')}</div>
                {viewing.doc.competencia && <div><strong>Competência:</strong> {viewing.doc.competencia}</div>}
              </div>
              {viewing.url ? (
                <PdfDocumentViewer sourceUrl={viewing.url} title={viewing.titulo} />
              ) : (
                <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                  Pré-visualização indisponível. Sem arquivo anexado a este registro.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HistoricoDocumentalFuncionario;
