import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { useFilialFilter } from '@/hooks/useFilialFilter';
import { asoStatus, feriasStatus } from '@/lib/calculations';
import {
  Bell, CalendarCheck, CalendarDays, FileCheck, Send,
  Stethoscope, UploadCloud, Users, Building2, UserRound,
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
  const userName =
    session?.user?.user_metadata?.nome_completo ||
    session?.user?.user_metadata?.full_name ||
    'Responsável da filial';
  const userEmail = session?.user?.email || '';

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = String(userName).split(' ')[0];

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
      description: 'Cadastro e gestão da equipe da filial',
      icon: Users,
      path: '/filial/funcionarios',
      value: emps.length,
    },
    {
      label: 'Movimento Diário',
      description: 'Faltas, atrasos, extras e ocorrências',
      icon: CalendarDays,
      path: '/filial/movimento-diario',
    },
    {
      label: 'Apontamento / Fechamento',
      description: 'Fechamento mensal e envio para a central',
      icon: Send,
      path: '/filial/fechamento',
    },
    {
      label: 'Documentos',
      description: 'Atestados e documentos da filial',
      icon: UploadCloud,
      path: '/filial/atestados',
    },
    {
      label: 'Aviso de Férias',
      description: feriasAlerta > 0 ? `${feriasAlerta} pendência(s) para atenção` : 'Programação e avisos de férias',
      icon: CalendarCheck,
      path: '/filial/aviso-ferias',
      value: feriasAlerta || undefined,
      warning: feriasAlerta > 0,
    },
    {
      label: 'ASO / Agendamento',
      description: asoAlerta > 0 ? `${asoAlerta} pendência(s) para atenção` : 'Controle e agendamento de exames',
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
      description: totalAlertas > 0 ? `${totalAlertas} alerta(s) ativo(s)` : 'Nenhuma pendência ativa',
      icon: Bell,
      path: '/filial/alertas',
      value: totalAlertas || undefined,
      warning: totalAlertas > 0,
    },
  ];

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-[10px] pb-3 text-[#f2eef7]">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative h-[182px] overflow-hidden rounded-[10px] border border-[#4b2364] bg-[#05080b] shadow-[0_0_0_1px_rgba(154,43,255,.04),0_18px_50px_rgba(0,0,0,.34)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(168,47,255,.22),transparent_28%),radial-gradient(circle_at_64%_80%,rgba(255,180,0,.10),transparent_22%),linear-gradient(115deg,#030609_0%,#09070d_52%,#100a18_100%)]" />
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full border border-violet-500/15" />
        <div className="absolute right-10 top-10 h-36 w-36 rounded-full border border-[#ffb400]/10" />

        <div className="relative z-10 flex h-full items-center justify-between gap-8 px-8">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.20em] text-[#a82fff]">
              <Building2 className="h-4 w-4 text-[#ffb400]" />
              Portal da Filial
            </div>
            <h1 className="text-[38px] font-black leading-none tracking-[-.035em] text-white">
              TOPAC <span className="text-[#ffb400]">RH PRO</span>
            </h1>
            <p className="mt-3 text-[15px] font-semibold text-zinc-200">{branchName}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Gestão operacional e RH da unidade</p>
          </div>

          <div className="hidden min-w-[280px] rounded-[9px] border border-[#32243f] bg-black/35 p-4 lg:block">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-violet-500/30 bg-violet-500/10">
                <UserRound className="h-5 w-5 text-[#ffb400]" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-black uppercase tracking-[.16em] text-violet-400">Acesso autorizado</div>
                <div className="mt-1 truncate text-[13px] font-black text-white">{greeting}, {firstName}</div>
                <div className="mt-0.5 truncate text-[10px] text-zinc-500">{userEmail}</div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="rounded-[10px] border border-[#28232e] bg-[#05080b] p-4 shadow-[0_12px_35px_rgba(0,0,0,.22)]">
        <div className="mb-3 flex items-end justify-between gap-4 border-b border-white/[0.05] pb-3">
          <div>
            <h2 className="text-[13px] font-black uppercase tracking-[.08em] text-white">Funções da filial</h2>
            <p className="mt-1 text-[10px] text-zinc-500">Acesso liberado conforme o perfil e a unidade responsável.</p>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-[9px] uppercase tracking-[.14em] text-zinc-600">Equipe ativa</div>
            <div className="mt-0.5 text-[18px] font-black text-[#ffb400]">{emps.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.button
                key={card.path}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025 }}
                onClick={() => navigate(card.path)}
                className={`group relative min-h-[118px] overflow-hidden rounded-[8px] border bg-[#080b10] p-4 text-left transition-all duration-200 hover:-translate-y-[1px] hover:border-[#6f2f91] hover:bg-[#0b0e14] hover:shadow-[0_10px_28px_rgba(0,0,0,.30)] ${card.warning ? 'border-[#6a4720]' : 'border-[#28232e]'}`}
              >
                <span className="absolute inset-y-0 left-0 w-[2px] bg-transparent transition group-hover:bg-[#a82fff]" />
                <div className="flex items-start justify-between gap-3">
                  <div className={`grid h-9 w-9 place-items-center rounded-[7px] border ${card.warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-violet-500/25 bg-violet-500/10 text-violet-400'}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  {typeof card.value === 'number' && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${card.warning ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-[#ffb400]/25 bg-[#ffb400]/10 text-[#ffb400]'}`}>
                      {card.value}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[12px] font-black text-white">{card.label}</div>
                <div className="mt-1 text-[10px] leading-[1.45] text-zinc-500">{card.description}</div>
              </motion.button>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default FilialDashboardPage;
