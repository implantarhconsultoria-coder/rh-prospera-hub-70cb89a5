import React, { useState, useEffect } from 'react';
import { Building2, Clock, Save, Award, Link as LinkIcon, Copy, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const LINKS = [
  { label: 'Login principal',     url: 'https://implantarhprpro.com/' },
  { label: 'Administração',       url: 'https://implantarhprpro.com/admin' },
  { label: 'Escolha de módulo',   url: 'https://implantarhprpro.com/escolher-modulo' },
  { label: 'Financeiro',          url: 'https://implantarhprpro.com/financeiro' },
  { label: 'Faturamento',         url: 'https://implantarhprpro.com/faturamento' },
  { label: 'App Mecânico',        url: 'https://implantarhprpro.com/mecanico' },
];

const ConfiguracoesPage: React.FC = () => {
  const [horario, setHorario] = useState<any>(null);
  const [savingH, setSavingH] = useState(false);

  useEffect(() => {
    supabase.from('config_acesso_horario').select('*').limit(1).maybeSingle().then(({ data }) => setHorario(data));
  }, []);

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

  const copiar = async (texto: string) => {
    try { await navigator.clipboard.writeText(texto); toast.success('Link copiado'); }
    catch { toast.error('Não foi possível copiar'); }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold font-display text-foreground">Configurações da Plataforma</h1>
      </div>

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

      {/* ============ LINKS DE ACESSO ============ */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Links para acesso dos usuários</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Atalhos para envio aos colaboradores. Todos os acessos são por <strong>e-mail e senha</strong> — sem CPF, sem link individual.
        </p>
        <div className="space-y-2">
          {LINKS.map(l => (
            <div key={l.url} className="flex items-center gap-2 border rounded-lg p-2 bg-muted/30">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold">{l.label}</div>
                <div className="text-xs text-muted-foreground truncate font-mono">{l.url}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => copiar(l.url)}>
                <Copy className="w-3 h-3 mr-1" /> Copiar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* ============ SOBRE / DIREITOS AUTORAIS ============ */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Sobre</h2>
        </div>
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            Sistema desenvolvido pela <strong>ImplantaRH ConsultoriaPRO</strong>.
          </p>
          <p>
            Plataforma interna personalizada para gestão de RH, financeiro, faturamento, documentos e operação da
            <strong> TOPAC / LMT / ALQUI</strong>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
            <div><strong>Desenvolvedora:</strong> ImplantaRH ConsultoriaPRO</div>
            <div><strong>Responsável:</strong> Rodrigo de Souza Sabino</div>
            <div><strong>Versão:</strong> 1.0.0 — Multiempresa PRO</div>
            <div><strong>Suporte:</strong> implantarhprpro.com</div>
          </div>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              Direitos autorais e propriedade intelectual reservados à <strong>ImplantaRH ConsultoriaPRO</strong>.
              É proibida a cópia, reprodução, revenda, redistribuição, engenharia reversa ou utilização deste
              sistema fora do ambiente autorizado, sem autorização expressa da ImplantaRH ConsultoriaPRO.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ConfiguracoesPage;
