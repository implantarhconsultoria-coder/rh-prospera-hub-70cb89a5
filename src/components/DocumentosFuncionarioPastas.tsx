import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORIAS_DOC, type CategoriaDoc } from '@/lib/documentoHistorico';
import { openFile } from '@/lib/storageUrl';
import {
  FileText, Folder, Download, Eye, Printer, Trash2, Upload,
  FolderOpen, Mail, Clock, User, Building2, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';

interface Props { funcionarioId: string }

const DocumentosFuncionarioPastas: React.FC<Props> = ({ funcionarioId }) => {
  const { userRole } = useApp();
  const isAdmin = userRole === 'admin';
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pasta, setPasta] = useState<CategoriaDoc | 'todas'>('todas');

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('documentos_funcionario')
      .select('*')
      .eq('funcionario_id', funcionarioId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    setDocs(data || []);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, [funcionarioId]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    docs.forEach(d => { const c = d.categoria || 'outros'; m[c] = (m[c] || 0) + 1; });
    return m;
  }, [docs]);

  const visiveis = pasta === 'todas' ? docs : docs.filter(d => (d.categoria || 'outros') === pasta);

  const excluir = async (id: string) => {
    if (!confirm('Excluir este documento? Essa ação será registrada no histórico.')) return;
    await supabase.from('documentos_funcionario').update({
      deleted_at: new Date().toISOString(),
      status: 'cancelado',
    } as any).eq('id', id);
    toast.success('Documento excluído');
    fetch();
  };

  const uploadAssinado = async (doc: any, file: File) => {
    const path = `${doc.funcionario_id}/${doc.categoria || 'outros'}/assinado_${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('documentos-funcionarios').upload(path, file, { contentType: file.type });
    if (error) { toast.error('Falha no upload: ' + error.message); return; }
    await supabase.from('documentos_funcionario').update({
      arquivo_assinado_url: path,
      status: 'assinado',
    } as any).eq('id', doc.id);
    toast.success('Arquivo assinado anexado');
    fetch();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      emitido: 'bg-blue-100 text-blue-700',
      assinado: 'bg-emerald-100 text-emerald-700',
      arquivado: 'bg-muted text-muted-foreground',
      cancelado: 'bg-destructive/20 text-destructive',
    };
    return <Badge className={map[s] || ''}>{s || 'emitido'}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <button
          onClick={() => setPasta('todas')}
          className={`rounded-lg border p-2 text-left transition ${pasta === 'todas' ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
          <div className="flex items-center gap-2"><FolderOpen className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium">Todas</span></div>
          <p className="text-lg font-bold">{docs.length}</p>
        </button>
        {CATEGORIAS_DOC.map(c => (
          <button key={c.v}
            onClick={() => setPasta(c.v)}
            className={`rounded-lg border p-2 text-left transition ${pasta === c.v ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}>
            <div className="flex items-center gap-2"><Folder className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium truncate">{c.l}</span></div>
            <p className="text-lg font-bold">{contagem[c.v] || 0}</p>
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground py-4">Carregando documentos...</p>}

      {!loading && visiveis.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum documento nesta pasta.</p>
        </div>
      )}

      <div className="space-y-2">
        {visiveis.map(d => (
          <div key={d.id} className="border rounded-lg p-3 hover:bg-muted/20 transition-colors">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">{d.tipo_documento}</span>
                  {d.competencia && <span className="text-xs text-muted-foreground ml-2">({d.competencia})</span>}
                  <p className="text-xs text-muted-foreground truncate">{d.descricao}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {statusBadge(d.status)}
                {d.arquivo_url && (
                  <Button size="sm" variant="ghost" onClick={() => openFile('documentos-funcionarios', d.arquivo_url)} title="Visualizar">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                )}
                {d.arquivo_assinado_url && (
                  <Button size="sm" variant="ghost" onClick={() => openFile('documentos-funcionarios', d.arquivo_assinado_url)} title="Ver assinado">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </Button>
                )}
                <label className="inline-flex items-center cursor-pointer">
                  <input type="file" accept=".pdf,image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadAssinado(d, e.target.files[0])} />
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="Anexar versão assinada">
                    <Upload className="w-3.5 h-3.5" />
                  </span>
                </label>
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluir(d.id)} title="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(d.created_at).toLocaleString('pt-BR')}</span>
              <span className="flex items-center gap-1"><User className="w-3 h-3" />{d.gerado_por_nome}</span>
              <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{d.empresa_nome}</span>
              {d.status_envio === 'enviado' && d.enviado_em && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Mail className="w-3 h-3" />Enviado em {new Date(d.enviado_em).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentosFuncionarioPastas;
