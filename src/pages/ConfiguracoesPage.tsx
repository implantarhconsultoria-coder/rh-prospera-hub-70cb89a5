import React, { useState, useEffect } from 'react';
import { Building2, Award, Link2, Copy, Check, Clock, Save } from 'lucide-react';
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

  const links = [
    { name: 'Plataforma Administrativa', path: '/admin', tag: 'Admin', color: 'bg-red-500' },
    { name: 'Portal das Filiais (Praia Grande / Goiânia)', path: '/filial', tag: 'Filial', color: 'bg-blue-500' },
    { name: 'Portal de Faturamento (login: FAT • senha: TOPAC2026)', path: '/faturamento', tag: 'Faturamento', color: 'bg-indigo-500' },
    { name: 'Portal Financeiro (login: FIN • senha: TOPAC2026)', path: '/financeiro', tag: 'Financeiro', color: 'bg-cyan-600' },
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

      {/* Links dos portais */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Links de acesso aos portais</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Use estes links para distribuir aos times. O domínio base é detectado automaticamente: <span className="font-mono">{origin}</span>
        </p>
        <div className="space-y-2">
          {links.map(l => {
            const fullUrl = origin + l.path;
            return (
              <div key={l.path} className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-muted/30">
                <Badge className={`${l.color} text-white`}>{l.tag}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{fullUrl}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(fullUrl, l.path)}>
                  {copied === l.path ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-1">
          <p><strong>Acessos de teste criados:</strong></p>
          <p>• <span className="font-mono bg-background px-1.5 py-0.5 rounded">FAT</span> + senha <span className="font-mono bg-background px-1.5 py-0.5 rounded">TOPAC2026</span> → vai direto para <span className="font-mono">/faturamento</span></p>
          <p>• <span className="font-mono bg-background px-1.5 py-0.5 rounded">FIN</span> + senha <span className="font-mono bg-background px-1.5 py-0.5 rounded">TOPAC2026</span> → vai direto para <span className="font-mono">/financeiro</span></p>
          <p className="text-muted-foreground pt-1">Estes acessos têm permissão somente de leitura nos respectivos módulos.</p>
        </div>
      </Card>

      {/* Bloqueio de horário */}
      {horario && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold font-display">Bloqueio de acesso por horário</h2>
            <Badge variant={horario.enabled ? 'default' : 'secondary'}>{horario.enabled ? 'Ativo' : 'Desligado'}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Quando ativo, restringe o login dos usuários (exceto administradores) ao intervalo definido. Recomendado deixar desligado até validar.
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

      {/* Sobre */}
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
