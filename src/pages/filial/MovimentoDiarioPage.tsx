import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Plus, Trash2, Lock, Unlock, RefreshCw, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { TIPOS_OCORRENCIA, type MovimentoRow, type TipoOcorrencia, type FechamentoRow } from '@/lib/movimento';
import { formatCurrency } from '@/lib/calculations';

const MovimentoDiarioPage: React.FC = () => {
  const { companies, employees, session } = useApp();
  const navigate = useNavigate();
  const filialCompanies = companies; // RLS já restringe à(s) empresa(s) da filial
  const [companyId, setCompanyId] = useState<string>('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [movimentos, setMovimentos] = useState<MovimentoRow[]>([]);
  const [fechamento, setFechamento] = useState<FechamentoRow | null>(null);
  const [loading, setLoading] = useState(false);

  const hoje = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    funcionario_id: '',
    data: hoje,
    tipo: 'falta' as TipoOcorrencia,
    quantidade: 1,
    valor: 0,
    observacao: '',
  });

  useEffect(() => {
    if (filialCompanies.length && !companyId) setCompanyId(filialCompanies[0].id);
  }, [filialCompanies, companyId]);

  const carregar = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    const [mov, fech] = await Promise.all([
      supabase.from('movimento_diario').select('*').eq('company_id', companyId).eq('competencia', competencia).order('data', { ascending: false }),
      supabase.from('fechamentos_filial').select('*').eq('company_id', companyId).eq('competencia', competencia).maybeSingle(),
    ]);
    if (mov.data) setMovimentos(mov.data as any);
    setFechamento((fech.data as any) || null);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [companyId, competencia]);

  const compEmps = useMemo(
    () => employees.filter(e => e.companyId === companyId && e.status === 'ativo'),
    [employees, companyId]
  );

  const fechado = fechamento?.status === 'fechado';
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email || '';

  const adicionar = async () => {
    if (!form.funcionario_id) return toast.error('Selecione um funcionário');
    if (!session) return;
    if (fechado) return toast.error('Período fechado — não é possível alimentar movimento');

    const { error } = await supabase.from('movimento_diario').insert({
      company_id: companyId,
      funcionario_id: form.funcionario_id,
      competencia,
      data: form.data,
      tipo: form.tipo,
      quantidade: Number(form.quantidade) || 0,
      valor: Number(form.valor) || 0,
      observacao: form.observacao,
      registrado_por_user_id: session.user.id,
      registrado_por_nome: userName,
    });
    if (error) return toast.error('Erro: ' + error.message);
    toast.success('Movimento registrado');
    setForm({ ...form, quantidade: 1, valor: 0, observacao: '' });
    carregar();
  };

  const remover = async (id: string) => {
    if (fechado) return toast.error('Período fechado');
    if (!confirm('Remover este movimento?')) return;
    const { error } = await supabase.from('movimento_diario').delete().eq('id', id);
    if (error) return toast.error(error.message);
    carregar();
  };

  // Vista consolidada por funcionário
  const consolidado = useMemo(() => {
    const map = new Map<string, Record<TipoOcorrencia, number>>();
    for (const m of movimentos) {
      if (!map.has(m.funcionario_id)) {
        map.set(m.funcionario_id, { falta: 0, atraso: 0, he50: 0, he100: 0, adicional: 0, desconto: 0, adiantamento: 0, observacao: 0 });
      }
      const acc = map.get(m.funcionario_id)!;
      const tipoCfg = TIPOS_OCORRENCIA.find(t => t.value === m.tipo);
      acc[m.tipo] += tipoCfg?.usaValor ? Number(m.valor || 0) : Number(m.quantidade || 0);
    }
    return map;
  }, [movimentos]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" /> Movimento Diário
          </h1>
          <p className="text-sm text-muted-foreground">Alimente as ocorrências do dia. O fechamento consolida e envia para Lançamentos.</p>
        </div>
        <div className="flex gap-2 items-center">
          {fechado ? (
            <Badge variant="destructive" className="gap-1"><Lock className="w-3 h-3" /> Período fechado</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><Unlock className="w-3 h-3" /> Aberto</Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/filial/fechamento')}>
            <FileCheck className="w-4 h-4 mr-2" /> Fechamento
          </Button>
        </div>
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background text-foreground">
            {filialCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Competência</label>
          <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44" />
        </div>
        <Button variant="outline" size="sm" onClick={carregar} className="ml-auto">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Form de adição */}
      {!fechado && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-premium p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Registrar ocorrência</h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Funcionário</label>
              <select value={form.funcionario_id} onChange={e => setForm({ ...form, funcionario_id: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                <option value="">Selecione…</option>
                {compEmps.map(e => <option key={e.id} value={e.id}>{e.name} — {e.cargo}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Data</label>
              <Input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoOcorrencia })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
                {TIPOS_OCORRENCIA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {TIPOS_OCORRENCIA.find(t => t.value === form.tipo)?.usaQuantidade && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Quantidade</label>
                <Input type="number" step="0.5" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: Number(e.target.value) })} />
              </div>
            )}
            {TIPOS_OCORRENCIA.find(t => t.value === form.tipo)?.usaValor && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Valor (R$)</label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm({ ...form, valor: Number(e.target.value) })} />
              </div>
            )}
            <div className="md:col-span-6">
              <label className="text-xs text-muted-foreground block mb-1">Observação</label>
              <Input value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Detalhes…" />
            </div>
            <div className="md:col-span-6">
              <Button onClick={adicionar} className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" /> Adicionar</Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Lista de movimentos */}
      <div className="card-premium overflow-x-auto">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold">Ocorrências do período ({movimentos.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {['Data','Funcionário','Tipo','Qtd','Valor','Obs','Registrado por','—'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimentos.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-sm">Nenhum movimento registrado.</td></tr>
            )}
            {movimentos.map(m => {
              const emp = employees.find(e => e.id === m.funcionario_id);
              const tipoCfg = TIPOS_OCORRENCIA.find(t => t.value === m.tipo);
              return (
                <tr key={m.id} className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(m.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2 font-medium">{emp?.name || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{tipoCfg?.label || m.tipo}</Badge></td>
                  <td className="px-3 py-2">{tipoCfg?.usaQuantidade ? m.quantidade : '—'}</td>
                  <td className="px-3 py-2">{tipoCfg?.usaValor ? formatCurrency(Number(m.valor)) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{m.observacao}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{m.registrado_por_nome}</td>
                  <td className="px-3 py-2">
                    {!fechado && (
                      <Button variant="ghost" size="sm" onClick={() => remover(m.id)} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Consolidado por funcionário */}
      {movimentos.length > 0 && (
        <div className="card-premium overflow-x-auto">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Prévia consolidada por funcionário</h2>
            <p className="text-xs text-muted-foreground">Valores que serão enviados para Lançamentos no fechamento.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {['Funcionário','Faltas','Atrasos','HE 50','HE 100','Adic.','Desc.','Adiant.'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(consolidado.entries()).map(([funcId, totais]) => {
                const emp = employees.find(e => e.id === funcId);
                if (!emp) return null;
                return (
                  <tr key={funcId} className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{emp.name}</td>
                    <td className="px-3 py-2">{totais.falta}</td>
                    <td className="px-3 py-2">{totais.atraso}h</td>
                    <td className="px-3 py-2">{totais.he50}h</td>
                    <td className="px-3 py-2">{totais.he100}h</td>
                    <td className="px-3 py-2">{formatCurrency(totais.adicional)}</td>
                    <td className="px-3 py-2">{formatCurrency(totais.desconto)}</td>
                    <td className="px-3 py-2">{formatCurrency(totais.adiantamento)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MovimentoDiarioPage;
