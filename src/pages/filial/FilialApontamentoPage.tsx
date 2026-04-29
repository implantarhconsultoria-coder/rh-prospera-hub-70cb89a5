import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Send, Save, Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { obterAtorAtual, registrarAcao } from '@/lib/acoesLog';
import { registrarAlertaFilial } from '@/lib/alertasFilial';

type Tipo = 'ponto' | 'falta' | 'hora_extra' | 'atestado' | 'observacao' | 'anexo';
const TIPOS: { v: Tipo; l: string }[] = [
  { v: 'ponto', l: 'Ponto' },
  { v: 'falta', l: 'Falta' },
  { v: 'hora_extra', l: 'Hora Extra' },
  { v: 'atestado', l: 'Atestado' },
  { v: 'observacao', l: 'Observação' },
  { v: 'anexo', l: 'Anexo' },
];

const FilialApontamentoPage: React.FC = () => {
  const { userRole, employees, companies } = useApp();
  const filial = userRole === 'filial_praia' ? 'Praia Grande' : userRole === 'filial_goiania' ? 'Goiânia' : '';
  const empresaNome = userRole === 'filial_praia' ? 'TOPAC FILIAL PRAIA GRANDE' : 'TOPAC FILIAL GOIÂNIA';

  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 7));
  const [funcId, setFuncId] = useState('');
  const [tipo, setTipo] = useState<Tipo>('ponto');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [quantidade, setQuantidade] = useState<number | ''>('');
  const [valor, setValor] = useState<number | ''>('');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from('apontamentos_filial')
      .select('*')
      .eq('filial', filial)
      .eq('competencia', competencia)
      .order('created_at', { ascending: false });
    setItems(rows || []);
    setLoading(false);
  };

  useEffect(() => { if (filial) fetchItems(); }, [filial, competencia]);

  const funcionariosFilial = employees.filter(e => {
    const company = companies.find(c => c.id === e.companyId);
    const emp = (company?.name || '').toUpperCase();
    if (userRole === 'filial_praia') return emp.includes('PRAIA');
    if (userRole === 'filial_goiania') return emp.includes('GOI');
    return true;
  });

  const salvar = async (statusFinal: 'rascunho' | 'enviado') => {
    if (!funcId) { toast.error('Selecione o funcionário'); return; }
    setSaving(true);
    const func = employees.find(e => e.id === funcId);
    const ator = await obterAtorAtual();
    const payload = {
      filial,
      empresa_nome: empresaNome,
      competencia,
      funcionario_id: funcId,
      funcionario_nome: func?.name || '',
      tipo,
      data,
      quantidade: quantidade === '' ? null : Number(quantidade),
      valor: valor === '' ? null : Number(valor),
      observacao: obs || null,
      status: statusFinal,
      enviado_em: statusFinal === 'enviado' ? new Date().toISOString() : null,
      registrado_por_user_id: ator.userId ?? null,
      registrado_por_nome: ator.funcionarioNome ?? null,
    } as any;
    const { data: ins, error } = await supabase.from('apontamentos_filial').insert(payload).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(statusFinal === 'enviado' ? 'Apontamento enviado para a central' : 'Apontamento salvo');
    await registrarAcao({ modulo: 'apontamento_filial', entidade: 'apontamento', entidadeId: ins?.id, acao: statusFinal === 'enviado' ? 'enviou' : 'criou', depois: payload });
    if (statusFinal === 'enviado') {
      await registrarAlertaFilial({
        filial, empresaNome,
        funcionarioId: funcId, funcionarioNome: func?.name,
        modulo: 'apontamento', acao: `Apontamento enviado (${tipo})`,
        nivel: 'informativo', dadoNovo: payload,
      });
    }
    setQuantidade(''); setValor(''); setObs('');
    fetchItems();
  };

  const reenviar = async (row: any) => {
    await supabase.from('apontamentos_filial').update({ status: 'enviado', enviado_em: new Date().toISOString() } as any).eq('id', row.id);
    await registrarAlertaFilial({
      filial, empresaNome,
      funcionarioId: row.funcionario_id, funcionarioNome: row.funcionario_nome,
      modulo: 'apontamento', acao: `Apontamento alterado após envio`,
      nivel: 'critico', dadoNovo: row,
    });
    toast.success('Reenviado');
    fetchItems();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      rascunho: 'bg-muted text-muted-foreground',
      enviado: 'bg-blue-100 text-blue-700',
      recebido: 'bg-amber-100 text-amber-700',
      conferido: 'bg-emerald-100 text-emerald-700',
      devolvido: 'bg-destructive/20 text-destructive',
    };
    return <Badge className={map[s] || ''}>{s}</Badge>;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Send className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Apontamento — {filial}</h1>
            <p className="text-primary-foreground/70 text-sm">Esta filial alimenta apontamentos. O fechamento é feito pela central.</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Competência</label>
            <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Funcionário</label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={funcId} onChange={e => setFuncId(e.target.value)}>
              <option value="">Selecione…</option>
              {funcionariosFilial.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={tipo} onChange={e => setTipo(e.target.value as Tipo)}>
              {TIPOS.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Data</label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Quantidade</label>
            <Input type="number" step="0.01" value={quantidade} onChange={e => setQuantidade(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
            <Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">Observação</label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => salvar('rascunho')} variant="outline" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar apontamento
          </Button>
          <Button onClick={() => salvar('enviado')} disabled={saving}>
            <Send className="w-4 h-4 mr-1" /> Enviar para central
          </Button>
        </div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Data</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Funcionário</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Tipo</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Qtd</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Valor</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Obs.</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Status</th>
              <th className="px-3 py-3 text-left text-xs font-medium uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground text-sm">Nenhum apontamento nesta competência</td></tr>}
            {items.map(r => (
              <tr key={r.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 text-xs">{r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '—'}</td>
                <td className="px-3 py-2 text-xs font-medium">{r.funcionario_nome}</td>
                <td className="px-3 py-2 text-xs">{r.tipo}</td>
                <td className="px-3 py-2 text-xs">{r.quantidade ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{r.valor != null ? `R$ ${Number(r.valor).toFixed(2)}` : '—'}</td>
                <td className="px-3 py-2 text-xs">{r.observacao || '—'}</td>
                <td className="px-3 py-2">{statusBadge(r.status)}</td>
                <td className="px-3 py-2">
                  {r.status !== 'enviado' && r.status !== 'conferido' && (
                    <Button size="sm" variant="outline" onClick={() => reenviar(r)}>
                      <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                    </Button>
                  )}
                  {r.status === 'conferido' && <span className="text-emerald-600 inline-flex items-center gap-1 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> Conferido</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FilialApontamentoPage;
