import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { asoStatus, feriasStatus } from '@/lib/calculations';
import { Users, Stethoscope, CalendarCheck, UtensilsCrossed, FileText, HardHat, Shirt, Bus, FileCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ROLE_COMPANY_MAP: Record<string, string> = {
  filial_praia: 'topac-pg',
  filial_goiania: 'topac-gyn',
};

const FilialDashboardPage: React.FC = () => {
  const { userRole, employees, session } = useApp();
  const navigate = useNavigate();
  const companyId = ROLE_COMPANY_MAP[userRole || ''];
  const emps = employees.filter(e => e.companyId === companyId && e.status === 'ativo');
  const asoAlerta = emps.filter(e => asoStatus(e.dataExameMedico).status !== 'ok').length;
  const feriasAlerta = emps.filter(e => feriasStatus(e.dataAdmissao).status !== 'em dia').length;

  const branchName = userRole === 'filial_praia' ? 'Praia Grande' : 'Goiânia';
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || null;

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const greetingText = userName ? `${greeting}, ${userName.split(' ')[0]}` : greeting;

  const shortcuts = [
    { label: 'Funcionários', icon: Users, path: '/filial/funcionarios' },
    { label: 'Lançamentos', icon: FileText, path: '/filial/lancamentos' },
    { label: 'Relatório', icon: FileCheck, path: '/filial/relatorio' },
    { label: 'EPI', icon: HardHat, path: '/filial/epi' },
    { label: 'Uniformes', icon: Shirt, path: '/filial/uniformes' },
    { label: 'VR', icon: UtensilsCrossed, path: '/filial/relatorio-vr' },
    { label: 'VT', icon: Bus, path: '/filial/relatorio-vt' },
    { label: 'ASO', icon: Stethoscope, path: '/filial/aso' },
    { label: 'Férias', icon: CalendarCheck, path: '/filial/aviso-ferias' },
    { label: 'Protocolo', icon: FileCheck, path: '/filial/protocolo' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">{greetingText}</h1>
        <p className="text-muted-foreground text-sm">Portal RH — {branchName}</p>
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

export default FilialDashboardPage;
