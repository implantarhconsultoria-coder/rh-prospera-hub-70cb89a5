import React, { useEffect, useState } from 'react';
import { buscarHistoricoFuncionario } from '@/lib/documentoHistorico';
import { Badge } from '@/components/ui/badge';
import { FileText, Mail, Clock, User, Building2 } from 'lucide-react';

interface Props {
  funcionarioId: string;
}

const HistoricoDocumentalFuncionario: React.FC<Props> = ({ funcionarioId }) => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    buscarHistoricoFuncionario(funcionarioId).then(data => {
      if (active) { setDocs(data); setLoading(false); }
    });
    return () => { active = false; };
  }, [funcionarioId]);

  if (loading) return <p className="text-sm text-muted-foreground py-4">Carregando histórico...</p>;

  if (docs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Nenhum documento registrado ainda.</p>
      </div>
    );
  }

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
          {doc.arquivo_url && (
            <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-primary underline mt-1 inline-block">Ver documento</a>
          )}
        </div>
      ))}
    </div>
  );
};

export default HistoricoDocumentalFuncionario;
