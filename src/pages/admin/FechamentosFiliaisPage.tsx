import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Lock, Unlock, RefreshCw, ArrowRight, Building2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { calcTotalFuncionario, formatCurrency } from '@/lib/calculations';
import type { FechamentoRow } from '@/lib/movimento';

const FechamentosFiliaisPage: React.FC = () => {
  const { companies, employees, session } = useApp();
  const navigate = useNavigate();
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [fechamentos, setFechamentos] = useState<FechamentoRow[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [historicoOpen, setHistoricoOpen] = useState<string | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [fechResult, lancResult] = await Promise.all([
      supabase.from('fechamentos_filial').select('*').eq('competencia', competencia),
      supabase.from('lancamentos_mensais').select('*').eq('competencia', competencia).is('apagado_em', null),
    ]);

    if (fechResult.error) toast.error(fechResult.error.message);
    if (lancResult.error) toast.error(lancResult.error.message);

    setFechamentos((fechResult.data as any) || []);
    setLancamentos((lancResult.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [competencia]);

  const linhas = useMemo(() => {
    return companies.map(company => {
      const fech = fechamentos.find(item => item.company_id === company.id);
      const funcionariosAtivos = employees.filter(emp =>
        emp.companyId === company.id && emp.status === 'ativo' && emp.categoria === 'operacional'
      );
      const lancamentosEmpresa = lancamentos.filter(item => item.company_id === company.id);

      let totalProventos = Number(fech?.total_proventos || 0);
      let totalDescontos = Number(fech?.total_descontos || 0);
      let totalLiquido = Number(fech?.total_liquido || 0);

      const fechamentoSemTotais = Boolean(fech) &&
        Number(fech?.total_funcionarios || 0) === 0 &&
        totalProventos === 0 && totalDescontos === 0 && totalLiquido === 0;

      if (lancamentosEmpresa.length > 0 && (!fech || fechamentoSemTotais)) {
        totalProventos = 0;
        totalDescontos = 0;
        totalLiquido = 0;

        for (const lanc of lancamentosEmpresa) {
          const emp = employees.find(item => item.id === lanc.funcionario_id);
          if (!emp) continue;

          const entry: any = {
            employeeId: emp.id,
            companyId: company.id,
            competencia,
            faltasDias: Number(lanc.faltas_dias || 0),
            atrasos: Number(lanc.atrasos || 0),
            he50: Number(lanc.he50 || 0),
            he100: Number(lanc.he100 || 0),
            adicionais: Number(lanc.adicionais || 0),
            descontosDiversos: Number(lanc.descontos_diversos || 0),
            adiantamento: Number(lanc.adiantamento || 0),
            vrAplicado: Boolean(lanc.vr_aplicado),
            vrDias: Number(lanc.vr_dias || 0),
            vaAplicado: Boolean(lanc.va_aplicado),
            vtAplicado: Boolean(lanc.vt_aplicado),
            vtDesconto: Number(lanc.vt_desconto || 0),
            comissaoBase: Number(lanc.comissao_base || 0),
            insalubridadeAplicada: Boolean(lanc.insalubridade_aplicada),
            observacoes: lanc.observacoes || '',
            statusConferencia: lanc.status_conferencia || 'pendente',
          };

          const calc = calcTotalFuncionario(emp as any, entry);
          totalProventos += Number(calc.proventos || 0);
          totalDescontos += Number(calc.descontos || 0);
          totalLiquido += Number(calc.liquido || 0);
        }
      }

      const status = fech?.status || (lancamentosEmpresa.length > 0 ? 'aberto' : 'pendente');
      const totalFuncionarios = Number(fech?.total_funcionarios || 0) > 0
        ? Number(fech?.total_funcionarios)
        : Math.max(funcionariosAtivos.length, lancamentosEmpresa.length);

      return {
        company,
        fech,
        status,
        totalFuncionarios,
        totalProventos,
        totalDescontos,
        totalLiquido,
        lancamentos: lancamentosEmpresa.length,
      };
    });
  }, [companies, employees, fechamentos, lancamentos, competencia]);

  const stats = useMemo(() => ({
    total: linhas.length,
    fechadas: linhas.filter(l => l.status === 'fechado').length,
    abertas: linhas.filter(l => l.status === 'aberto' || l.status === 'reaberto').length,
    pendentes: linhas.filter(l => l.status === 'pendente').length,
    totalLiquido: linhas.reduce((sum, linha) => sum + Number(linha.totalLiquido || 0), 0),
  }), [linhas]);

  const reabrir = async (fech: FechamentoRow) => {
    if (!session) return;
    const motivo = prompt('Motivo da reabertura:');
    if (!motivo) return;
    const userName = session.user.user_metadata?.nome_completo || session.user.email || '';
    const { error } = await supabase.from('fechamentos_filial').update({
      status: 'reaberto',
      reaberto_por_user_id: session.user.id,
      reaberto_por_nome: userName,
      reaberto_em: new Date().toISOString(),
      motivo_reabertura: motivo,
    }).eq('id', fech.id);
    if (error) return toast.error(error.message);

    await supabase.from('lancamentos_mensais').update({ bloqueado: false }).eq('fechamento_id', fech.id);
    await supabase.from('fechamentos_historico').insert({
      fechamento_id: fech.id,
      acao: 'reaberto',
      user_id: session.user.id,
      usuario_nome: userName,
      detalhes: { motivo },
    });
    toast.success('Fechamento reaberto');
    carregar();
  };

  const verHistorico = async (fechId: string) => {
    if (historicoOpen === fechId) { setHistoricoOpen(null); return; }
    const { data } = await supabase.from('fechamentos_historico').select('*').eq('fechamento_id', fechId).order('created_at', { ascending: false });
    setHistorico(data || []);
    setHistoricoOpen(fechId);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-primary" /> Fechamentos por Filial
          </h1>
          <p className="text-sm text-muted-foreground">Dados consolidados de todas as empresas por competência.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Competência</label>
            <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} className="w-44" />
          </div>
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
              {['Empresa','Status','Funcionários','Lançamentos','Proventos','Descontos','Líquido','Fechado por','Fechado em','Ações'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <React.Fragment key={l.company.id}>
                <tr className="border-b hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{l.company.name}</td>
                  <td className="px-3 py-2">
                    {l.status === 'fechado' && <Badge variant="default" className="bg-success text-success-foreground gap-1"><Lock className="w-3 h-3" /> Fechado</Badge>}
                    {l.status === 'aberto' && <Badge variant="secondary" className="gap-1"><Unlock className="w-3 h-3" /> Aberto</Badge>}
                    {l.status === 'reaberto' && <Badge variant="outline" className="gap-1 border-warning text-warning"><Unlock className="w-3 h-3" /> Reaberto</Badge>}
                    {l.status === 'pendente' && <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" /> Pendente</Badge>}
                  </td>
                  <td className="px-3 py-2">{l.totalFuncionarios}</td>
                  <td className="px-3 py-2">{l.lancamentos}</td>
                  <td className="px-3 py-2 text-success">{formatCurrency(l.totalProventos)}</td>
                  <td className="px-3 py-2 text-destructive">{formatCurrency(l.totalDescontos)}</td>
                  <td className="px-3 py-2 font-semibold">{formatCurrency(l.totalLiquido)}</td>
                  <td className="px-3 py-2 text-xs">{l.fech?.fechado_por_nome || '—'}</td>
                  <td className="px-3 py-2 text-xs">{l.fech?.fechado_em ? new Date(l.fech.fechado_em).toLocaleString('pt-BR') : '—'}</td>
                  <td className="px-3 py-2 flex gap-1">
                    {l.fech && <Button variant="ghost" size="sm" onClick={() => verHistorico(l.fech!.id)} title="Histórico"><Clock className="w-4 h-4" /></Button>}
                    {l.status === 'fechado' && <Button variant="ghost" size="sm" onClick={() => reabrir(l.fech!)} title="Reabrir" className="text-warning"><Unlock className="w-4 h-4" /></Button>}
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/lancamentos?empresa=${l.company.id}&comp=${competencia}`)} title="Ver lançamentos"><ArrowRight className="w-4 h-4" /></Button>
                  </td>
                </tr>
                {historicoOpen === l.fech?.id && (
                  <tr className="bg-muted/30">
                    <td colSpan={10} className="px-6 py-3">
                      <p className="text-xs font-semibold mb-2">Histórico de ações</p>
                      <ul className="space-y-1 text-xs">
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FechamentosFiliaisPage;
