import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';

const SEV_COLORS: Record<string, string> = {
  baixa: 'bg-muted text-muted-foreground',
  media: 'bg-warning/20 text-warning',
  alta: 'bg-destructive/20 text-destructive',
};

const PendenciasPage: React.FC = () => {
  const ext = useAcessoExternoFiltro();
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const applyEmp = (q: any) => safeIds ? q.in('empresa_id', safeIds) : q;

    const hoje = new Date().toISOString().slice(0, 10);
    const auto: any[] = [];

    const { data: cSemRegra } = await applyEmp(supabase.from('contratos').select('id, numero, empresa_id').is('regra_faturamento', null));
    cSemRegra?.forEach((c: any) => auto.push({ tipo: 'contrato_sem_regra', descricao: `Contrato ${c.numero} sem regra de faturamento`, severidade: 'alta', contrato_id: c.id, automatica: true }));

    const { data: cVencidos } = await applyEmp(supabase.from('contratos').select('id, numero, data_fim, empresa_id').eq('status', 'ativo').not('data_fim', 'is', null).lt('data_fim', hoje));
    cVencidos?.forEach((c: any) => auto.push({ tipo: 'contrato_vencido', descricao: `Contrato ${c.numero} vencido em ${c.data_fim} mas ainda ativo`, severidade: 'alta', contrato_id: c.id, automatica: true }));

    const { data: fVencidas } = await applyEmp(supabase.from('faturas').select('id, numero, data_vencimento, total, empresa_id').in('status', ['em_aberto', 'enviada']).lt('data_vencimento', hoje));
    fVencidas?.forEach((f: any) => auto.push({ tipo: 'fatura_vencida', descricao: `Fatura ${f.numero} vencida em ${f.data_vencimento} (R$ ${Number(f.total).toFixed(2)})`, severidade: 'alta', fatura_id: f.id, automatica: true }));

    const mQ = safeIds
      ? supabase.from('medicoes').select('id, competencia, contratos!inner(empresa_id)').eq('status', 'pendente').in('contratos.empresa_id', safeIds)
      : supabase.from('medicoes').select('id, competencia').eq('status', 'pendente');
    const { data: mPend } = await mQ;
    mPend?.forEach((m: any) => auto.push({ tipo: 'medicao_pendente', descricao: `Medição da competência ${m.competencia} aguardando aprovação`, severidade: 'media', automatica: true }));

    // Pendências persistidas (sem empresa_id direto na tabela; mantemos só em visão admin)
    const salvas = ext.isExterno
      ? { data: [] as any[] }
      : await supabase.from('faturamento_pendencias').select('*').eq('status', 'aberta').order('created_at', { ascending: false });

    setPendencias([...auto, ...((salvas as any).data || [])]);
    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const resolver = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('faturamento_pendencias').update({ status: 'resolvida', resolvida_em: new Date().toISOString(), resolvida_por: user?.id }).eq('id', id);
    toast.success('Pendência resolvida');
    carregar();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2"><AlertTriangle className="w-6 h-6 text-warning" /> Pendências</h1>
          <p className="text-sm text-muted-foreground">{pendencias.length} pendência(s) ativa(s)</p>
        </div>
        <button onClick={carregar} className="btn-secondary flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
      </div>

      {loading ? <p className="text-center text-muted-foreground p-8">Carregando...</p> : pendencias.length === 0 ? (
        <div className="card-premium p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
          <p className="text-foreground font-semibold">Tudo em ordem!</p>
          <p className="text-sm text-muted-foreground">Nenhuma pendência detectada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pendencias.map((p, i) => (
            <div key={p.id || i} className="card-premium p-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${p.severidade === 'alta' ? 'text-destructive' : 'text-warning'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.descricao}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${SEV_COLORS[p.severidade]}`}>{p.severidade.toUpperCase()}</span>
                    <span className="text-[10px] text-muted-foreground">{p.tipo}{p.automatica && ' • detectada automaticamente'}</span>
                  </div>
                </div>
              </div>
              {!p.automatica && (
                <button onClick={() => resolver(p.id)} className="btn-secondary text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolver</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendenciasPage;
