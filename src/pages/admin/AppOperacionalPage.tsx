import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Wrench, Search, Car, Clock, Wifi, WifiOff, ChevronRight, Loader2,
  Link2, Copy, ExternalLink, RefreshCw, Lock, Unlock, Trash2, Pencil,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface TecnicoRow {
  id: string;
  apelido: string;
  status: string;
  user_id: string | null;
  access_token: string | null;
  link_bloqueado: boolean;
  link_regenerado_em: string | null;
  funcionario: { id: string; nome: string; cargo: string; celular: string; cpf: string; companies?: { nome: string } | null };
  veiculo: { id: string; placa: string; modelo: string; identificacao_interna: string } | null;
  ultimaAtividade?: { last_activity_at: string; route: string; status: string } | null;
  ultimoPonto?: { tipo: string; created_at: string } | null;
  ultimoChamado?: { status: string; cliente: string; created_at: string } | null;
  ultimoKm?: { km: number; created_at: string; tipo_registro: string } | null;
}

const statusBadge = (status: string) => {
  if (status === 'online') return <Badge className="bg-green-500/10 text-green-600 border-green-500/30"><Wifi className="w-3 h-3 mr-1" />Online</Badge>;
  if (status === 'inativo') return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Inativo</Badge>;
  if (status === 'aguardando_acesso') return <Badge variant="outline">Aguardando 1º acesso</Badge>;
  return <Badge variant="secondary"><WifiOff className="w-3 h-3 mr-1" />Offline</Badge>;
};

const buildAppUrl = (token: string) => `${window.location.origin}/m/${token}`;

const AppOperacionalPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<TecnicoRow[]>([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: tcs } = await supabase
      .from('tecnicos_campo')
      .select('id, apelido, status, user_id, access_token, link_bloqueado, link_regenerado_em, veiculo_id, funcionario_id, funcionarios:funcionario_id(id, nome, cargo, celular, cpf, company_id, companies:company_id(nome)), veiculos:veiculo_id(id, placa, modelo, identificacao_interna)' as any)
      .order('apelido');

    const userIds = (tcs || []).map((t: any) => t.user_id).filter(Boolean) as string[];
    const activityMap: Record<string, any> = {};
    const pontoMap: Record<string, any> = {};
    const chamadoMap: Record<string, any> = {};
    const kmMap: Record<string, any> = {};

    if (userIds.length) {
      const [{ data: acts }, { data: pontos }, { data: chamados }, { data: kms }] = await Promise.all([
        supabase.from('activity_log').select('user_id, last_activity_at, route, status').in('user_id', userIds).order('last_activity_at', { ascending: false }),
        supabase.from('registros_ponto' as any).select('user_id, tipo, created_at').in('user_id', userIds).order('created_at', { ascending: false }),
        supabase.from('chamados').select('colaborador_id, status, cliente, created_at').in('colaborador_id', userIds).order('created_at', { ascending: false }),
        supabase.from('registros_km' as any).select('user_id, km, created_at, tipo_registro').in('user_id', userIds).order('created_at', { ascending: false }),
      ]);
      (acts || []).forEach((a: any) => { if (!activityMap[a.user_id]) activityMap[a.user_id] = a; });
      (pontos || []).forEach((p: any) => { if (!pontoMap[p.user_id]) pontoMap[p.user_id] = p; });
      (chamados || []).forEach((c: any) => { if (!chamadoMap[c.colaborador_id]) chamadoMap[c.colaborador_id] = c; });
      (kms || []).forEach((k: any) => { if (!kmMap[k.user_id]) kmMap[k.user_id] = k; });
    }

    const rows: TecnicoRow[] = (tcs || []).map((t: any) => ({
      id: t.id,
      apelido: t.apelido,
      status: t.status,
      user_id: t.user_id,
      access_token: t.access_token,
      link_bloqueado: !!t.link_bloqueado,
      link_regenerado_em: t.link_regenerado_em,
      funcionario: t.funcionarios,
      veiculo: t.veiculos,
      ultimaAtividade: t.user_id ? activityMap[t.user_id] : null,
      ultimoPonto: t.user_id ? pontoMap[t.user_id] : null,
      ultimoChamado: t.user_id ? chamadoMap[t.user_id] : null,
      ultimoKm: t.user_id ? kmMap[t.user_id] : null,
    }));
    setTecnicos(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const copyLink = async (token: string | null) => {
    if (!token) { toast.error('Técnico sem token gerado'); return; }
    await navigator.clipboard.writeText(buildAppUrl(token));
    toast.success('Link copiado');
  };

  const openLink = (token: string | null) => {
    if (!token) { toast.error('Técnico sem token gerado'); return; }
    window.open(buildAppUrl(token), '_blank');
  };

  const regenerar = async (tec: TecnicoRow) => {
    if (!confirm(`Regenerar o link do ${tec.apelido}? O link anterior deixará de funcionar.`)) return;
    // gera novo token via DEFAULT da coluna chamando a função
    const { data: novo, error: errFn } = await supabase.rpc('gen_tecnico_access_token' as any).single();
    let novoToken: string | null = null;
    if (!errFn && novo && typeof novo === 'string') novoToken = novo as any;
    if (!novoToken) {
      // fallback simples client-side
      novoToken = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
    }
    const { error } = await supabase
      .from('tecnicos_campo')
      .update({ access_token: novoToken, link_regenerado_em: new Date().toISOString(), link_bloqueado: false } as any)
      .eq('id', tec.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await supabase.from('tecnicos_link_historico' as any).insert({
      tecnico_id: tec.id,
      acao: 'regenerado',
      token_anterior: tec.access_token,
      token_novo: novoToken,
      realizado_por_nome: '',
    });
    toast.success('Link regenerado');
    load();
  };

  const setBloqueio = async (tec: TecnicoRow, bloqueado: boolean) => {
    const acao = bloqueado ? 'bloquear' : 'reativar';
    if (!confirm(`Confirma ${acao} o link de ${tec.apelido}?`)) return;
    const { error } = await supabase
      .from('tecnicos_campo')
      .update({ link_bloqueado: bloqueado, link_bloqueado_em: bloqueado ? new Date().toISOString() : null } as any)
      .eq('id', tec.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    await supabase.from('tecnicos_link_historico' as any).insert({
      tecnico_id: tec.id,
      acao: bloqueado ? 'bloqueado' : 'reativado',
      token_anterior: tec.access_token,
      token_novo: tec.access_token,
      realizado_por_nome: '',
    });
    toast.success(bloqueado ? 'Link bloqueado' : 'Link reativado');
    load();
  };

  const excluirTecnico = async (tec: TecnicoRow) => {
    if (!confirm(`Excluir o técnico ${tec.apelido}? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('tecnicos_campo').delete().eq('id', tec.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Técnico removido');
    load();
  };

  const filtered = tecnicos.filter(t =>
    t.apelido.toLowerCase().includes(search.toLowerCase()) ||
    t.funcionario?.nome?.toLowerCase().includes(search.toLowerCase()) ||
    (t.funcionario?.cpf || '').includes(search)
  );

  const onlineCount = tecnicos.filter(t => t.ultimaAtividade?.status === 'online').length;
  const totalCount = tecnicos.length;
  const pendentes = tecnicos.filter(t => t.status === 'aguardando_acesso').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <Wrench className="w-7 h-7 text-primary" />
            App Operacional — Mecânicos Externos
          </h1>
          <p className="text-muted-foreground mt-1">Monitoramento em tempo real dos técnicos de campo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open('/campo', '_blank')} className="bg-amber-500/10 border-amber-500/30 text-amber-700 hover:bg-amber-500/20">
            👁 Visualizar App
          </Button>
          <Button variant="outline" onClick={load}>Atualizar</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total de mecânicos</p>
          <p className="text-2xl font-bold mt-1">{totalCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Online agora</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{onlineCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Aguardando 1º acesso</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{pendentes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Veículos vinculados</p>
          <p className="text-2xl font-bold mt-1">{tecnicos.filter(t => t.veiculo).length}</p>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar mecânico, CPF..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="monitoramento" className="space-y-4">
        <TabsList>
          <TabsTrigger value="monitoramento">Monitoramento</TabsTrigger>
          <TabsTrigger value="links"><Link2 className="w-4 h-4 mr-1" />Links dos Aplicativos</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoramento">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map(t => (
                <Card
                  key={t.id}
                  className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => navigate(`/admin/app-operacional/${t.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-base truncate">{t.apelido}</h3>
                        {statusBadge(t.ultimaAtividade?.status || t.status)}
                        {t.link_bloqueado && <Badge variant="destructive">Bloqueado</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{t.funcionario?.nome}</p>
                      <p className="text-[11px] text-muted-foreground/70">{t.funcionario?.cargo}</p>

                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Car className="w-3 h-3" />
                          <span className="truncate">{t.veiculo ? `${t.veiculo.placa} · ${t.veiculo.modelo}` : 'Sem veículo'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span className="truncate">
                            {t.ultimaAtividade ? formatDistanceToNow(new Date(t.ultimaAtividade.last_activity_at), { addSuffix: true, locale: ptBR }) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                          <span className="font-medium">Ponto:</span>
                          <span>{t.ultimoPonto ? `${t.ultimoPonto.tipo} · ${formatDistanceToNow(new Date(t.ultimoPonto.created_at), { addSuffix: true, locale: ptBR })}` : 'Sem registro'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                          <span className="font-medium">Chamado:</span>
                          <span className="truncate">{t.ultimoChamado ? `${t.ultimoChamado.status} · ${t.ultimoChamado.cliente}` : 'Nenhum'}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  </div>
                </Card>
              ))}
              {!filtered.length && (
                <Card className="p-8 text-center col-span-full">
                  <p className="text-muted-foreground text-sm">Nenhum mecânico encontrado</p>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="links">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-bold flex items-center gap-2"><Link2 className="w-4 h-4" />Links dos Aplicativos</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Cada técnico tem um link individual <strong>vitalício</strong> que abre o app direto com seus dados.
                O link continua válido após atualizações; só deixa de funcionar se for bloqueado ou regenerado.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Técnico</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Empresa/Filial</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">CPF</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Veículo</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Último acesso</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Link</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const url = t.access_token ? buildAppUrl(t.access_token) : '';
                    return (
                      <tr key={t.id} className="border-b hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs">
                          <div className="font-medium">{t.apelido}</div>
                          <div className="text-muted-foreground">{t.funcionario?.nome}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">{t.funcionario?.companies?.nome || '—'}</td>
                        <td className="px-3 py-2 text-xs">{t.funcionario?.cpf || '—'}</td>
                        <td className="px-3 py-2 text-xs">{t.veiculo ? `${t.veiculo.placa}` : '—'}</td>
                        <td className="px-3 py-2 text-xs"><Badge variant="outline">Link individual</Badge></td>
                        <td className="px-3 py-2 text-xs">
                          {t.link_bloqueado
                            ? <Badge variant="destructive">Bloqueado</Badge>
                            : <Badge className="bg-green-500/10 text-green-700 border-green-500/30">Ativo</Badge>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {t.ultimaAtividade
                            ? formatDistanceToNow(new Date(t.ultimaAtividade.last_activity_at), { addSuffix: true, locale: ptBR })
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[260px]">
                          <code className="block truncate text-[11px] bg-muted px-1.5 py-0.5 rounded" title={url}>{url || '—'}</code>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Button size="icon" variant="outline" className="h-7 w-7" title="Copiar link" onClick={() => copyLink(t.access_token)}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-7 w-7" title="Abrir link" onClick={() => openLink(t.access_token)}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="outline" className="h-7 w-7" title="Regenerar link" onClick={() => regenerar(t)}>
                              <RefreshCw className="w-3.5 h-3.5" />
                            </Button>
                            {t.link_bloqueado ? (
                              <Button size="icon" variant="outline" className="h-7 w-7 text-green-600" title="Reativar link" onClick={() => setBloqueio(t, false)}>
                                <Unlock className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="outline" className="h-7 w-7 text-amber-600" title="Bloquear link" onClick={() => setBloqueio(t, true)}>
                                <Lock className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="outline" className="h-7 w-7" title="Editar técnico" onClick={() => navigate(`/admin/app-operacional/${t.id}`)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir técnico" onClick={() => excluirTecnico(t)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr><td colSpan={9} className="text-center py-8 text-xs text-muted-foreground">Nenhum técnico cadastrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AppOperacionalPage;
