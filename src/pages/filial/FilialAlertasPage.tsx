import React from 'react';
import { useApp } from '@/context/AppContext';
import { asoStatus, feriasStatus } from '@/lib/calculations';
import { AlertTriangle, Stethoscope, CalendarCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const ROLE_COMPANY_MAP: Record<string, string> = {
  filial_praia: 'topac-pg',
  filial_goiania: 'topac-gyn',
};

const FilialAlertasPage: React.FC = () => {
  const { userRole, employees } = useApp();
  const navigate = useNavigate();
  const companyId = ROLE_COMPANY_MAP[userRole || ''];
  const emps = employees.filter(e => e.companyId === companyId && e.status === 'ativo');

  const asoAlerts = emps
    .map(e => ({ ...e, aso: asoStatus(e.dataExameMedico) }))
    .filter(e => e.aso.status !== 'ok');

  const feriasAlerts = emps
    .map(e => ({ ...e, ferias: feriasStatus(e.dataAdmissao) }))
    .filter(e => e.ferias.status !== 'em dia');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Alertas da Filial</h1>
        <p className="text-muted-foreground text-sm">Pendências que precisam de atenção</p>
      </div>

      {/* ASO Alerts */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Stethoscope className="w-4 h-4" /> ASO Pendente / Vencido ({asoAlerts.length})
        </h2>
        {asoAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta de ASO.</p>
        ) : (
          <div className="space-y-2">
            {asoAlerts.map((e, i) => (
              <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/filial/funcionarios/${e.id}`)}
                className="card-premium p-3 flex items-center justify-between cursor-pointer hover:bg-sidebar-accent/20 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.cargo}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${e.aso.status === 'vencido' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
                  {e.aso.label}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Férias Alerts */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4" /> Férias a Vencer ({feriasAlerts.length})
        </h2>
        {feriasAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta de férias.</p>
        ) : (
          <div className="space-y-2">
            {feriasAlerts.map((e, i) => (
              <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/filial/aviso-ferias`)}
                className="card-premium p-3 flex items-center justify-between cursor-pointer hover:bg-sidebar-accent/20 transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.cargo}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${e.ferias.status === 'vencidas' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
                  {e.ferias.label}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {asoAlerts.length === 0 && feriasAlerts.length === 0 && (
        <div className="card-premium p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-success mx-auto mb-3 opacity-50" />
          <p className="text-sm text-muted-foreground">Nenhuma pendência ativa. Tudo em dia!</p>
        </div>
      )}
    </div>
  );
};

export default FilialAlertasPage;
