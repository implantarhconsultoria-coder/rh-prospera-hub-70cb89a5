import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { asoStatus, feriasStatus } from '@/lib/calculations';
import {
  Bell, CalendarCheck, CalendarDays, FileCheck, Lock, Send,
  Stethoscope, UploadCloud, User, Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const FilialDashboardPage: React.FC = () => {
  const { employees, companies, session } = useApp();
  const { filialCompanyId } = useFilialFilter();
  const navigate = useNavigate();

  const emps = employees.filter(e => e.companyId === filialCompanyId && e.status === 'ativo');
  const asoAlerta = emps.filter(e => asoStatus(e.dataExameMedico).status !== 'ok').length;
  const feriasAlerta = emps.filter(e => feriasStatus(e.dataAdmissao).status !== 'em dia').length;
  const totalAlertas = asoAlerta + feriasAlerta;

  const company = companies.find(c => c.id === filialCompanyId);
  const branchName = company?.name || 'Filial autorizada';
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || null;
  const userEmail = session?.user?.email || '';

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const greetingText = userName ? `${greeting}, ${userName.split(' ')[0]}` : greeting;

  useEffect(() => {
    if (!filialCompanyId) return;
    const channel = supabase
      .channel(`filial-dashboard-${filialCompanyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcionarios' }, () => undefined)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filialCompanyId]);

  const cards = [
    {
      label: 'Funcionários',
      description: `${emps.length} funcionário(s) ativo(s) da filial`,
      icon: Users,
      path: '/filial/funcionarios',
      value: emps.length,
    },
    {
      label: 'Movimento Diário',
      description: 'Faltas, atrasos, horas extras e ocorrências',
      icon: CalendarDays,
      path: '/filial/movimento-diario',
    },
    {
      label: 'Apontamento',
      description: 'Conferência e apontamentos operacionais da filial',
      icon: Send,
      path: '/filial/apontamento',
    },
    {
      label: 'Fechamento',
      description: 'Consolidar o período e enviar os lançamentos',
      icon: Lock,
      path: '/filial/fechamento',
    },
    {
      label: 'Documentos',
      description: 'Atestados e documentos vinculados à filial',
      icon: UploadCloud,
      path: '/filial/atestados',
    },
    {
      label: 'Aviso de Férias',
      description: feriasAlerta > 0 ? `${feriasAlerta} funcionário(s) exigindo atenção` : 'Programação e avisos de férias',
      icon: CalendarCheck,
      path: '/filial/aviso-ferias',
      value: feriasAlerta || undefined,
      warning: feriasAlerta > 0,
    },
    {
      label: 'ASO / Agendamento',
      description: asoAlerta > 0 ? `${asoAlerta} funcionário(s) exigindo atenção` : 'Controle e agendamento de exames',
      icon: Stethoscope,
      path: '/filial/aso',
      value: asoAlerta || undefined,
      warning: asoAlerta > 0,
    },
    {
      label: 'Protocolos',
      description: 'Protocolos e documentos funcionais',
      icon: FileCheck,
      path: '/filial/protocolo',
    },
    {
      label: 'Alertas',
      description: totalAlertas > 0 ? `${totalAlertas} alerta(s) ativo(s) da filial` : 'Nenhuma pendência ativa',
      icon: Bell,
      path: '/filial/alertas',
      value: totalAlertas || undefined,
      warning: totalAlertas > 0,
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="rounded-xl border border-[#2b2335] bg-[radial-gradient(circle_at_10%_0%,rgba(139,34,255,.18),transparent_38%),#05070b] p-5 shadow-[0_18px_50px_rgba(0,0,0,.24)]">
        <div className="flex items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-violet-500/40 bg-[#0b0b10]">
            <User className="h-5 w-5 text-[#ffc400]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-400">Acesso exclusivo da filial</div>
            <h1 className="mt-1 truncate text-xl font-black text-white">{greetingText}</h1>
            <p className="mt-1 truncate text-sm text-zinc-400">{branchName}</p>
            <p className="mt-1 truncate text-[10px] text-zinc-600">{userEmail}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-sm font-black text-white">Funções da filial</h2>
          <p className="mt-1 text-[11px] text-zinc-500">Cada card abre a função real já autorizada para esta empresa.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.button
                key={card.path}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                onClick={() => navigate(card.path)}
                className={`group min-h-[154px] rounded-[9px] border bg-[#06090d] p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-500/60 hover:bg-[#090b11] ${card.warning ? 'border-amber-500/35' : 'border-[#28232e]'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`grid h-10 w-10 place-items-center rounded-[8px] border ${card.warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-violet-500/25 bg-violet-500/10 text-violet-400'}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  {typeof card.value === 'number' && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${card.warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-[#ffc400]/25 bg-[#ffc400]/10 text-[#ffc400]'}`}>
                      {card.value}
                    </span>
                  )}
                </div>
                <div className="mt-4 text-[13px] font-black text-white">{card.label}</div>
                <div className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">{card.description}</div>
              </motion.button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default FilialDashboardPage;