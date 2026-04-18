import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Building2, FileText, Wallet, AlertTriangle, RefreshCw, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const fmtBRL = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBR = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const ClienteDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cliente, setCliente] = useState<any>(null);
  const [contratos, setContratos] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [reajustes, setReajustes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [c, ct, ft, pd] = await Promise.all([
        supabase.from('clientes_fat').select('*').eq('id', id).maybeSingle(),
        supabase.from('contratos').select('*, empresas(nome)').eq('cliente_id', id).order('created_at', { ascending: false }),
        supabase.from('faturas').select('*').eq('cliente_id', id).order('data_emissao', { ascending: false }),
        supabase.from('faturamento_pendencias').select('*').eq('cliente_id', id).eq('status', 'aberta'),
      ]);
      setCliente(c.data);
      setContratos(ct.data || []);
      setFaturas(ft.data || []);
      setPendencias(pd.data || []);
      const ctIds = (ct.data || []).map((x: any) => x.id);
      if (ctIds.length) {
        const { data: rj } = await supabase.from('reajustes').select('*').in('contrato_id', ctIds).order('data_aplicacao', { ascending: false });
        setReajustes(rj || []);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">Carregando...</div>;
  if (!cliente) return <div className="p-6 text-muted-foreground">Cliente não encontrado.</div>;

  const totalEmitido = faturas.reduce((s, f) => s + Number(f.total || 0), 0);
  const totalPago = faturas.filter(f => ['paga', 'parcial'].includes(f.status)).reduce((s, f) => s + Number(f.valor_pago || 0), 0);
  const equipsAtivos = contratos.reduce((s, c) => s + 0, 0); // resolvido na aba

  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => navigate('/admin/faturamento/clientes')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </button>

      <div className="card-premium p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">{cliente.razao_social}</h1>
            {cliente.nome_fantasia && <p className="text-sm text-muted-foreground">{cliente.nome_fantasia}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
              {cliente.cnpj_cpf && <span><b>CNPJ/CPF:</b> {cliente.cnpj_cpf}</span>}
              {cliente.email && <span><b>E-mail:</b> {cliente.email}</span>}
              {cliente.telefone && <span><b>Tel:</b> {cliente.telefone}</span>}
              {cliente.cidade && <span><b>Local:</b> {cliente.cidade}/{cliente.uf}</span>}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${cliente.status === 'ativo' ? 'bg-success/20 text-success' : 'bg-muted'}`}>{cliente.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Contratos</p><p className="text-xl font-bold mt-1">{contratos.length}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Total Emitido</p><p className="text-xl font-bold mt-1">{fmtBRL(totalEmitido)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Recebido</p><p className="text-xl font-bold mt-1 text-success">{fmtBRL(totalPago)}</p></div>
        <div className="card-premium p-3"><p className="text-[10px] uppercase text-muted-foreground">Pendências</p><p className={`text-xl font-bold mt-1 ${pendencias.length > 0 ? 'text-destructive' : 'text-success'}`}>{pendencias.length}</p></div>
      </div>

      <Tabs defaultValue="contratos">
        <TabsList>
          <TabsTrigger value="contratos"><FileText className="w-4 h-4 mr-1" />Contratos</TabsTrigger>
          <TabsTrigger value="faturas"><Wallet className="w-4 h-4 mr-1" />Faturas</TabsTrigger>
          <TabsTrigger value="pendencias"><AlertTriangle className="w-4 h-4 mr-1" />Pendências</TabsTrigger>
          <TabsTrigger value="reajustes"><RefreshCw className="w-4 h-4 mr-1" />Reajustes</TabsTrigger>
        </TabsList>

        <TabsContent value="contratos" className="card-premium p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr>
              <th className="text-left p-3">Nº</th><th className="text-left p-3">Empresa</th><th className="text-left p-3">Início</th>
              <th className="text-left p-3">Regra</th><th className="text-right p-3">Valor</th><th className="text-left p-3">Status</th>
            </tr></thead>
            <tbody>
              {contratos.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum contrato.</td></tr> :
                contratos.map(c => (
                  <tr key={c.id} className="border-t border-border hover:bg-sidebar-accent/10 cursor-pointer" onClick={() => navigate(`/admin/faturamento/contratos/${c.id}`)}>
                    <td className="p-3 font-medium">{c.numero}</td>
                    <td className="p-3">{c.empresas?.nome || '—'}</td>
                    <td className="p-3">{fmtBR(c.data_inicio)}</td>
                    <td className="p-3">{c.regra_faturamento}</td>
                    <td className="p-3 text-right">{fmtBRL(c.valor_mensal)}</td>
                    <td className="p-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">{c.status}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="faturas" className="card-premium p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr>
              <th className="text-left p-3">Nº</th><th className="text-left p-3">Competência</th><th className="text-left p-3">Vencimento</th>
              <th className="text-right p-3">Total</th><th className="text-left p-3">Status</th>
            </tr></thead>
            <tbody>
              {faturas.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhuma fatura.</td></tr> :
                faturas.map(f => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="p-3 font-medium">{f.numero}</td>
                    <td className="p-3">{f.competencia}</td>
                    <td className="p-3">{fmtBR(f.data_vencimento)}</td>
                    <td className="p-3 text-right">{fmtBRL(f.total)}</td>
                    <td className="p-3"><span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{f.status}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="pendencias" className="card-premium p-4">
          {pendencias.length === 0 ? <p className="text-sm text-muted-foreground">Sem pendências.</p> :
            <ul className="space-y-2">{pendencias.map(p => <li key={p.id} className="text-sm border-l-2 border-warning pl-3 py-1"><b>{p.tipo}:</b> {p.descricao}</li>)}</ul>}
        </TabsContent>

        <TabsContent value="reajustes" className="card-premium p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground"><tr>
              <th className="text-left p-3">Data</th><th className="text-left p-3">Índice</th><th className="text-right p-3">%</th>
              <th className="text-right p-3">Valor anterior</th><th className="text-right p-3">Valor novo</th>
            </tr></thead>
            <tbody>
              {reajustes.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sem reajustes.</td></tr> :
                reajustes.map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-3">{fmtBR(r.data_aplicacao)}</td>
                    <td className="p-3">{r.indice || '—'}</td>
                    <td className="p-3 text-right">{Number(r.percentual).toFixed(2)}%</td>
                    <td className="p-3 text-right">{fmtBRL(r.valor_anterior)}</td>
                    <td className="p-3 text-right font-semibold">{fmtBRL(r.valor_novo)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClienteDetailPage;
