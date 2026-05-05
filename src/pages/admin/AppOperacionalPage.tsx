import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wrench, Search, Car, MapPin, Clock, Wifi, WifiOff, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TecnicoRow {
  id: string;
  apelido: string;
  status: string;
  user_id: string | null;
  funcionario: { id: string; nome: string; cargo: string; celular: string; cpf: string };
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

const AppOperacionalPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tecnicos, setTecnicos] = useState<TecnicoRow[]>([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data: tcs } = await supabase
      .from('tecnicos_campo')
      .select('id, apelido, status, user_id, veiculo_id, funcionario_id, funcionarios:funcionario_id(id, nome, cargo, celular, cpf), veiculos:veiculo_id(id, placa, modelo, identificacao_interna)')
      .order('apelido');

    const userIds = (tcs || []).map(t => t.user_id).filter(Boolean) as string[];
    let activityMap: Record<string, any> = {};
    let pontoMap: Record<string, any> = {};
    let chamadoMap: Record<string, any> = {};
    let kmMap: Record<string, any> = {};

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

  const filtered = tecnicos.filter(t =>
    t.apelido.toLowerCase().includes(search.toLowerCase()) ||
    t.funcionario?.nome?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = tecnicos.filter(t => t.ultimaAtividade?.status === 'online').length;
  const totalCount = tecnicos.length;
  const pendentes = tecnicos.filter(t => t.status === 'aguardando_acesso').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        <Input placeholder="Buscar mecânico..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

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
    </div>
  );
};

export default AppOperacionalPage;
