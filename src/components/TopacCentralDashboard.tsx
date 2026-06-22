import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, Activity, AlertTriangle, Search, Settings, ShieldCheck, Users } from 'lucide-react';
import '@/styles/topac-central.css';

type CentralKpi = {
  label: string;
  value: string;
  icon: LucideIcon;
  color?: string;
  onClick?: () => void;
};

type CentralAction = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'primary' | 'default';
};

type CentralAlert = {
  title: string;
  description: string;
  tone?: 'danger' | 'warning' | 'success';
};

type CentralListItem = {
  title: string;
  value: string;
  meta?: string;
  danger?: boolean;
};

type TopacCentralDashboardProps = {
  modulo: 'Financeiro' | 'Faturamento';
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
  kpis: CentralKpi[];
  actions: CentralAction[];
  alerts: CentralAlert[];
  leftPanelTitle: string;
  leftPanelItems: CentralListItem[];
  rightPanelTitle: string;
  rightPanelItems: CentralListItem[];
  emptyLeft: string;
  emptyRight: string;
  dn4Slot?: React.ReactNode;
};

const sparkBars = [28, 44, 38, 56, 48, 68, 62, 74, 86];
const timeline = [
  { title: 'Mecânicos atrigaram serviço', meta: 'Chegada registrada no operacional', tone: 'cyan' },
  { title: 'Solicitar peças', meta: 'Pedido enviado para almoxarifado', tone: 'pink' },
  { title: 'Aprovar ponto', meta: 'Conferência pendente no módulo', tone: 'green' },
  { title: 'Confirmar peças', meta: 'Baixa disponível para validação', tone: 'cyan' },
];

const toneClass = {
  danger: 'topac-alert-danger',
  warning: 'topac-alert-warning',
  success: 'topac-alert-success',
};

const KpiCard = ({ item, index }: { item: CentralKpi; index: number }) => (
  <motion.button
    type="button"
    disabled={!item.onClick}
    onClick={item.onClick}
    className="topac-glass-card topac-kpi-card text-left disabled:cursor-default"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.05 }}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="topac-kpi-label">{item.label}</p>
        <p className={`topac-kpi-value ${item.color || 'text-cyan-200'}`}>{item.value}</p>
      </div>
      <item.icon className={`h-5 w-5 shrink-0 ${item.color || 'text-cyan-300'} opacity-70`} />
    </div>
    <div className="topac-mini-chart" aria-hidden="true">
      {sparkBars.map((h, barIndex) => (
        <span key={barIndex} style={{ height: `${h}%` }} />
      ))}
    </div>
  </motion.button>
);

const TopacCentralDashboard: React.FC<TopacCentralDashboardProps> = ({
  modulo,
  subtitle,
  loading,
  onRefresh,
  kpis,
  actions,
  alerts,
  leftPanelTitle,
  leftPanelItems,
  rightPanelTitle,
  rightPanelItems,
  emptyLeft,
  emptyRight,
  dn4Slot,
}) => {
  return (
    <div className="topac-central-shell animate-fade-in">
      <div className="topac-network" aria-hidden="true" />

      <header className="topac-central-topbar no-print">
        <div className="flex items-center gap-3 min-w-0">
          <span className="topac-live-dot" />
          <span className="truncate">Núcleo TOPAC online</span>
          <span className="hidden sm:inline text-cyan-100/45">central-rh</span>
          <span className="hidden sm:inline text-cyan-100/45">v2.41</span>
        </div>
        <div className="topac-search-box">
          <Search className="h-4 w-4" />
          <span>Buscar / executar</span>
        </div>
        <button type="button" onClick={onRefresh} className="topac-refresh-button">
          <Activity className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </header>

      <section className="topac-central-grid">
        <main className="topac-central-main">
          <div className="topac-hero-panel">
            <div className="topac-status-pill"><ShieldCheck className="h-4 w-4" /> {modulo} online</div>
            <div className="flex items-center justify-end gap-2 no-print">
              <Settings className="h-4 w-4 text-cyan-100/60" />
            </div>
            <div className="topac-hero-title-wrap">
              <p className="topac-hero-kicker">{subtitle}</p>
              <h1>TOPAC CENTRAL</h1>
            </div>
            <div className="topac-activity-map">
              <div className="topac-flow-line" />
              {timeline.map((event, index) => (
                <motion.div
                  key={event.title}
                  className={`topac-event-bubble topac-event-${event.tone}`}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + index * 0.08 }}
                >
                  <span className="topac-event-avatar"><Users className="h-3.5 w-3.5" /></span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.meta}</small>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="topac-kpi-row">
            {kpis.slice(0, 4).map((item, index) => <KpiCard key={item.label} item={item} index={index} />)}
          </div>

          <div className="topac-actions-strip no-print">
            <span>Contextual actions</span>
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <button key={action.label} type="button" onClick={action.onClick} className={action.tone === 'primary' ? 'topac-action-primary' : 'topac-action'}>
                  <action.icon className="h-4 w-4" /> {action.label}
                </button>
              ))}
            </div>
          </div>

          <div className="topac-module-row no-print">
            {actions.slice(0, 5).map((action) => (
              <button key={action.label} type="button" onClick={action.onClick} className="topac-module-tile">
                <action.icon className="h-5 w-5" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </main>

        <aside className="topac-task-inbox">
          <div className="flex items-center justify-between">
            <h2>Task Inbox</h2>
            <span>{alerts.length} Alertas</span>
          </div>
          <div className="space-y-2 mt-4">
            {alerts.map((alert, index) => (
              <motion.div
                key={`${alert.title}-${index}`}
                className={`topac-alert-card ${toneClass[alert.tone || 'warning']}`}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + index * 0.05 }}
              >
                <AlertTriangle className="h-4 w-4" />
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.description}</p>
                  <small>Ver tratativas link</small>
                </div>
              </motion.div>
            ))}
          </div>
        </aside>
      </section>

      <section className="topac-detail-grid">
        <div className="topac-glass-card p-5">
          <h2 className="topac-section-title">{leftPanelTitle}</h2>
          {leftPanelItems.length === 0 ? (
            <p className="text-sm text-cyan-100/58">{emptyLeft}</p>
          ) : (
            <ul className="space-y-3">
              {leftPanelItems.map((item) => (
                <li key={`${item.title}-${item.value}`} className="topac-data-row">
                  <div className="min-w-0">
                    <strong>{item.title}</strong>
                    {item.meta && <small>{item.meta}</small>}
                  </div>
                  <span className={item.danger ? 'text-rose-300' : 'text-cyan-200'}>{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="topac-glass-card p-5">
          <h2 className="topac-section-title">{rightPanelTitle}</h2>
          {rightPanelItems.length === 0 ? (
            <p className="text-sm text-cyan-100/58">{emptyRight}</p>
          ) : (
            <ul className="space-y-3">
              {rightPanelItems.map((item) => (
                <li key={`${item.title}-${item.value}`} className="topac-data-row">
                  <div className="min-w-0">
                    <strong>{item.title}</strong>
                    {item.meta && <small>{item.meta}</small>}
                  </div>
                  <span className={item.danger ? 'text-rose-300' : 'text-emerald-200'}>{item.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {dn4Slot && <div className="topac-dn4-panel no-print">{dn4Slot}</div>}
    </div>
  );
};

export default TopacCentralDashboard;
