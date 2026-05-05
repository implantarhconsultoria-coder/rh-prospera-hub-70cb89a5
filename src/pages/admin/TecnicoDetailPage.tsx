import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Wrench, Loader2, Phone, IdCard, Briefcase, Car as CarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const TecnicoDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tec, setTec] = useState<any>(null);
  const [veiculos, setVeiculos] = useState<any[]>([]);
  const [pontos, setPontos] = useState<any[]>([]);
  const [chamados, setChamados] = useState<any[]>([]);
  const [kms, setKms] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const { data: t } = await supabase
      .from('tecnicos_campo')
      .select('*, funcionarios:funcionario_id(id, nome, cargo, celular, cpf, email, data_admissao), veiculos:veiculo_id(id, placa, modelo, identificacao_interna)')
      .eq('id', id)
      .maybeSingle();

    setTec(t);

    const { data: vs } = await supabase.from('veiculos').select('id, placa, modelo, identificacao_interna').order('placa');
    setVeiculos(vs || []);

    if (t?.user_id) {
      const [{ data: ps }, { data: chs }, { data: ks }] = await Promise.all([
        supabase.from('registros_ponto' as any).select('*').eq('user_id', t.user_id).order('created_at', { ascending: false }).limit(50),
        supabase.from('chamados').select('*').eq('colaborador_id', t.user_id).order('created_at', { ascending: false }).limit(50),
        supabase.from('registros_km' as any).select('*').eq('user_id', t.user_id).order('created_at', { ascending: false }).limit(50),
      ]);
      setPontos(ps || []);
      setChamados(chs || []);
      setKms(ks || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const vincularVeiculo = async (veiculoId: string) => {
    const { error } = await supabase.from('tecnicos_campo').update({ veiculo_id: veiculoId }).eq('id', id);
    if (error) { toast.error('Erro ao vincular veículo'); return; }
    if (tec?.user_id) {
      await supabase.from('colaborador_veiculo').upsert(
        { user_id: tec.user_id, veiculo_id: veiculoId },
        { onConflict: 'user_id' }
      );
    }
    toast.success('Veículo vinculado');
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!tec) return <div className="p-6">Técnico não encontrado</div>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/admin/app-operacional')} className="mb-2">
        <ArrowLeft className="w-4 h-4 mr-2" />Voltar
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-2">
            <Wrench className="w-7 h-7 text-primary" />
            {tec.apelido}
          </h1>
          <p className="text-muted-foreground">{tec.funcionarios?.nome}</p>
        </div>
        <Badge variant={tec.user_id ? 'default' : 'outline'}>
          {tec.user_id ? 'Login ativo' : 'Aguardando 1º acesso'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground uppercase">Dados</p>
          <p className="text-sm flex items-center gap-2"><Briefcase className="w-3.5 h-3.5" />{tec.funcionarios?.cargo}</p>
          <p className="text-sm flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{tec.funcionarios?.celular || '—'}</p>
          <p className="text-sm flex items-center gap-2"><IdCard className="w-3.5 h-3.5" />CPF: {tec.funcionarios?.cpf || '—'}</p>
        </Card>

        <Card className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground uppercase">Veículo Vinculado</p>
          {tec.veiculos ? (
            <>
              <p className="text-sm flex items-center gap-2"><CarIcon className="w-3.5 h-3.5" />{tec.veiculos.placa} · {tec.veiculos.modelo}</p>
              {tec.veiculos.identificacao_interna && <p className="text-xs text-muted-foreground">ID interna: {tec.veiculos.identificacao_interna}</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum veículo</p>
          )}
          <Select onValueChange={vincularVeiculo} value={tec.veiculo_id || ''}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Selecionar veículo" /></SelectTrigger>
            <SelectContent>
              {veiculos.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.placa} — {v.modelo}</SelectItem>
              ))}
              {!veiculos.length && <div className="p-2 text-xs text-muted-foreground">Cadastre veículos primeiro</div>}
            </SelectContent>
          </Select>
        </Card>

        <Card className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground uppercase">Resumo Operacional</p>
          <p className="text-sm">Pontos registrados: <strong>{pontos.length}</strong></p>
          <p className="text-sm">Chamados: <strong>{chamados.length}</strong></p>
          <p className="text-sm">KM lançados: <strong>{kms.length}</strong></p>
        </Card>
      </div>

      <Tabs defaultValue="pontos">
        <TabsList>
          <TabsTrigger value="pontos">Ponto</TabsTrigger>
          <TabsTrigger value="chamados">Chamados</TabsTrigger>
          <TabsTrigger value="kms">KM</TabsTrigger>
        </TabsList>

        <TabsContent value="pontos">
          <Card className="p-4">
            {pontos.length ? (
              <div className="divide-y divide-border">
                {pontos.map((p: any) => (
                  <div key={p.id} className="py-3 flex items-center gap-3 text-sm">
                    {p.selfie_url ? (
                      <a href={p.selfie_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                        <img src={p.selfie_url} alt="Selfie" className="w-12 h-12 rounded-lg object-cover border-2 border-primary/40 shadow" />
                      </a>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium capitalize flex items-center gap-2">
                        {p.tipo?.replace('_', ' ')}
                        {p.selfie_url && <Badge variant="outline" className="text-[9px] py-0 h-4">com selfie</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd/MM/yyyy HH:mm')}</p>
                    </div>
                    {p.latitude && (
                      <a
                        href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline whitespace-nowrap"
                      >
                        {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-6">Sem registros de ponto</p>}
          </Card>
        </TabsContent>

        <TabsContent value="chamados">
          <Card className="p-4">
            {chamados.length ? (
              <div className="divide-y divide-border">
                {chamados.map((c: any) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{c.cliente} · {c.tipo_servico}</p>
                      <p className="text-xs text-muted-foreground">{c.local_servico} · {format(new Date(c.created_at), 'dd/MM HH:mm')}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{c.status?.replace('_', ' ')}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-6">Sem chamados</p>}
          </Card>
        </TabsContent>

        <TabsContent value="kms">
          <Card className="p-4">
            {kms.length ? (
              <div className="divide-y divide-border">
                {kms.map((k: any) => (
                  <div key={k.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{k.km?.toLocaleString('pt-BR')} km</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(k.created_at), 'dd/MM/yyyy HH:mm')} · {k.tipo_registro}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground text-center py-6">Sem registros de KM</p>}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TecnicoDetailPage;
