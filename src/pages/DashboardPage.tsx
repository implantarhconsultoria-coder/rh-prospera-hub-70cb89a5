import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, Bus, Cpu, DollarSign, FileCheck, Flame, Fuel,
  ListChecks, Lock, Package, Rocket, ShieldCheck, TrendingDown, TrendingUp,
  Unlock, Users, Wrench,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { asoStatus, calcTotalFuncionario, feriasStatus, formatCurrency } from '@/lib/calculations';
import { supabase } from '@/integrations/supabase/client';
import { isDirectorRole } from '@/lib/directorPermissions';
import { getInsalubridadeAplicavel, getPericulosidadeAplicavel } from '@/lib/employeeRoleRules';

const DashboardPage: React.FC = () => {
  const { companies, employees, entries, session, userRoles } = useApp();
  const navigate = useNavigate();
  const comp = new Date().toISOString().slice(0, 7);
  const [fechStats, setFechStats] = useState({ fechadas: 0, abertas: 0, pendentes: 0 });
  const [liberarVisaoRhDiretor, setLiberarVisaoRhDiretor] = useState(false);
  const isDirector = isDirectorRole(userRoles);

  useEffect(() => {
    supabase.from('fechamentos_filial').select('status').eq('competencia', comp).then(({ data }) => {
      const arr = (data || []) as any[];
      const fechadas = arr.filter(f => f.status === 'fechado').length;
      const abertas = arr.filter(f => f.status === 'aberto' || f.status === 'reaberto').length;
      setFechStats({ fechadas, abertas, pendentes: Math.max(0, companies.length - fechadas - abertas) });
    });
  }, [comp, companies.length]);

  useEffect(() => {
    if (!isDirector) return;
    supabase
      .from('diretor_permissoes' as any)
      .select('liberar_visao_rh_diretor')
      .eq('user_id', session?.user?.id || '')
      .maybeSingle()
      .then(({ data }) => {
        setLiberarVisaoRhDiretor(Boolean((data as any)?.liberar_visao_rh_diretor));
      });
  }, [isDirector, session?.user?.id]);

  const h = new Date().getHours();
  const adminName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || null;
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const greetingText = adminName ? `${greeting}, ${adminName.split(' ')[0]}` : greeting;

  const companyStats = companies.map(c => {
    const emps = employees.filter(e => e.companyId === c.id && e.status === 'ativo' && e.categoria === 'operacional');
    const ents = entries.filter(e => e.companyId === c.id && e.competencia === comp);
    let totalProventos = 0, totalDescontos = 0, totalLiquido = 0;

    emps.forEach(emp => {
      const entry = ents.find(e => e.employeeId === emp.id);
      if (entry) {
        const calc = calcTotalFuncionario(emp, entry);
        totalProventos += calc.proventos;
        totalDescontos += calc.descontos;
        totalLiquido += calc.liquido;
      } else {
        totalProventos += emp.salarioBase;
        totalLiquido += emp.salarioBase;
      }
    });

    return {
      company: c,
      total: emps.length,
      totalProventos,
      totalDescontos,
      totalLiquido,
      feriasProximas: emps.filter(e => feriasStatus(e.dataAdmissao).status !== 'em dia').length,
      asoAlerta: emps.filter(e => asoStatus(e.dataExameMedico).status !== 'ok').length,
      beneficiosAtivos: emps.filter(e => e.vrAtivo || e.vaAtivo || e.vtAtivo).length,
      totalInsalubridade: emps.reduce((s, e) => s + getInsalubridadeAplicavel(e), 0),
      totalPericulosidade: emps.reduce((s, e) => s + getPericulosidadeAplicavel(e), 0),
    };
  });

  const totalFuncionarios = employees.filter(e => e.status === 'ativo' && e.categoria === 'operacional').length;
  const rhVisivel = !isDirector || liberarVisaoRhDiretor;
  const cardAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="admin-hero">
        <div className="admin-status-pill"><Cpu className="h-4 w-4" /> NUCLEO RH ONLINE</div>
        <div className="admin-hero-mark"><Building2 className="h-14 w-14" /></div>
        <p className="admin-hero-kicker">TOPAC RH PRO</p>
        <h1>TOPAC CENTRAL</h1>
        <p className="admin-hero-subtitle">
          {isDirector
            ? `${greetingText}. Dashboard executivo para indicadores consolidados e emissao de relatorios.`
            : `${greetingText}. Centro de comando operacional para RH, mecanicos, fechamento, estoque, frota e alertas em tempo real.`
          }
        </p>
        <div className="admin-hero-actions">
          {isDirector ? (
            <>
              <button onClick={() => navigate('/admin/financeiro')} className="admin-primary-action"><DollarSign className="h-4 w-4" />Financeiro</button>
              <button onClick={() => navigate('/admin/faturamento')} className="admin-secondary-action"><FileCheck className="h-4 w-4" />Faturamento</button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/admin/app-mecanico')} className="admin-primary-action"><Rocket className="h-4 w-4" />App dos mecanicos</button>
              <button onClick={() => navigate('/admin/fechamento')} className="admin-secondary-action"><ListChecks className="h-4 w-4" />Ver fechamento</button>
            </>
          )}
        </div>
      </div>

      {isDirector && !liberarVisaoRhDiretor && (
        <div className="card-premium p-4 border-amber-500/40 bg-amber-500/5 text-sm text-amber-100">
          Dados operacionais de RH em tempo real estao ocultos para o perfil Diretor Geral. A liberacao depende do administrador.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Funcionarios ativos', value: rhVisivel ? totalFuncionarios : 'Restrito', icon: Users, color: 'text-sky-300' },
          { label: 'Proventos estimados', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalProventos, 0)), icon: TrendingUp, color: 'text-emerald-300' },
          { label: 'Descontos estimados', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalDescontos, 0)), icon: TrendingDown, color: 'text-fuchsia-300' },
          { label: 'Liquido estimado', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalLiquido, 0)), icon: DollarSign, color: 'text-lime-300' },
        ].map((card, i) => (
          <motion.div key={card.label} {...cardAnim} transition={{ delay: i * 0.05 }} className="card-premium p-5">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p><p className={`text-xl font-bold font-display mt-1 ${card.color}`}>{card.value}</p></div>
              <card.icon className={`w-8 h-8 ${card.color} opacity-40`} />
            </div>
          </motion.div>
        ))}
      </div>

      {!isDirector && <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        {[
          { label: 'Operacional', icon: FileCheck, path: '/admin/chamados' },
          { label: 'App mecanicos', icon: Wrench, path: '/admin/app-mecanico' },
          { label: 'Ponto', icon: ListChecks, path: '/admin/fechamento-ponto' },
          { label: 'QR Code', icon: Fuel, path: '/admin/abastecimento-qrcode' },
          { label: 'Almoxarifado', icon: Package, path: '/admin/almoxarifado' },
          { label: 'VR / VT', icon: Bus, path: '/admin/fechamento' },
        ].map(item => (
          <button key={item.label} onClick={() => navigate(item.path)} className="card-premium p-4 text-left hover:border-emerald-400/50">
            <item.icon className="h-5 w-5 text-emerald-300 mb-3" />
            <span className="text-sm font-semibold">{item.label}</span>
          </button>
        ))}
      </div>}

      {rhVisivel && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Filiais fechadas', value: fechStats.fechadas, icon: Lock, color: 'text-emerald-300' },
          { label: 'Em andamento', value: fechStats.abertas, icon: Unlock, color: 'text-yellow-300' },
          { label: 'Pendentes', value: fechStats.pendentes, icon: AlertTriangle, color: 'text-fuchsia-300' },
        ].map((card, i) => (
          <motion.div key={card.label} {...cardAnim} transition={{ delay: 0.05 + i * 0.05 }} onClick={() => navigate('/admin/fechamento')} className="card-premium p-5 cursor-pointer">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p><p className={`text-2xl font-bold font-display mt-1 ${card.color}`}>{card.value}</p><p className="text-[10px] text-muted-foreground mt-1">Competencia {comp}</p></div>
              <card.icon className={`w-8 h-8 ${card.color} opacity-40`} />
            </div>
          </motion.div>
        ))}
      </div>}

      {rhVisivel && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {companyStats.map((cs, i) => (
          <motion.div key={cs.company.id} {...cardAnim} transition={{ delay: 0.1 + i * 0.05 }} className="card-premium p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center"><Building2 className="w-5 h-5 text-primary-foreground" /></div>
                <div className="min-w-0"><h3 className="font-bold font-display text-sm truncate">{cs.company.name}</h3><p className="text-[11px] text-muted-foreground">{cs.company.cnpj}</p></div>
              </div>
              <button onClick={() => navigate('/admin/fechamento')} className="admin-mini-action">Abrir</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: 'Funcionarios', v: cs.total },
                { l: 'Proventos', v: formatCurrency(cs.totalProventos) },
                { l: 'Descontos', v: formatCurrency(cs.totalDescontos) },
                { l: 'Liquido', v: formatCurrency(cs.totalLiquido) },
                { l: 'Ferias alerta', v: cs.feriasProximas },
                { l: 'ASO alerta', v: cs.asoAlerta },
                { l: 'Beneficios', v: cs.beneficiosAtivos },
                { l: 'Insalubridade', v: formatCurrency(cs.totalInsalubridade) },
                { l: 'Periculosidade', v: formatCurrency(cs.totalPericulosidade) },
                { l: 'Status', v: 'Aberto' },
              ].map(item => <div key={item.l} className="admin-metric-cell"><p>{item.l}</p><strong>{item.v}</strong></div>)}
            </div>
          </motion.div>
        ))}
      </div>}
    </div>
  );
};

export default DashboardPage;
