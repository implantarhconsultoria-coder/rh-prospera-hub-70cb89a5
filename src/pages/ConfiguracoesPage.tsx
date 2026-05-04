import React, { useState, useEffect } from 'react';
import { Building2, Link2, Copy, Check, Clock, Save, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const ConfiguracoesPage: React.FC = () => {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [horario, setHorario] = useState<any>(null);
  const [savingH, setSavingH] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase.from('config_acesso_horario').select('*').limit(1).maybeSingle().then(({ data }) => setHorario(data));
  }, []);

  const grupos: { titulo: string; cor: string; links: { name: string; path: string }[] }[] = [
    {
      titulo: 'Operacional / Mecânicos', cor: 'bg-blue-500', links: [
        { name: 'São Paulo / Matriz', path: '/operacional/sp' },
        { name: 'Praia Grande',        path: '/operacional/praia-grande' },
        { name: 'Goiânia',             path: '/operacional/goiania' },
      ],
    },
    {
      titulo: 'Faturamento', cor: 'bg-indigo-500', links: [
        { name: 'São Paulo / Matriz', path: '/faturamento/sp' },
        { name: 'Praia Grande',        path: '/faturamento/praia-grande' },
        { name: 'Goiânia',             path: '/faturamento/goiania' },
      ],
    },
    {
      titulo: 'Financeiro', cor: 'bg-cyan-600', links: [
        { name: 'São Paulo / Matriz', path: '/financeiro/sp' },
        { name: 'Praia Grande',        path: '/financeiro/praia-grande' },
        { name: 'Goiânia',             path: '/financeiro/goiania' },
      ],
    },
    {
      titulo: 'RH / Filiais', cor: 'bg-rose-500', links: [
        { name: 'São Paulo / Matriz', path: '/rh/sp' },
        { name: 'Praia Grande',        path: '/rh/praia-grande' },
        { name: 'Goiânia',             path: '/rh/goiania' },
      ],
    },
    {
      titulo: 'Almoxarifado', cor: 'bg-amber-600', links: [
        { name: 'São Paulo / Matriz', path: '/almoxarifado/sp' },
        { name: 'Praia Grande',        path: '/almoxarifado/praia-grande' },
        { name: 'Goiânia',             path: '/almoxarifado/goiania' },
      ],
    },
    {
      titulo: 'Documentos RH (EPI / Uniformes)', cor: 'bg-fuchsia-500', links: [
        { name: 'São Paulo / Matriz', path: '/documentos-rh/sp' },
        { name: 'Praia Grande',        path: '/documentos-rh/praia-grande' },
        { name: 'Goiânia',             path: '/documentos-rh/goiania' },
      ],
    },
    {
      titulo: 'Plataforma Administrativa', cor: 'bg-red-500', links: [
        { name: 'Acesso Admin (login normal)', path: '/admin' },
      ],
    },
  ];

  const copy = async (txt: string, key: string) => {
    await navigator.clipboard.writeText(txt);
    setCopied(key);
    toast.success('Link copiado');
    setTimeout(() => setCopied(null), 2000);
  };

  const salvarHorario = async () => {
    if (!horario) return;
    setSavingH(true);
    const { error } = await supabase.from('config_acesso_horario')
      .update({
        enabled: horario.enabled,
        hora_inicio: horario.hora_inicio,
        hora_fim: horario.hora_fim,
        dias_semana: horario.dias_semana,
        observacao: horario.observacao || '',
      })
      .eq('id', horario.id);
    setSavingH(false);
    if (error) toast.error(error.message);
    else toast.success('Configuração salva');
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold font-display text-foreground">Configurações da Plataforma</h1>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Links de acesso aos portais</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Distribua estes links aos times. Acesso por CPF — sem necessidade de senha. Sessão por dispositivo válida até 23:59.
          Domínio detectado automaticamente: <span className="font-mono">{origin}</span>
        </p>
        <div className="space-y-5">
          {grupos.map(g => (
            <div key={g.titulo} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={`${g.cor} text-white whitespace-nowrap`}>{g.titulo}</Badge>
                <span className="text-[11px] text-muted-foreground">link único · acesso por CPF + permissão do Admin</span>
              </div>
              {g.links.map(l => {
                const fullUrl = origin + l.path;
                return (
                  <div key={l.path} className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{fullUrl}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => copy(fullUrl, l.path)}>
                      {copied === l.path ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => window.open(fullUrl, '_blank')}>
                      Abrir
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {horario && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold font-display">Bloqueio de acesso por horário</h2>
            <Badge variant={horario.enabled ? 'default' : 'secondary'}>{horario.enabled ? 'Ativo' : 'Desligado'}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativo, restringe o login dos usuários (exceto administradores) ao intervalo definido.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1 flex items-center gap-2">
              <Switch checked={horario.enabled} onCheckedChange={v => setHorario({ ...horario, enabled: v })} />
              <Label className="text-sm">Ativar bloqueio</Label>
            </div>
            <div>
              <Label className="text-xs">Hora início</Label>
              <Input type="time" value={horario.hora_inicio?.slice(0,5) || '07:00'} onChange={e => setHorario({ ...horario, hora_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Hora fim</Label>
              <Input type="time" value={horario.hora_fim?.slice(0,5) || '19:00'} onChange={e => setHorario({ ...horario, hora_fim: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Dias da semana</Label>
              <Input value={horario.dias_semana || ''} onChange={e => setHorario({ ...horario, dias_semana: e.target.value })} placeholder="seg,ter,qua,qui,sex" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Observação</Label>
            <Input value={horario.observacao || ''} onChange={e => setHorario({ ...horario, observacao: e.target.value })} />
          </div>
          <Button onClick={salvarHorario} disabled={savingH}>
            <Save className="w-4 h-4 mr-2" /> Salvar configuração
          </Button>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Sobre</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><strong>Versão:</strong> 1.0.0 — Multiempresa PRO</div>
          <div><strong>Finalidade:</strong> Gestão completa de RH, faturamento e financeiro.</div>
        </div>
      </Card>
    </div>
  );
};

export default ConfiguracoesPage;
