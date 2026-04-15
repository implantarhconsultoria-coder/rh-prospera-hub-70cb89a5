import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { calcTotalFuncionario, asoStatus, feriasStatus, formatCurrency } from '@/lib/calculations';
import { Building2, Users, TrendingUp, TrendingDown, DollarSign, AlertTriangle, ShieldCheck, Flame, FileCheck, HardHat, Shirt, Bus, UtensilsCrossed, Stethoscope, CalendarCheck, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ROLE_COMPANY_MAP: Record<string, string> = {
  filial_praia: 'topac-pg',
  filial_goiania: 'topac-gyn',
};

const FilialDashboard: React.FC = () => {
  const { userRole, employees, session } = useApp();
  const navigate = useNavigate();
  const companyId = ROLE_COMPANY_MAP[userRole || ''];
  const emps = employees.filter(e => e.companyId === companyId && e.status === 'ativo');
  const asoAlerta = emps.filter(e => asoStatus(e.dataExameMedico).status !== 'ok').length;
  const feriasAlerta = emps.filter(e => feriasStatus(e.dataAdmissao).status !== 'em dia').length;

  const branchName = userRole === 'filial_praia' ? 'Praia Grande' : 'Goiânia';

  const shortcuts = [
    { label: 'Funcionários', icon: Users, path: '/funcionarios' },
    { label: 'Lançamentos', icon: FileText, path: '/lancamentos' },
    { label: 'Relatório', icon: FileCheck, path: '/relatorio' },
    { label: 'EPI', icon: HardHat, path: '/epi' },
    { label: 'Uniformes', icon: Shirt, path: '/uniformes' },
    { label: 'VR', icon: UtensilsCrossed, path: '/relatorio-vr' },
    { label: 'VT', icon: Bus, path: '/relatorio-vt' },
    { label: 'ASO', icon: Stethoscope, path: '/aso' },
    { label: 'Férias', icon: CalendarCheck, path: '/aviso-ferias' },
    { label: 'Protocolo', icon: FileCheck, path: '/protocolo' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Portal RH — {branchName}</h1>
        <p className="text-muted-foreground text-sm">Bem-vindo(a), {session?.user?.email}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Funcionários Ativos', value: emps.length, icon: Users, color: 'text-primary' },
          { label: 'ASO em Alerta', value: asoAlerta, icon: Stethoscope, color: asoAlerta > 0 ? 'text-destructive' : 'text-success' },
          { label: 'Férias Próximas', value: feriasAlerta, icon: CalendarCheck, color: feriasAlerta > 0 ? 'text-warning' : 'text-success' },
          { label: 'Benefícios Ativos', value: emps.filter(e => e.vrAtivo || e.vaAtivo || e.vtAtivo).length, icon: UtensilsCrossed, color: 'text-accent' },
        ].map((card, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card-premium p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{card.label}</p>
                <p className={`text-xl font-bold font-display mt-1 ${card.color}`}>{card.value}</p>
              </div>
              <card.icon className={`w-7 h-7 ${card.color} opacity-30`} />
            </div>
          </motion.div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Acesso Rápido</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {shortcuts.map((s, i) => (
            <motion.button key={s.path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.03 }}
              onClick={() => navigate(s.path)}
              className="card-premium p-4 flex flex-col items-center gap-2 hover:bg-sidebar-accent/30 transition-colors">
              <s.icon className="w-6 h-6 text-primary" />
              <span className="text-xs font-medium text-foreground">{s.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

const DashboardPage: React.FC = () => {
  const { companies, employees, entries, userRole } = useApp();
  const navigate = useNavigate();

  // Filial users get simplified portal
  if (userRole === 'filial_praia' || userRole === 'filial_goiania') {
    return <FilialDashboard />;
  }

  const comp = new Date().toISOString().slice(0, 7);

  const companyStats = companies.map(c => {
    const emps = employees.filter(e => e.companyId === c.id && e.status === 'ativo' && e.categoria === 'operacional');
    const ents = entries.filter(e => e.companyId === c.id && e.competencia === comp);

    let totalProventos = 0, totalDescontos = 0, totalLiquido = 0;
    emps.forEach(emp => {
      const entry = ents.find(e => e.employeeId === emp.id);
      if (entry) {
        const calc = calcTotalFuncionario(emp, entry);
        totalProventos += calc.proventos; totalDescontos += calc.descontos; totalLiquido += calc.liquido;
      } else {
        totalProventos += emp.salarioBase;
        totalLiquido += emp.salarioBase;
      }
    });

    const feriasProximas = emps.filter(e => feriasStatus(e.dataAdmissao).status !== 'em dia').length;
    const asoAlerta = emps.filter(e => asoStatus(e.dataExameMedico).status !== 'ok').length;
    const beneficiosAtivos = emps.filter(e => e.vrAtivo || e.vaAtivo || e.vtAtivo).length;
    const totalInsalubridade = emps.filter(e => e.insalubridadeAtiva).reduce((s, e) => s + e.insalubridadeValor, 0);

    return { company: c, total: emps.length, totalProventos, totalDescontos, totalLiquido, feriasProximas, asoAlerta, beneficiosAtivos, totalInsalubridade };
  });

  const cardAnim = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Dashboard Executivo</h1>
        <p className="text-muted-foreground text-sm">Visão consolidada da operação — Competência {comp}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Funcionários', value: employees.filter(e => e.status === 'ativo' && e.categoria === 'operacional').length, icon: Users, color: 'text-primary' },
          { label: 'Proventos Estimados', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalProventos, 0)), icon: TrendingUp, color: 'text-success' },
          { label: 'Descontos Estimados', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalDescontos, 0)), icon: TrendingDown, color: 'text-destructive' },
          { label: 'Líquido Estimado', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalLiquido, 0)), icon: DollarSign, color: 'text-accent' },
        ].map((card, i) => (
          <motion.div key={i} {...cardAnim} transition={{ delay: i * 0.05 }} className="card-premium p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
                <p className={`text-xl font-bold font-display mt-1 ${card.color}`}>{card.value}</p>
              </div>
              <card.icon className={`w-8 h-8 ${card.color} opacity-30`} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {companyStats.map((cs, i) => (
          <motion.div key={cs.company.id} {...cardAnim} transition={{ delay: 0.1 + i * 0.05 }}
            className="card-premium p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-bold font-display text-foreground text-sm">{cs.company.name}</h3>
                  <p className="text-[11px] text-muted-foreground">{cs.company.cnpj}</p>
                </div>
              </div>
              <button onClick={() => navigate('/fechamento')}
                className="text-xs gradient-accent text-accent-foreground px-3 py-1.5 rounded-md font-medium hover:opacity-90 transition-opacity">
                Abrir Fechamento
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { l: 'Funcionários', v: cs.total, icon: Users },
                { l: 'Proventos', v: formatCurrency(cs.totalProventos), icon: TrendingUp },
                { l: 'Descontos', v: formatCurrency(cs.totalDescontos), icon: TrendingDown },
                { l: 'Líquido', v: formatCurrency(cs.totalLiquido), icon: DollarSign },
                { l: 'Férias Alerta', v: cs.feriasProximas, icon: AlertTriangle },
                { l: 'ASO Alerta', v: cs.asoAlerta, icon: ShieldCheck },
                { l: 'Benefícios', v: cs.beneficiosAtivos, icon: FileCheck },
                { l: 'Insalubridade', v: formatCurrency(cs.totalInsalubridade), icon: Flame },
                { l: 'Status', v: 'Aberto', icon: FileCheck },
              ].map((item, j) => (
                <div key={j} className="bg-muted/50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">{item.l}</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
