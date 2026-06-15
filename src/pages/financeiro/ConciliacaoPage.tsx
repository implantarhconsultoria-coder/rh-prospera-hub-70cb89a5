import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckSquare, Check, Link2, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Candidate = {
  id: string;
  kind: 'recebimento' | 'pagamento';
  data: string;
  valor: number;
  label: string;
};

const ConciliacaoPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [contas, setContas] = useState<any[]>([]);
  const [contaSel, setContaSel] = useState<string>('');
  const [movs, setMovs] = useState<any[]>([]);
  const [recebimentos, setRecebimentos] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState<string>('');

  useEffect(() => {
    if (ext.loading) return;
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const q = safeIds
      ? supabase.from('contas_bancarias').select('id, nome, banco, empresa_id').eq('status', 'ativa').in('empresa_id', safeIds)
      : supabase.from('contas_bancarias').select('id, nome, banco, empresa_id').eq('status', 'ativa');
    q.then(({ data, error }) => {
      if (error) toast.error('Não foi possível carregar as contas bancárias.');
      setContas(data || []);
      setContaSel(previous => previous || data?.[0]?.id || '');
    });
  }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const carregar = async () => {
    if (!contaSel) return;
    setLoading(true);
    const [movRes, recRes, pagRes] = await Promise.all([
      supabase.from('movimentacoes_bancarias').select('*').eq('conta_bancaria_id', contaSel).order('data', { ascending: false }).limit(500),
      supabase.from('recebimentos').select('id, data, valor, conta_bancaria_id, titulos_receber(numero, clientes_fat(razao_social))').eq('conta_bancaria_id', contaSel).order('data', { ascending: false }).limit(500),
      supabase.from('pagamentos').select('id, data, valor, conta_bancaria_id, titulos_pagar(numero, descricao, fornecedor_nome)').eq('conta_bancaria_id', contaSel).order('data', { ascending: false }).limit(500),
    ]);
    if (movRes.error || recRes.error || pagRes.error) toast.error('Não foi possível carregar todos os dados para conciliação.');
    setMovs(movRes.data || []);
    setRecebimentos(recRes.data || []);
    setPagamentos(pagRes.data || []);
    setEscolhas({});
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [contaSel]);

  const usados = useMemo(() => new Set(movs.flatMap(m => [m.recebimento_id, m.pagamento_id]).filter(Boolean)), [movs]);

  const candidatos = (mov: any): Candidate[] => {
    const source = mov.tipo === 'entrada' ? recebimentos : pagamentos;
    return source
      .filter(item => !usados.has(item.id) || item.id === mov.recebimento_id || item.id === mov.pagamento_id)
      .filter(item => Math.abs(Number(item.valor) - Number(mov.valor)) < 0.01)
      .map(item => {
        const titulo = mov.tipo === 'entrada' ? item.titulos_receber : item.titulos_pagar;
        const label = mov.tipo === 'entrada'
          ? `${titulo?.numero || 'Título'} · ${titulo?.clientes_fat?.razao_social || 'Cliente'} · ${item.data}`
          : `${titulo?.numero || titulo?.descricao || 'Título'} · ${titulo?.fornecedor_nome || 'Fornecedor'} · ${item.data}`;
        return { id: item.id, kind: mov.tipo === 'entrada' ? 'recebimento' : 'pagamento', data: item.data, valor: Number(item.valor), label } as Candidate;
      })
      .sort((a, b) => (a.data === mov.data ? -1 : b.data === mov.data ? 1 : b.data.localeCompare(a.data)));
  };

  const valorEscolhido = (mov: any) => {
    if (escolhas[mov.id]) return escolhas[mov.id];
    const exato = candidatos(mov).find(c => c.data === mov.data);
    return exato ? `${exato.kind}:${exato.id}` : '';
  };

  const conciliar = async (mov: any) => {
    const selected = valorEscolhido(mov);
    if (!selected) return toast.error('Selecione a baixa correspondente.');
    const [kind, id] = selected.split(':');
    setSalvando(mov.id);
    const payload = {
      conciliado: true,
      data_conciliacao: new Date().toISOString(),
      recebimento_id: kind === 'recebimento' ? id : null,
      pagamento_id: kind === 'pagamento' ? id : null,
    };
    const { error } = await supabase.from('movimentacoes_bancarias').update(payload).eq('id', mov.id).eq('conciliado', false);
    setSalvando('');
    if (error) return toast.error(`Conciliação não concluída: ${error.message}`);
    toast.success('Movimentação conciliada com a baixa correta.');
    carregar();
  };

  const desfazer = async (mov: any) => {
    if (!confirm('Desfazer somente o vínculo desta conciliação? A baixa financeira será mantida.')) return;
    setSalvando(mov.id);
    const { error } = await supabase.from('movimentacoes_bancarias').update({
      conciliado: false,
      data_conciliacao: null,
      recebimento_id: null,
      pagamento_id: null,
    }).eq('id', mov.id);
    setSalvando('');
    if (error) return toast.error(error.message);
    toast.success('Conciliação desfeita. A baixa financeira foi preservada.');
    carregar();
  };

  const totaisInternos = movs.filter(m => m.conciliado).reduce((s, m) => s + (m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)), 0);
  const totalGeral = movs.reduce((s, m) => s + (m.tipo === 'entrada' ? Number(m.valor) : -Number(m.valor)), 0);
  const pendentes = movs.filter(m => !m.conciliado).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><CheckSquare className="w-6 h-6 text-primary" /> Conciliação Bancária</h1>
          <p className="text-sm text-muted-foreground">Cada linha do banco deve ser vinculada a uma baixa real de receber ou pagar.</p>
        </div>
        <div className="flex gap-2">
          <select value={contaSel} onChange={e => setContaSel(e.target.value)} className="bg-card border border-border rounded-md px-3 py-2 text-sm">
            {contas.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.banco})</option>)}
          </select>
          <button onClick={carregar} title="Atualizar" className="btn-secondary"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Conciliado</p><p className="text-lg font-bold text-success">{fmtBRL(totaisInternos)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Total no período</p><p className="text-lg font-bold">{fmtBRL(totalGeral)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Pendentes</p><p className="text-lg font-bold text-warning">{pendentes}</p></div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <AlertCircle className="w-4 h-4 text-primary shrink-0" />
        <span>Se a baixa ainda não existir, registre primeiro em Contas a Receber ou Contas a Pagar. A conciliação não inventa pagamento nem recebimento.</span>
      </div>

      {loading ? <p className="p-8 text-center text-muted-foreground">Carregando...</p> : (
        <div className="card-premium overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="text-left p-3">Data</th><th className="text-left p-3">Descrição do banco</th><th className="text-left p-3">Tipo</th><th className="text-right p-3">Valor</th><th className="text-left p-3">Baixa correspondente</th><th className="text-center p-3">Ação</th></tr>
            </thead>
            <tbody>
              {movs.map(m => {
                const options = candidatos(m);
                return (
                  <tr key={m.id} className={`border-t border-border ${m.conciliado ? 'bg-success/5' : ''}`}>
                    <td className="p-3 text-xs font-mono">{m.data}</td>
                    <td className="p-3 text-xs max-w-[260px]">{m.descricao}</td>
                    <td className="p-3 text-xs">{m.tipo}</td>
                    <td className={`p-3 text-right font-semibold ${m.tipo === 'entrada' ? 'text-success' : 'text-destructive'}`}>{m.tipo === 'entrada' ? '+' : '-'}{fmtBRL(m.valor)}</td>
                    <td className="p-3">
                      {m.conciliado ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="w-4 h-4" /> Vinculado à baixa financeira</span>
                      ) : options.length ? (
                        <select value={valorEscolhido(m)} onChange={e => setEscolhas({ ...escolhas, [m.id]: e.target.value })} className="w-full bg-background border border-border rounded-md px-2 py-2 text-xs">
                          <option value="">Selecione...</option>
                          {options.map(c => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.data === m.data ? 'SUGESTÃO · ' : ''}{c.label}</option>)}
                        </select>
                      ) : <span className="text-xs text-warning">Nenhuma baixa com o mesmo valor</span>}
                    </td>
                    <td className="p-3 text-center">
                      {m.conciliado
                        ? <button disabled={salvando === m.id} onClick={() => desfazer(m)} className="btn-secondary text-xs px-2 py-1">Desfazer vínculo</button>
                        : <button disabled={salvando === m.id || !options.length} onClick={() => conciliar(m)} className="btn-primary text-xs px-2 py-1 disabled:opacity-50 inline-flex items-center gap-1"><Link2 className="w-3 h-3" /> Conciliar</button>}
                    </td>
                  </tr>
                );
              })}
              {movs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sem movimentações. Importe o extrato em Caixa e Bancos.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ConciliacaoPage;
