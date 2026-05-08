import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (n: any) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Importacao = {
  id: string; arquivo: string; storage_path: string; tipo: string | null; status: string;
  total_lidos: number; total_confirmados: number; total_pendentes: number; total_erros: number;
  iniciado_em: string; finalizado_em: string | null;
  mensagem?: string | null; texto_extraido?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Processando…',
  aguardando_conferencia: 'Lido com sucesso',
  concluida: 'Concluída',
  pdf_sem_texto: 'PDF sem texto legível',
  tipo_nao_identificado: 'Tipo não identificado',
  sem_registros: 'Sem registros válidos',
  erro: 'Erro técnico',
};

const STATUS_COLOR: Record<string, string> = {
  em_andamento: 'text-muted-foreground',
  aguardando_conferencia: 'text-success',
  concluida: 'text-success',
  pdf_sem_texto: 'text-warning',
  tipo_nao_identificado: 'text-warning',
  sem_registros: 'text-warning',
  erro: 'text-destructive',
};

const TIPO_LABEL: Record<string, string> = {
  cliente: 'Clientes',
  representante: 'Representantes',
  equipamento: 'Equipamentos / Patrimônios',
  historico: 'Histórico de Locação',
  desconhecido: 'Não identificado',
};

const ImportacoesDN4Page: React.FC = () => {
  const [imports, setImports] = useState<Importacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tipoForcado, setTipoForcado] = useState<string>('auto');
  const [aberta, setAberta] = useState<Importacao | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('importacoes_dn4' as any)
      .select('*')
      .order('iniciado_em', { ascending: false })
      .limit(50);

    if (error) {
      toast.error(error.message);
      setImports([]);
      setLoading(false);
      return;
    }

    const baseImports = ((data as any[]) || []) as Importacao[];
    const enrichedImports = await Promise.all(
      baseImports.map(async (item) => {
        if (!item.tipo || item.tipo === 'desconhecido') return item;

        const { data: resumo } = await supabase.rpc('dn4_resumo_importacao' as any, {
          p_importacao_id: item.id,
        } as any);

        if (!resumo || typeof resumo !== 'object') return item;

        return {
          ...item,
          total_lidos: Number((resumo as any).total ?? item.total_lidos ?? 0),
          total_confirmados: Number((resumo as any).confirmados ?? item.total_confirmados ?? 0),
          total_pendentes: Number((resumo as any).pendentes_conferencia ?? item.total_pendentes ?? 0),
          total_erros: Number((resumo as any).erros ?? item.total_erros ?? 0),
        } satisfies Importacao;
      }),
    );

    setImports(enrichedImports);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const path = `${Date.now()}_${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('dn4-imports').upload(path, file);
        if (upErr) { toast.error(`Upload ${file.name}: ${upErr.message}`); continue; }

        const { data: ses } = await supabase.auth.getUser();
        const { data: imp, error: insErr } = await supabase.from('importacoes_dn4' as any).insert({
          arquivo: file.name,
          storage_path: path,
          usuario_id: ses?.user?.id,
          usuario_nome: ses?.user?.email,
          status: 'em_andamento',
        } as any).select().single();
        if (insErr || !imp) { toast.error(insErr?.message || 'Erro ao criar importação'); continue; }

        const { data: parseData, error: fnErr } = await supabase.functions.invoke('parse-dn4', {
          body: { importacao_id: (imp as any).id, storage_path: path, tipo_forcado: tipoForcado === 'auto' ? null : tipoForcado },
        });
        if (fnErr) {
          toast.error(`Importação ${file.name}: ${fnErr.message}`);
          await supabase.from('importacoes_dn4' as any).update({ status: 'erro', mensagem: fnErr.message } as any).eq('id', (imp as any).id);
        } else {
          const detalhes = parseData as { total_lidos?: number; status?: string; total_erros?: number } | null;
          if (detalhes?.status === 'aguardando_conferencia') {
            toast.success(`${file.name}: ${detalhes.total_lidos || 0} registro(s) lido(s)`);
          } else if (detalhes?.status === 'pdf_sem_texto') {
            toast.warning(`${file.name}: PDF sem texto legível`);
          } else if (detalhes?.status === 'tipo_nao_identificado') {
            toast.warning(`${file.name}: tipo não identificado automaticamente`);
          } else if (detalhes?.status === 'sem_registros') {
            toast.warning(`${file.name}: nenhum registro encontrado no layout atual`);
          } else {
            toast.success(`${file.name} processado`);
          }
        }
      }
      await carregar();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-primary" /> Importação de Dados</h1>
          <p className="text-sm text-muted-foreground">Suba os PDFs do sistema anterior. Os dados ficam em conferência antes de gravar na base oficial.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={tipoForcado} onChange={(e) => setTipoForcado(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-sm">
            <option value="auto">Detectar tipo automaticamente</option>
            <option value="cliente">Clientes</option>
            <option value="representante">Representantes</option>
            <option value="equipamento">Equipamentos</option>
            <option value="historico">Histórico de Locação</option>
          </select>
          <label className="inline-flex">
            <input type="file" accept="application/pdf" multiple className="hidden" onChange={onUpload} disabled={uploading} />
            <Button asChild disabled={uploading}>
              <span className="cursor-pointer">{uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Nova importação</span>
            </Button>
          </label>
          <Button variant="outline" size="icon" onClick={carregar}><RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /></Button>
          <Button variant="outline" onClick={async () => {
            const ok = window.confirm('Mesclar registros duplicados nas tabelas oficiais? Clientes sem CPF/CNPJ com mesmo nome+cidade+UF e representantes com mesmo nome+CPF serão unificados, mantendo o registro mais completo.');
            if (!ok) return;
            const { data, error } = await supabase.rpc('dn4_limpar_duplicados_oficial' as any);
            if (error) toast.error(error.message);
            else toast.success(`Duplicados mesclados: ${(data as any)?.clientes_mesclados || 0} clientes, ${(data as any)?.representantes_mesclados || 0} representantes`);
          }}><Sparkles className="w-4 h-4 mr-1" /> Limpar duplicados</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Arquivo</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Iniciado</th>
              <th className="text-center p-3">Lidos</th>
              <th className="text-center p-3">Confirmados</th>
              <th className="text-center p-3">Pendentes</th>
              <th className="text-center p-3">Erros</th>
              <th className="text-left p-3">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>
            ) : imports.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Nenhuma importação ainda. Clique em <strong>Nova importação</strong>.</td></tr>
            ) : imports.map((i) => (
              <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                <td className="p-3 font-medium truncate max-w-[260px]">{i.arquivo}</td>
                <td className="p-3 text-xs">{TIPO_LABEL[i.tipo || 'desconhecido'] || i.tipo}</td>
                <td className="p-3 text-xs">{new Date(i.iniciado_em).toLocaleString('pt-BR')}</td>
                <td className="p-3 text-center">{i.total_lidos}</td>
                <td className="p-3 text-center text-success">{i.total_confirmados}</td>
                <td className="p-3 text-center text-warning">{i.total_pendentes}</td>
                <td className="p-3 text-center text-destructive">{i.total_erros}</td>
                <td className={`p-3 text-xs ${STATUS_COLOR[i.status] || ''}`} title={i.mensagem || ''}>{STATUS_LABEL[i.status] || i.status}</td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setAberta(i)}>Conferir</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberta && <ConferenciaDrawer importacao={aberta} onClose={() => { setAberta(null); carregar(); }} />}
    </div>
  );
};

const ConferenciaDrawer: React.FC<{ importacao: Importacao; onClose: () => void }> = ({ importacao, onClose }) => {
  const tipo = importacao.tipo || 'cliente';
  const tabela =
    tipo === 'cliente' ? 'staging_clientes_dn4' :
    tipo === 'equipamento' ? 'staging_equipamentos_dn4' :
    tipo === 'representante' ? 'staging_representantes_dn4' :
    'staging_historico_locacao_dn4';

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('pendente_conferencia');
  const [resumo, setResumo] = useState<any>(null);

  const carregarResumo = useCallback(async () => {
    const { data } = await supabase.rpc('dn4_resumo_importacao' as any, { p_importacao_id: importacao.id } as any);
    setResumo(data);
  }, [importacao.id]);

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(tabela as any).select('*').eq('importacao_id', importacao.id).order('created_at');
    if (filtro !== 'todos') q = q.eq('status', filtro);
    const { data } = await q;
    setRows((data as any[]) || []);
    setLoading(false);
    carregarResumo();
  }, [tabela, importacao.id, filtro, carregarResumo]);

  useEffect(() => { carregar(); }, [carregar]);

  const marcarDuplicados = async () => {
    const { data, error } = await supabase.rpc('dn4_marcar_duplicados' as any, { p_importacao_id: importacao.id } as any);
    if (error) { toast.error(error.message); return; }
    const d = data as any;
    toast.success(`Duplicados marcados: ${(d?.clientes_ignorados||0)+(d?.representantes_ignorados||0)+(d?.equipamentos_ignorados||0)+(d?.historico_ignorados||0)} registros`);
    carregar();
  };

  const acao = async (acao: 'confirmar' | 'ignorar', ids: string[]) => {
    if (ids.length === 0) return;
    const fn = acao === 'confirmar' ? 'dn4_confirmar_registros' : 'dn4_ignorar_registros';
    const { data, error } = await supabase.rpc(fn as any, { p_tipo: tipo, p_ids: ids } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(`${acao === 'confirmar' ? 'Confirmados' : 'Ignorados'}: ${JSON.stringify((data as any))}`);
    carregar();
  };

  const colunas = (() => {
    switch (tipo) {
      case 'cliente': return [['codigo_dn4','Código'],['nome_razao_social','Razão Social'],['cpf_cnpj','CPF/CNPJ'],['cidade','Cidade'],['uf','UF']];
      case 'equipamento': return [['codigo_equipamento','Código'],['numero_patrimonio','Patrimônio'],['descricao','Descrição'],['situacao','Situação'],['valor_compra','V. Compra']];
      case 'representante': return [['codigo_dn4','Código'],['nome','Nome'],['cpf_cnpj','CPF/CNPJ'],['email','E-mail'],['telefone','Telefone']];
      case 'historico': return [['numero_os','OS'],['pedido','Pedido'],['patrimonio','Patrimônio'],['periodo_texto','Período'],['valor_diaria_periodo','V. Diária'],['valor_faturado_periodo','V. Faturado']];
      default: return [['id','ID']];
    }
  })();

  return (
    <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose}>
      <aside className="absolute right-0 top-0 h-full w-full max-w-5xl bg-background border-l border-border flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold">{importacao.arquivo}</div>
            <div className="text-xs text-muted-foreground">{TIPO_LABEL[tipo]} • {STATUS_LABEL[importacao.status]}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-sm">
              <option value="todos">Todos</option>
              <option value="pendente_conferencia">Pendentes</option>
              <option value="confirmado">Confirmados</option>
              <option value="duplicado_ignorado">Duplicados ignorados</option>
              <option value="erro_leitura">Erros</option>
              <option value="ignorado">Ignorados</option>
            </select>
            <Button variant="outline" onClick={marcarDuplicados}>
              <Copy className="w-4 h-4 mr-1" /> Marcar duplicados
            </Button>
            <Button onClick={() => acao('confirmar', rows.filter(r => r.status === 'pendente_conferencia').map(r => r.id))}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar todos válidos
            </Button>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </div>
        </header>

        {/* Painel de detalhes / reprocessar */}
        <div className="px-4 py-3 border-b border-border bg-muted/10 space-y-2">
          {importacao.mensagem && (
            <div className={`text-sm ${STATUS_COLOR[importacao.status] || ''}`}>
              <strong>Detalhe:</strong> {importacao.mensagem}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Reprocessar como:</span>
            <ReprocessarBox importacao={importacao} onDone={onClose} />
          </div>
          {importacao.texto_extraido && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Ver prévia do texto extraído ({importacao.texto_extraido.length} chars)</summary>
              <pre className="mt-2 p-2 bg-muted/30 rounded max-h-48 overflow-auto whitespace-pre-wrap">{importacao.texto_extraido}</pre>
            </details>
          )}
        </div>


        {resumo && (
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-xs flex flex-wrap gap-3">
            <span><strong>Total:</strong> {resumo.total ?? 0}</span>
            <span className="text-success"><strong>Confirmados:</strong> {resumo.confirmados ?? 0}</span>
            <span className="text-warning"><strong>Pendentes:</strong> {resumo.pendentes_conferencia ?? 0}</span>
            <span className="text-muted-foreground"><strong>Duplicados ignorados:</strong> {resumo.duplicados_ignorados ?? 0}</span>
            <span className="text-destructive"><strong>Erros:</strong> {resumo.erros ?? 0}</span>
            <span><strong>Ignorados manualmente:</strong> {resumo.ignorados ?? 0}</span>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum registro neste filtro.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  {colunas.map(([k, l]) => <th key={k} className="text-left p-2">{l}</th>)}
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    {colunas.map(([k]) => (
                      <td key={k} className="p-2 text-xs">
                        {typeof r[k] === 'number' && k.startsWith('valor') ? fmt(r[k]) : (r[k] ?? '—')}
                      </td>
                    ))}
                    <td className="p-2 text-xs">
                      {r.status === 'confirmado' && <span className="text-success">✓ confirmado</span>}
                      {r.status === 'pendente_conferencia' && <span className="text-warning" title={r.mensagem_erro || ''}>pendente {r.mensagem_erro ? `· ${r.mensagem_erro}` : ''}</span>}
                      {r.status === 'duplicado_ignorado' && <span className="text-muted-foreground" title={r.mensagem_erro || ''}>duplicado</span>}
                      {r.status === 'erro_leitura' && <span className="text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{r.mensagem_erro || 'erro'}</span>}
                      {r.status === 'ignorado' && <span className="text-muted-foreground">ignorado</span>}
                    </td>
                    <td className="p-2 text-right">
                      {r.status !== 'confirmado' && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => acao('confirmar', [r.id])}><CheckCircle2 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => acao('ignorar', [r.id])}><XCircle className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
};

const ReprocessarBox: React.FC<{ importacao: Importacao; onDone: () => void }> = ({ importacao, onDone }) => {
  const [tipo, setTipo] = useState<string>(importacao.tipo && importacao.tipo !== 'desconhecido' ? importacao.tipo : 'auto');
  const [busy, setBusy] = useState(false);
  const reprocessar = async () => {
    setBusy(true);
    try {
      await supabase.from('importacoes_dn4' as any).update({
        status: 'em_andamento', mensagem: null, total_lidos: 0, total_confirmados: 0, total_pendentes: 0, total_erros: 0,
      } as any).eq('id', importacao.id);
      const { data, error } = await supabase.functions.invoke('parse-dn4', {
        body: { importacao_id: importacao.id, storage_path: importacao.storage_path, tipo_forcado: tipo === 'auto' ? null : tipo },
      });
      if (error) toast.error(error.message);
      else {
        const detalhes = data as { total_lidos?: number; status?: string } | null;
        if (detalhes?.status === 'aguardando_conferencia') toast.success(`Reprocessado com ${detalhes.total_lidos || 0} registro(s)`);
        else toast.success('Reprocessado');
      }
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <>
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-sm">
        <option value="auto">Detectar automaticamente</option>
        <option value="cliente">Clientes</option>
        <option value="representante">Representantes</option>
        <option value="equipamento">Equipamentos / Patrimônios</option>
        <option value="historico">Histórico de Locação</option>
      </select>
      <Button size="sm" variant="outline" onClick={reprocessar} disabled={busy}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} Reprocessar
      </Button>
    </>
  );
};

export default ImportacoesDN4Page;
