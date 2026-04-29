import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bell, Building2, CheckCircle2, Eye, Loader2, RefreshCw, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const FILIAIS = ['Praia Grande', 'Goiânia'];

interface Stat { filial: string; pendentes: number; enviados: number; criticos: number; ultimas: any[]; }

const MonitoramentoFiliaisPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stat[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroNivel, setFiltroNivel] = useState<string>('todos');

  const carregar = async () => {
    setLoading(true);
    const novo: Stat[] = [];
    for (const f of FILIAIS) {
      const filtroLike = f === 'Praia Grande' ? '%praia%' : '%goi%';
      const { count: pendentes } = await supabase
        .from('apontamentos_filial')
        .select('id', { count: 'exact', head: true })
        .ilike('filial', filtroLike)
        .in('status', ['rascunho']);
      const { count: enviados } = await supabase
        .from('apontamentos_filial')
        .select('id', { count: 'exact', head: true })
        .ilike('filial', filtroLike)
        .in('status', ['enviado', 'recebido']);
      const { data: ultimas } = await supabase
        .from('apontamentos_filial')
        .select('*')
        .ilike('filial', filtroLike)
        .order('updated_at', { ascending: false })
        .limit(5);
      const { count: criticos } = await supabase
        .from('alertas_filial')
        .select('id', { count: 'exact', head: true })
        .ilike('filial', filtroLike)
        .eq('nivel', 'critico')
        .eq('situacao', 'novo');
      novo.push({ filial: f, pendentes: pendentes || 0, enviados: enviados || 0, criticos: criticos || 0, ultimas: ultimas || [] });
    }
    setStats(novo);
    const { data: al } = await supabase.from('alertas_filial').select('*').order('created_at', { ascending: false }).limit(200);
    setAlertas(al || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); const i = setInterval(carregar, 30000); return () => clearInterval(i); }, []);

  const marcarRevisado = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('alertas_filial').update({
      situacao: 'revisado',
      revisado_por_user_id: user?.id ?? null,
      revisado_por_nome: user?.email ?? null,
      revisado_em: new Date().toISOString(),
    } as any).eq('id', id);
    toast.success('Marcado como revisado');
    carregar();
  };

  const nivelBadge = (n: string) => {
    if (n === 'critico') return <Badge className="bg-destructive text-destructive-foreground">Crítico</Badge>;
    if (n === 'atencao') return <Badge className="bg-amber-500 text-white">Atenção</Badge>;
    return <Badge variant="secondary">Informativo</Badge>;
  };

  const alertasFiltrados = alertas.filter(a => filtroNivel === 'todos' || a.nivel === filtroNivel);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Monitoramento das Filiais</h1>
            <p className="text-primary-foreground/70 text-sm">Apontamentos enviados, alterações e alertas críticos em tempo real</p>
          </div>
        </div>
        <Button variant="secondary" onClick={carregar} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map(s => (
          <div key={s.filial} className="card-premium p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold font-display">{s.filial}</h2>
              {s.criticos > 0 && (
                <Badge className="bg-destructive text-destructive-foreground gap-1">
                  <AlertTriangle className="w-3 h-3" /> {s.criticos} crítico(s)
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Apontamentos pendentes</p>
                <p className="text-2xl font-bold">{s.pendentes}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Enviados</p>
                <p className="text-2xl font-bold text-emerald-600">{s.enviados}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase">Últimas alterações</p>
              {s.ultimas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma</p>}
              {s.ultimas.map((u: any) => (
                <div key={u.id} className="text-xs flex items-center justify-between border-b py-1">
                  <span>{u.funcionario_nome} — {u.tipo}</span>
                  <span className="text-muted-foreground">{new Date(u.updated_at).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold flex items-center gap-2"><Bell className="w-4 h-4" /> Alertas (mais recentes)</h2>
          <div className="flex gap-1">
            {['todos', 'critico', 'atencao', 'informativo'].map(n => (
              <Button key={n} size="sm" variant={filtroNivel === n ? 'default' : 'outline'} onClick={() => setFiltroNivel(n)}>
                {n}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs uppercase">Filial</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Funcionário</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Módulo</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Ação</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Responsável</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Quando</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Nível</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Situação</th>
                <th className="px-3 py-2 text-left text-xs uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {alertasFiltrados.length === 0 && <tr><td colSpan={9} className="text-center py-6 text-muted-foreground text-sm">Nenhum alerta</td></tr>}
              {alertasFiltrados.map(a => (
                <tr key={a.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs">{a.filial}</td>
                  <td className="px-3 py-2 text-xs">{a.funcionario_nome || '—'}</td>
                  <td className="px-3 py-2 text-xs">{a.modulo}</td>
                  <td className="px-3 py-2 text-xs">{a.acao}</td>
                  <td className="px-3 py-2 text-xs">{a.responsavel_nome || '—'}{a.responsavel_cpf ? ` (${a.responsavel_cpf})` : ''}</td>
                  <td className="px-3 py-2 text-xs">{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2">{nivelBadge(a.nivel)}</td>
                  <td className="px-3 py-2 text-xs">{a.situacao}</td>
                  <td className="px-3 py-2">
                    {a.situacao === 'novo' && (
                      <Button size="sm" variant="outline" onClick={() => marcarRevisado(a.id)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Revisado
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MonitoramentoFiliaisPage;
