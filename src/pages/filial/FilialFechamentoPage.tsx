import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Lock, Unlock, RefreshCw, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { calcTotalFuncionario, formatCurrency } from '@/lib/calculations';
import { TIPOS_OCORRENCIA, type MovimentoRow, type FechamentoRow, type TipoOcorrencia } from '@/lib/movimento';

const FilialFechamentoPage: React.FC = () => {
  const { companies, employees, session } = useApp();
  const [companyId, setCompanyId] = useState<string>('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [movimentos, setMovimentos] = useState<MovimentoRow[]>([]);
  const [fechamento, setFechamento] = useState<FechamentoRow | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processando, setProcessando] = useState(false);

  useEffect(() => { if (companies.length && !companyId) setCompanyId(companies[0].id); }, [companies, companyId]);

  const carregar = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    const [mov, fech] = await Promise.all([
      supabase.from('movimento_diario').select('*').eq('company_id', companyId).eq('competencia', competencia),
      supabase.from('fechamentos_filial').select('*').eq('company_id', companyId).eq('competencia', competencia).maybeSingle(),
    ]);
    setMovimentos((mov.data as any) || []);
    setFechamento((fech.data as any) || null);
    if (fech.data) {
      const hist = await supabase.from('fechamentos_historico').select('*').eq('fechamento_id', (fech.data as any).id).order('created_at', { ascending: false });
      setHistorico(hist.data || []);
    } else {
      setHistorico([]);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [companyId, competencia]);

  // Consolida movimento → totais por funcionário
  const consolidado = useMemo(() => {
    const map = new Map<string, Record<TipoOcorrencia, { quantidade: number; valor: number; observacoes: string[] }>>();
    for (const m of movimentos) {
      if (!map.has(m.funcionario_id)) {
        map.set(m.funcionario_id, {
          falta: { quantidade: 0, valor: 0, observacoes: [] },
          atraso: { quantidade: 0, valor: 0, observacoes: [] },
          he50: { quantidade: 0, valor: 0, observacoes: [] },
          he100: { quantidade: 0, valor: 0, observacoes: [] },
          adicional: { quantidade: 0, valor: 0, observacoes: [] },
          desconto: { quantidade: 0, valor: 0, observacoes: [] },
          adiantamento: { quantidade: 0, valor: 0, observacoes: [] },
          observacao: { quantidade: 0, valor: 0, observacoes: [] },
        });
      }
      const acc = map.get(m.funcionario_id)!;
      acc[m.tipo].quantidade += Number(m.quantidade || 0);
      acc[m.tipo].valor += Number(m.valor || 0);
      if (m.observacao) acc[m.tipo].observacoes.push(m.observacao);
    }
    return map;
  }, [movimentos]);

  const compEmps = useMemo(
    () => employees.filter(e => e.companyId === companyId && e.status === 'ativo' && e.categoria === 'operacional'),
    [employees, companyId]
  );

  // Cálculo dos totais consolidados
  const totaisGerais = useMemo(() => {
    let proventos = 0, descontos = 0, liquido = 0;
    let funcAfetados = 0;
    compEmps.forEach(emp => {
      const c = consolidado.get(emp.id);
      const entry = {
        faltasDias: c?.falta.quantidade || 0,
        atrasos: c?.atraso.quantidade || 0,
        he50: c?.he50.quantidade || 0,
        he100: c?.he100.quantidade || 0,
        adicionais: c?.adicional.valor || 0,
        descontosDiversos: c?.desconto.valor || 0,
        adiantamento: c?.adiantamento.valor || Math.round(emp.salarioBase * 0.4 * 100) / 100,
        vrAplicado: emp.vrAtivo, vrDias: 0, vaAplicado: emp.vaAtivo, vtAplicado: emp.vtAtivo, vtDesconto: 0,
        comissaoBase: 0, insalubridadeAplicada: emp.insalubridadeAtiva, observacoes: '', statusConferencia: 'pendente',
      } as any;
      const calc = calcTotalFuncionario(emp, entry);
      proventos += calc.proventos;
      descontos += calc.descontos;
      liquido += calc.liquido;
      if (c) funcAfetados += 1;
    });
    return { proventos, descontos, liquido, funcAfetados };
  }, [consolidado, compEmps]);

  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email || '';
  const empresaNome = companies.find(c => c.id === companyId)?.name || '';
  const fechado = fechamento?.status === 'fechado';

  const fechar = async () => {
    if (!session) return;
    if (!confirm(`Confirmar fechamento de ${empresaNome} • ${competencia}?\n\nIsso vai gerar ${compEmps.length} lançamento(s) e travar a edição da filial.`)) return;
    setProcessando(true);

    try {
      // 1) upsert do fechamento (pré-status, valida limites)
      const { data: fechRow, error: fechErr } = await supabase
        .from('fechamentos_filial')
        .upsert({
          company_id: companyId,
          empresa_nome: empresaNome,
          competencia,
          status: 'fechado',
          fechado_por_user_id: session.user.id,
          fechado_por_nome: userName,
          fechado_em: new Date().toISOString(),
          total_funcionarios: compEmps.length,
          total_proventos: totaisGerais.proventos,
          total_descontos: totaisGerais.descontos,
          total_liquido: totaisGerais.liquido,
        }, { onConflict: 'company_id,competencia' })
        .select()
        .single();

      if (fechErr) throw fechErr;
      const fechamentoId = (fechRow as any).id;

      // 2) Para cada funcionário, gerar/atualizar lançamento mensal consolidado
      for (const emp of compEmps) {
        const c = consolidado.get(emp.id);
        const obsLista = c ? [
          ...c.falta.observacoes, ...c.atraso.observacoes, ...c.he50.observacoes, ...c.he100.observacoes,
          ...c.adicional.observacoes, ...c.desconto.observacoes, ...c.adiantamento.observacoes, ...c.observacao.observacoes,
        ].filter(Boolean) : [];

        const payload = {
          company_id: companyId,
          funcionario_id: emp.id,
          competencia,
          faltas_dias: c?.falta.quantidade || 0,
          atrasos: c?.atraso.quantidade || 0,
          he50: c?.he50.quantidade || 0,
          he100: c?.he100.quantidade || 0,
          adicionais: c?.adicional.valor || 0,
          descontos_diversos: c?.desconto.valor || 0,
          adiantamento: c?.adiantamento.valor || Math.round(emp.salarioBase * 0.4 * 100) / 100,
          vr_aplicado: emp.vrAtivo,
          va_aplicado: emp.vaAtivo,
          vt_aplicado: emp.vtAtivo,
          insalubridade_aplicada: emp.insalubridadeAtiva,
          observacoes: obsLista.join(' | ').slice(0, 500),
          status_conferencia: 'pendente',
          fechamento_id: fechamentoId,
          origem: 'consolidado',
          bloqueado: true,
        };

        // upsert manual: tenta update; se 0 linhas, insert
        const { data: existing } = await supabase
          .from('lancamentos_mensais')
          .select('id')
          .eq('company_id', companyId).eq('funcionario_id', emp.id).eq('competencia', competencia)
          .maybeSingle();

        if (existing) {
          await supabase.from('lancamentos_mensais').update(payload).eq('id', (existing as any).id);
        } else {
          await supabase.from('lancamentos_mensais').insert(payload);
        }
      }

      // 3) Histórico
      await supabase.from('fechamentos_historico').insert({
        fechamento_id: fechamentoId,
        acao: 'fechado',
        user_id: session.user.id,
        usuario_nome: userName,
        detalhes: {
          total_funcionarios: compEmps.length,
          total_proventos: totaisGerais.proventos,
          total_descontos: totaisGerais.descontos,
          total_liquido: totaisGerais.liquido,
        },
      });

      toast.success(`Fechamento concluído — ${compEmps.length} lançamento(s) gerado(s)`);
      carregar();
    } catch (e: any) {
      toast.error('Erro ao fechar: ' + (e.message || e));
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-primary" /> Fechamento da Filial
        </h1>
        <p className="text-sm text-muted-foreground">Consolida o movimento do período e envia para Lançamentos.</p>
      </div>

      <div className="card-premium p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Empresa</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-background">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Competência</label>
          <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Status */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-premium p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {fechado ? (
              <>
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="text-lg font-bold text-destructive">FECHADO</p>
                  <p className="text-xs text-muted-foreground">Por {fechamento?.fechado_por_nome} em {fechamento?.fechado_em ? new Date(fechamento.fechado_em).toLocaleString('pt-BR') : '—'}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                  <Unlock className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                  <p className="text-lg font-bold text-success">ABERTO</p>
                  <p className="text-xs text-muted-foreground">Aguardando fechamento da filial</p>
                </div>
              </>
            )}
          </div>
          {!fechado && (
            <Button onClick={fechar} disabled={processando || compEmps.length === 0} className="gradient-primary text-primary-foreground">
              <FileCheck className="w-4 h-4 mr-2" /> {processando ? 'Processando…' : 'Fechar período e enviar para Lançamentos'}
            </Button>
          )}
          {fechado && (
            <Badge variant="destructive" className="text-xs">Para reabrir, contate o admin</Badge>
          )}
        </div>
      </motion.div>

      {/* Totais previstos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Funcionários', v: compEmps.length, c: 'text-primary' },
          { l: 'Proventos', v: formatCurrency(totaisGerais.proventos), c: 'text-success' },
          { l: 'Descontos', v: formatCurrency(totaisGerais.descontos), c: 'text-destructive' },
          { l: 'Líquido', v: formatCurrency(totaisGerais.liquido), c: 'text-accent' },
        ].map((card, i) => (
          <div key={i} className="card-premium p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{card.l}</p>
            <p className={`text-lg font-bold font-display mt-1 ${card.c}`}>{card.v}</p>
          </div>
        ))}
      </div>

      {/* Histórico */}
      <div className="card-premium p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Histórico de ações</h2>
        {historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registros ainda.</p>
        ) : (
          <ul className="space-y-2">
            {historico.map((h: any) => (
              <li key={h.id} className="flex items-center gap-3 text-sm border-b last:border-0 py-2">
                {h.acao === 'fechado' ? <Lock className="w-4 h-4 text-destructive" /> : h.acao === 'reaberto' ? <Unlock className="w-4 h-4 text-success" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
                <span className="font-medium uppercase text-xs">{h.acao}</span>
                <span className="text-muted-foreground">por {h.usuario_nome}</span>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {movimentos.length === 0 && !fechado && (
        <div className="card-premium p-5 border-l-4 border-warning bg-warning/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-sm">Nenhum movimento registrado neste período. Vá em <strong>Movimento Diário</strong> e alimente as ocorrências antes de fechar.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilialFechamentoPage;
