import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/calculations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { History, FileText, Filter, ExternalLink, Loader2 } from 'lucide-react';
import { CATEGORIAS_DOC, type CategoriaDoc } from '@/lib/documentoHistorico';
import { getFileUrl } from '@/lib/storageUrl';
import { toast } from 'sonner';

type RecordItem = {
  id: string;
  origem: 'documento' | 'acao' | 'entrega' | 'beneficio';
  tipo: string;          // categoria/módulo
  tipoLabel: string;
  data: string;          // ISO
  empresaNome: string;
  funcionarioNome: string;
  descricao: string;
  arquivoUrl?: string;
  printUrl?: string;
};

const TIPOS_DISPONIVEIS: { v: string; l: string }[] = [
  { v: 'todos', l: 'Todos' },
  ...CATEGORIAS_DOC.map(c => ({ v: c.v, l: c.l })),
  { v: 'combustivel', l: 'Combustível' },
  { v: 'apontamento_acao', l: 'Ações / Apontamentos' },
];

const HistoricoPage: React.FC = () => {
  const { companies } = useApp();
  const [tipo, setTipo] = useState<string>('todos');
  const [empresaId, setEmpresaId] = useState('');
  const [funcionarioBusca, setFuncionarioBusca] = useState('');
  const [periodoIni, setPeriodoIni] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [registros, setRegistros] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);

  const empresaNome = (id: string) => companies.find(c => c.id === id)?.name || '';

  const fetchHistorico = async () => {
    setLoading(true);
    try {
      const list: RecordItem[] = [];

      // 1) Documentos do funcionário (EPI, Uniformes, VR, VT, Férias, etc.)
      let docQ = supabase
        .from('documentos_funcionario')
        .select('id, tipo_documento, categoria, descricao, arquivo_url, created_at, empresa_nome, funcionario_nome, company_id')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (empresaId) docQ = docQ.eq('company_id', empresaId);
      if (periodoIni) docQ = docQ.gte('created_at', periodoIni);
      if (periodoFim) docQ = docQ.lte('created_at', periodoFim + 'T23:59:59');
      const { data: docs, error: docsErr } = await docQ;
      if (docsErr) console.warn('docs:', docsErr.message);
      (docs || []).forEach((d: any) => {
        list.push({
          id: 'doc-' + d.id,
          origem: 'documento',
          tipo: d.categoria || 'outros',
          tipoLabel: CATEGORIAS_DOC.find(c => c.v === d.categoria)?.l || d.tipo_documento || 'Documento',
          data: d.created_at,
          empresaNome: d.empresa_nome || empresaNome(d.company_id),
          funcionarioNome: d.funcionario_nome || '—',
          descricao: d.descricao || d.tipo_documento || '',
          arquivoUrl: d.arquivo_url || undefined,
        });
      });

      // 2) Ações importantes (combustível, protocolo, apontamentos, alterações relevantes)
      let acoesQ = supabase
        .from('acoes_log')
        .select('id, modulo, entidade, acao, funcionario_nome, empresa, observacao, arquivo_url, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (periodoIni) acoesQ = acoesQ.gte('created_at', periodoIni);
      if (periodoFim) acoesQ = acoesQ.lte('created_at', periodoFim + 'T23:59:59');
      const { data: acoes } = await acoesQ;
      (acoes || []).forEach((a: any) => {
        const moduloMap: Record<string, string> = {
          combustivel: 'combustivel',
          abastecimento: 'combustivel',
          protocolo: 'protocolos',
          apontamento: 'apontamento_acao',
          ferias: 'ferias',
          aviso_ferias: 'ferias',
          rescisao: 'rescisoes',
          atestado: 'atestados',
          aso: 'aso',
        };
        const tipoCat = moduloMap[a.modulo] || 'apontamento_acao';
        list.push({
          id: 'acao-' + a.id,
          origem: 'acao',
          tipo: tipoCat,
          tipoLabel: a.modulo?.toUpperCase() || 'Ação',
          data: a.created_at,
          empresaNome: a.empresa || '',
          funcionarioNome: a.funcionario_nome || '—',
          descricao: `${a.acao}${a.observacao ? ' — ' + a.observacao : ''}`,
          arquivoUrl: a.arquivo_url || undefined,
        });
      });

      // Filtro local por funcionário (opcional) e por tipo
      let result = list;
      if (funcionarioBusca.trim()) {
        const q = funcionarioBusca.trim().toLowerCase();
        result = result.filter(r => r.funcionarioNome.toLowerCase().includes(q));
      }
      if (tipo !== 'todos') {
        result = result.filter(r => r.tipo === tipo);
      }
      if (empresaId) {
        const nome = empresaNome(empresaId);
        result = result.filter(r => !r.empresaNome || r.empresaNome === nome);
      }
      result.sort((a, b) => b.data.localeCompare(a.data));
      setRegistros(result);
    } catch (e: any) {
      toast.error('Erro ao carregar histórico: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistorico(); /* eslint-disable-next-line */ }, [tipo, empresaId, periodoIni, periodoFim]);

  const tipoBadgeClass = (t: string) => {
    if (t === 'epi') return 'bg-primary/10 text-primary';
    if (t === 'uniformes') return 'bg-accent/10 text-accent-foreground';
    if (t === 'vr') return 'bg-success/10 text-success';
    if (t === 'vt') return 'bg-warning/10 text-warning';
    if (t === 'ferias') return 'bg-blue-500/10 text-blue-700';
    if (t === 'rescisoes') return 'bg-destructive/10 text-destructive';
    if (t === 'protocolos') return 'bg-purple-500/10 text-purple-700';
    if (t === 'combustivel') return 'bg-orange-500/10 text-orange-700';
    return 'bg-muted text-muted-foreground';
  };

  const abrirArquivo = async (url: string) => {
    try {
      // Tenta detectar bucket pela URL; se vier só path com prefixo de funcionário, usa bucket padrão
      const m = url.match(/\/object\/(?:public|sign)\/([^/]+)\//);
      const bucket = m?.[1] || 'documentos-funcionarios';
      const finalUrl = await getFileUrl(bucket, url);
      if (finalUrl) window.open(finalUrl, '_blank');
      else toast.error('Não foi possível abrir o arquivo');
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <History className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Histórico</h1>
            <p className="text-primary-foreground/70 text-sm">
              Documentos gerados, EPI, Uniformes, VR, VT, Combustível, Protocolos, Férias, Apontamentos e Ações importantes
            </p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card-premium p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros</span>
          <span className="text-[11px] text-muted-foreground">(funcionário é opcional)</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground min-w-[180px]">
              {TIPOS_DISPONIVEIS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
            <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
              <option value="">Todas</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Funcionário (opcional)</label>
            <Input placeholder="Nome..." value={funcionarioBusca}
              onChange={e => setFuncionarioBusca(e.target.value)}
              onBlur={fetchHistorico}
              className="w-56" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Período inicial</label>
            <Input type="date" value={periodoIni} onChange={e => setPeriodoIni(e.target.value)} className="w-44" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Período final</label>
            <Input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} className="w-44" />
          </div>
          <Button size="sm" variant="outline" onClick={fetchHistorico}>Aplicar</Button>
        </div>
      </div>

      {/* Listagem */}
      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {['Tipo', 'Data', 'Empresa', 'Funcionário', 'Descrição', 'Ações'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando...
              </td></tr>
            )}
            {!loading && registros.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</td></tr>
            )}
            {!loading && registros.map(r => (
              <tr key={r.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2"><Badge className={tipoBadgeClass(r.tipo)}>{r.tipoLabel}</Badge></td>
                <td className="px-3 py-2 text-xs">{formatDate(r.data.slice(0, 10))}</td>
                <td className="px-3 py-2 text-xs">{r.empresaNome || '—'}</td>
                <td className="px-3 py-2 text-xs font-medium">{r.funcionarioNome}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.descricao}</td>
                <td className="px-3 py-2">
                  {r.arquivoUrl ? (
                    <Button size="sm" variant="ghost" onClick={() => abrirArquivo(r.arquivoUrl!)}>
                      <ExternalLink className="w-4 h-4 mr-1" /> Abrir
                    </Button>
                  ) : r.printUrl ? (
                    <Button size="sm" variant="ghost" onClick={() => window.open(r.printUrl!, '_blank')}>
                      <FileText className="w-4 h-4 mr-1" /> Reimprimir
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Mostrando até 1000 registros mais recentes por origem. Refine o período para ver registros mais antigos.
      </p>
    </div>
  );
};

export default HistoricoPage;
