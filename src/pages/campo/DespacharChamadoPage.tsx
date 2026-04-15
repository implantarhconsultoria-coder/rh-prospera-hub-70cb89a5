import React, { useEffect, useState } from 'react';
import { Send, Loader2, ClipboardList, MapPin, Wrench, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

interface Profile {
  user_id: string;
  nome_completo: string;
  email: string;
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  aceito: 'Aceito',
  em_deslocamento: 'Em deslocamento',
  no_local: 'No local',
  em_execucao: 'Em execução',
  concluido: 'Concluído',
};

const DespacharChamadoPage: React.FC = () => {
  const { session } = useApp();
  const [tecnicos, setTecnicos] = useState<Profile[]>([]);
  const [chamados, setChamados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'novo' | 'lista'>('novo');

  const [form, setForm] = useState({
    colaborador_id: '',
    cliente: '',
    local_servico: '',
    tipo_servico: '',
    itens_previstos: '',
    observacoes: '',
    info_adicional: '',
  });

  useEffect(() => {
    // Fetch tecnicos de campo
    const fetchTecnicos = async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'tecnico_campo');
      if (!roles?.length) return;
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, nome_completo, email').in('user_id', userIds);
      setTecnicos((profiles as Profile[]) || []);
    };
    fetchTecnicos();
    fetchChamados();
  }, []);

  const fetchChamados = async () => {
    const { data } = await supabase.from('chamados').select('*').order('created_at', { ascending: false }).limit(50);
    setChamados(data || []);
  };

  const enviar = async () => {
    if (!form.colaborador_id || !form.cliente) { toast.error('Preencha ao menos colaborador e cliente'); return; }
    setLoading(true);
    const { error } = await supabase.from('chamados').insert({
      ...form,
      criado_por: session!.user.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success('Chamado enviado!');
      setForm({ colaborador_id: '', cliente: '', local_servico: '', tipo_servico: '', itens_previstos: '', observacoes: '', info_adicional: '' });
      fetchChamados();
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold font-display text-foreground">Chamados</h2>
      <div className="flex gap-2">
        <Button variant={tab === 'novo' ? 'default' : 'outline'} size="sm" onClick={() => setTab('novo')}>Novo Chamado</Button>
        <Button variant={tab === 'lista' ? 'default' : 'outline'} size="sm" onClick={() => setTab('lista')}>Lista</Button>
      </div>

      {tab === 'novo' ? (
        <div className="space-y-3">
          <Select value={form.colaborador_id} onValueChange={v => setForm(f => ({ ...f, colaborador_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
            <SelectContent>
              {tecnicos.map(t => (
                <SelectItem key={t.user_id} value={t.user_id}>{t.nome_completo} ({t.email})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Cliente" value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} />
          <Input placeholder="Local do serviço" value={form.local_servico} onChange={e => setForm(f => ({ ...f, local_servico: e.target.value }))} />
          <Input placeholder="Tipo de serviço" value={form.tipo_servico} onChange={e => setForm(f => ({ ...f, tipo_servico: e.target.value }))} />
          <Textarea placeholder="Itens previstos" value={form.itens_previstos} onChange={e => setForm(f => ({ ...f, itens_previstos: e.target.value }))} rows={2} />
          <Textarea placeholder="Observações" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
          <Textarea placeholder="Informação adicional" value={form.info_adicional} onChange={e => setForm(f => ({ ...f, info_adicional: e.target.value }))} rows={2} />
          <Button className="w-full h-12 text-base font-semibold rounded-xl" onClick={enviar} disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Send className="w-5 h-5 mr-2" />}
            Enviar Chamado
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {chamados.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Nenhum chamado</p>
          ) : (
            chamados.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-xl p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm text-foreground">{c.cliente}</span>
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{STATUS_LABELS[c.status] || c.status}</span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{c.local_servico}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="w-3 h-3" />{c.tipo_servico}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />{tecnicos.find(t => t.user_id === c.colaborador_id)?.nome_completo || '—'}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DespacharChamadoPage;
