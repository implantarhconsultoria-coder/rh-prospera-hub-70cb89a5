import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Lock, Unlock, RefreshCw, ArrowRight, Building2, AlertTriangle, CheckCircle2, Clock, Wand2, Printer, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/lib/calculations';
import type { FechamentoRow } from '@/lib/movimento';

const FechamentosFiliaisPage: React.FC = () => {
  const { companies, session, userRole } = useApp();
  const isAdmin = userRole === 'admin';
  const navigate = useNavigate();
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [fechamentos, setFechamentos] = useState<FechamentoRow[]>([]);
  const [historicoOpen, setHistoricoOpen] = useState<string | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [acaoLoading, setAcaoLoading] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('fechamentos_filial').select('*').eq('competencia', competencia);
    if (error) toast.error(error.message);
    setFechamentos((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [competencia]);

  const linhas = useMemo(() => {
    return companies.map(c => {
      const f = fechamentos.find(x => x.company_id === c.id);
      return { company: c, fech: f, status: f?.status || 'pendente' };
    });
  }, [companies, fechamentos]);

  const stats = useMemo(() => ({
    total: linhas.length,
    fechadas: linhas.filter(l => l.status === 'fechado').length,
    abertas: linhas.filter(l => l.status === 'aberto' || l.status === 'em_andamento' || l.status === 'reaberto').length,
    pendentes: linhas.filter(l => l.status === 'pendente').length,
    totalLiquido: linhas.reduce((s, l) => s + Number(l.fech?.total_liquido || 0), 0),
    totalProventos: linhas.reduce((s, l) => s + Number(l.fech?.total_proventos || 0), 0),
    totalDescontos: linhas.reduce((s, l) => s + Number(l.fech?.total_descontos || 0), 0),
    totalFunc: linhas.reduce((s, l) => s + Number(l.fech?.total_funcionarios || 0), 0),
  }), [linhas]);

  const userName = () => session?.user?.user_metadata?.nome_completo || session?.user?.email || '';

  const fecharFolha = async (companyId: string, empresaNome: string) => {
    if (!session) return;
    if (!confirm(`Fechar a folha de "${empresaNome}" — ${competencia}?\n\nIsso recalcula valores, registra quem fechou e bloqueia a edição crítica.`)) return;
    setAcaoLoading(companyId);
    const { data, error } = await supabase.rpc('fechamento_filial_executar', {
      p_company_id: companyId, p_competencia: competencia,
      p_user_id: session.user.id, p_user_nome: userName(),
    });
    setAcaoLoading(null);
    if (error) return toast.error(error.message);
    const r = data as any;
    if (!r?.ok) return toast.error(r?.error || 'Não foi possível fechar');
    toast.success('Folha fechada');
    carregar();
  };

  const sincronizarUma = async (companyId: string) => {
    setAcaoLoading(companyId);
    const { error } = await supabase.rpc('fechamento_filial_sincronizar', {
      p_company_id: companyId, p_competencia: competencia,
    });
    setAcaoLoading(null);
    if (error) return toast.error(error.message);
    carregar();
  };

  const reabrir = async (fech: FechamentoRow) => {
    if (!session || !isAdmin) return toast.error('Somente Admin pode reabrir');
    const motivo = prompt('Motivo da reabertura:');
    if (!motivo) return;
    const { data, error } = await supabase.rpc('fechamento_filial_reabrir', {
      p_fechamento_id: fech.id, p_user_id: session.user.id, p_user_nome: userName(), p_motivo: motivo,
    });
    if (error) return toast.error(error.message);
    const r = data as any;
    if (!r?.ok) return toast.error(r?.error || 'Não foi possível reabrir');
    toast.success('Fechamento reaberto');
    carregar();
  };

  const verHistorico = async (fechId: string) => {
    if (historicoOpen === fechId) { setHistoricoOpen(null); return; }
    const { data } = await supabase.from('fechamentos_historico').select('*').eq('fechamento_id', fechId).order('created_at', { ascending: false });
    setHistorico(data || []);
    setHistoricoOpen(fechId);
  };

  const sincronizarTodos = async () => {
    setLoading(true);
    try {
      for (const c of companies) {
        await supabase.rpc('fechamento_filial_sincronizar', { p_company_id: c.id, p_competencia: competencia });
      }
      toast.success('Status sincronizado');
      await carregar();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const gerarPdf = async (companyId: string, empresaNome: string) => {
    setAcaoLoading(companyId);
    try {
      const { data: lancs } = await supabase.from('lancamentos_mensais')
        .select('funcionario_id, adicionais, he50, he100, comissao_base, descontos_diversos, adiantamento, vt_desconto')
        .eq('company_id', companyId).eq('competencia', competencia).is('apagado_em', null);
      const { data: funcs } = await supabase.from('funcionarios')
        .select('id, nome, cargo').eq('company_id', companyId);
      const fech = fechamentos.find(f => f.company_id === companyId);

      const linhasPdf = (lancs || []).map((l: any) => {
        const f = (funcs || []).find((x: any) => x.id === l.funcionario_id);
        const provs = Number(l.adicionais || 0) + Number(l.he50 || 0) + Number(l.he100 || 0) + Number(l.comissao_base || 0);
        const descs = Number(l.descontos_diversos || 0) + Number(l.adiantamento || 0) + Number(l.vt_desconto || 0);
        return { nome: f?.nome || '—', cargo: f?.cargo || '', provs, descs, liq: provs - descs };
      }).sort((a, b) => a.nome.localeCompare(b.nome));

      const totalP = linhasPdf.reduce((s, l) => s + l.provs, 0);
      const totalD = linhasPdf.reduce((s, l) => s + l.descs, 0);
      const totalL = totalP - totalD;

      const html = `<!DOCTYPE html><html><head><title>Folha ${empresaNome} ${competencia}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: Arial, sans-serif; color: #111; font-size: 11px; }
        .h1 { font-size: 18px; font-weight: 800; margin: 0; }
        .meta { color: #555; font-size: 10px; }
        .totais { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0 14px; }
        .totais .b { border: 1px solid #ccc; border-radius: 6px; padding: 8px; }
        .totais .l { font-size: 9px; color: #666; text-transform: uppercase; }
        .totais .v { font-size: 14px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; }
        th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; }
        td.r, th.r { text-align: right; }
        tfoot td { font-weight: 700; border-top: 2px solid #000; }
        .foot { margin-top: 16px; font-size: 10px; color: #555; }
      </style></head><body>
      <h1 class="h1">${empresaNome}</h1>
      <p class="meta">Folha de Pagamento — Competência ${competencia} — Status: ${(fech?.status || 'pendente').toUpperCase()}</p>
      <div class="totais">
        <div class="b"><div class="l">Funcionários</div><div class="v">${linhasPdf.length}</div></div>
        <div class="b"><div class="l">Proventos</div><div class="v">${formatCurrency(totalP)}</div></div>
        <div class="b"><div class="l">Descontos</div><div class="v">${formatCurrency(totalD)}</div></div>
        <div class="b"><div class="l">Líquido</div><div class="v">${formatCurrency(totalL)}</div></div>
      </div>
      <table>
        <thead><tr><th>Funcionário</th><th>Cargo</th><th class="r">Proventos</th><th class="r">Descontos</th><th class="r">Líquido</th></tr></thead>
        <tbody>
          ${linhasPdf.map(l => `<tr><td>${l.nome}</td><td>${l.cargo}</td><td class="r">${formatCurrency(l.provs)}</td><td class="r">${formatCurrency(l.descs)}</td><td class="r">${formatCurrency(l.liq)}</td></tr>`).join('')}
          ${linhasPdf.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#888;padding:14px">Sem lançamentos</td></tr>' : ''}
        </tbody>
        <tfoot><tr><td colspan="2">TOTAL</td><td class="r">${formatCurrency(totalP)}</td><td class="r">${formatCurrency(totalD)}</td><td class="r">${formatCurrency(totalL)}</td></tr></tfoot>
      </table>
      <p class="foot">Fechado por: ${fech?.fechado_por_nome || '—'} ${fech?.fechado_em ? '· ' + new Date(fech.fechado_em).toLocaleString('pt-BR') : ''}</p>
      </body></html>`;
      const w = window.open('', '_blank');
      if (!w) return toast.error('Permita pop-ups para gerar PDF');
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAcaoLoading(null);
    }
  };

  const renderStatus = (s: string) => {
    const map: Record<string, { label: string; cls: string; icon: any }> = {
      fechado: { label: 'Fechado', cls: 'bg-success text-success-foreground', icon: Lock },
      aberto: { label: 'Aberto', cls: 'bg-secondary text-secondary-foreground', icon: Unlock },
      em_andamento: { label: 'Em andamento', cls: 'bg-primary/15 text-primary border border-primary/30', icon: Clock },
      reaberto: { label: 'Reaberto', cls: 'bg-warning/15 text-warning border border-warning/30', icon: Unlock },
      enviado_central: { label: 'Enviado p/ Central', cls: 'bg-primary text-primary-foreground', icon: CheckCircle2 },
      em_conferencia: { label: 'Em Conferência', cls: 'bg-accent text-accent-foreground', icon: Clock },
      pendente: { label: 'Pendente', cls: 'bg-destructive/15 text-destructive border border-destructive/30', icon: AlertTriangle },
    };
    const m = map[s] || map.pendente;
    const Ic = m.icon;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${m.cls}`}><Ic className="w-3 h-3" />{m.label}</span>;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-primary" /> Fechamentos por Filial
          </h1>
          <p className="text-sm text-muted-foreground">Painel operacional · fechar, reabrir, conferir e gerar PDF.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Competência</label>
            <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44" />
          </div>
          <Button variant="default" size="sm" onClick={sincronizarTodos} disabled={loading}>
            <Wand2 className="w-4 h-4 mr-2" /> Sincronizar Status
          </Button>
          <Button variant="outline" size="sm" onClick={carregar}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: 'Total empresas', v: stats.total, c: 'text-primary', i: Building2 },
          { l: 'Fechadas', v: stats.fechadas, c: 'text-success', i: Lock },
          { l: 'Em andamento', v: stats.abertas, c: 'text-warning', i: Unlock },
          { l: 'Pendentes', v: stats.pendentes, c: 'text-destructive', i: AlertTriangle },
          { l: 'Líquido total', v: formatCurrency(stats.totalLiquido), c: 'text-accent', i: CheckCircle2 },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card-premium p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.l}</p>
                <p className={`text-lg font-bold font-display mt-1 ${s.c}`}>{s.v}</p>
              </div>
              <s.i className={`w-5 h-5 ${s.c} opacity-30`} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              {['Empresa', 'Status', 'Func.', 'Proventos', 'Descontos', 'Líquido', 'Fechado por', 'Ações'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              const podeFechar = l.status === 'aberto' || l.status === 'em_andamento' || l.status === 'reaberto';
              const isFechado = l.status === 'fechado';
              const busy = acaoLoading === l.company.id;
              return (
                <React.Fragment key={l.company.id}>
                  <tr className="border-b hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{l.company.name}</td>
                    <td className="px-3 py-2">{renderStatus(l.status)}</td>
                    <td className="px-3 py-2">{l.fech?.total_funcionarios || 0}</td>
                    <td className="px-3 py-2 text-success">{formatCurrency(Number(l.fech?.total_proventos || 0))}</td>
                    <td className="px-3 py-2 text-destructive">{formatCurrency(Number(l.fech?.total_descontos || 0))}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrency(Number(l.fech?.total_liquido || 0))}</td>
                    <td className="px-3 py-2 text-xs">
                      {l.fech?.fechado_por_nome || '—'}
                      {l.fech?.fechado_em && <div className="text-muted-foreground">{new Date(l.fech.fechado_em).toLocaleString('pt-BR')}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/admin/lancamentos?empresa=${l.company.id}&comp=${competencia}`)} title="Abrir fechamento">
                          <ArrowRight className="w-3.5 h-3.5 mr-1" /> Abrir
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/fechamentos-filiais/${l.company.id}/conferencia?comp=${competencia}`)} title="Conferir detalhamento contábil">
                          <Eye className="w-3.5 h-3.5 mr-1" /> Conferir
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => sincronizarUma(l.company.id)} title="Recalcular">
                          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                        </Button>
                        {podeFechar && (
                          <Button variant="default" size="sm" disabled={busy} onClick={() => fecharFolha(l.company.id, l.company.name)} className="bg-success text-success-foreground hover:bg-success/90">
                            <Lock className="w-3.5 h-3.5 mr-1" /> Fechar
                          </Button>
                        )}
                        {isFechado && isAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => reabrir(l.fech!)} className="text-warning" title="Reabrir">
                            <Unlock className="w-3.5 h-3.5 mr-1" /> Reabrir
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => gerarPdf(l.company.id, l.company.name)} title="PDF">
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        {l.fech && (
                          <Button variant="ghost" size="sm" onClick={() => verHistorico(l.fech!.id)} title="Histórico">
                            <Clock className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {historicoOpen === l.fech?.id && (
                    <tr className="bg-muted/30">
                      <td colSpan={8} className="px-6 py-3">
                        <p className="text-xs font-semibold mb-2">Histórico de ações</p>
                        <ul className="space-y-1 text-xs">
                          {historico.length === 0 && <li className="text-muted-foreground">Sem registros</li>}
                          {historico.map((h: any) => (
                            <li key={h.id} className="flex items-center gap-2">
                              <span className="font-medium uppercase">{h.acao}</span>
                              <span className="text-muted-foreground">por {h.usuario_nome}</span>
                              <span className="text-muted-foreground ml-auto">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                              {h.detalhes?.motivo && <span className="text-warning ml-2">— {h.detalhes.motivo}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FechamentosFiliaisPage;
