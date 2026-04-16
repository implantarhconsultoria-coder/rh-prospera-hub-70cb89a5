import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { asoStatus, feriasStatus } from '@/lib/calculations';
import { Users, Stethoscope, CalendarCheck, FileText, FileCheck, Bell, User } from 'lucide-react';
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
  const userEmail = session?.user?.email || '';

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const greetingText = userName ? `${greeting}, ${userName.split(' ')[0]}` : greeting;

  const shortcuts = [
    { label: 'Funcionários', icon: Users, path: '/filial/funcionarios' },
    { label: 'Aviso de Férias', icon: CalendarCheck, path: '/filial/aviso-ferias' },
    { label: 'ASO / Agendamento', icon: Stethoscope, path: '/filial/aso' },
    { label: 'Documentos de RH', icon: FileText, path: '/filial/documentos-ativos' },
    { label: 'Protocolos', icon: FileCheck, path: '/filial/protocolo' },
    { label: 'Alertas', icon: Bell, path: '/filial/alertas' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* User identification */}
      <div className="card-premium p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold font-display text-foreground">{greetingText}</h1>
          <p className="text-muted-foreground text-sm">Portal RH — Filial {branchName}</p>
          <p className="text-xs text-muted-foreground/70">{userEmail}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Funcionários Ativos', value: emps.length, icon: Users, color: 'text-primary' },
          { label: 'ASO em Alerta', value: asoAlerta, icon: Stethoscope, color: asoAlerta > 0 ? 'text-destructive' : 'text-success', onClick: () => navigate('/filial/alertas') },
          { label: 'Férias a Vencer', value: feriasAlerta, icon: CalendarCheck, color: feriasAlerta > 0 ? 'text-warning' : 'text-success', onClick: () => navigate('/filial/alertas') },
        ].map((card, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            onClick={card.onClick}
            className={`card-premium p-4 ${card.onClick ? 'cursor-pointer hover:bg-sidebar-accent/20' : ''}`}>
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

      {/* Quick alerts */}
      {(asoAlerta > 0 || feriasAlerta > 0) && (
        <div className="card-premium p-4 border-l-4 border-warning">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-warning" /> Alertas do dia
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {asoAlerta > 0 && <li>• {asoAlerta} funcionário(s) com ASO pendente ou vencido</li>}
            {feriasAlerta > 0 && <li>• {feriasAlerta} funcionário(s) com férias a vencer</li>}
          </ul>
          <button onClick={() => navigate('/filial/alertas')} className="mt-2 text-xs text-primary hover:underline">Ver todos os alertas →</button>
        </div>
      )}

      {/* Shortcuts */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Acesso Rápido</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
