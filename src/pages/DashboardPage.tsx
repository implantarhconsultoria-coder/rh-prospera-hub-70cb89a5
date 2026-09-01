import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Building2, Bus, Circle, DollarSign, FileCheck, Fuel,
  ListChecks, Lock, Package, Rocket, TrendingDown, TrendingUp,
  Unlock, Users, Wrench, ArrowUpRight,
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
  const [heroImage, setHeroImage] = useState<string>('');
  const isAdmin = userRoles.includes('admin');
  const isDirector = isDirectorRole(userRoles) && !isAdmin;

  useEffect(() => {
    supabase.from('fechamentos_filial').select('status').eq('competencia', comp).then(({ data }) => {
      const arr = (data || []) as any[];
      const fechadas = arr.filter(f => f.status === 'fechado').length;
      const abertas = arr.filter(f => f.status === 'aberto' || f.status === 'reaberto').length;
      setFechStats({ fechadas, abertas, pendentes: Math.max(0, companies.length - fechadas - abertas) });
    });
  }, [comp, companies.length]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([1, 2, 3, 4].map(part => fetch(`/hero/topac-roadwork-${part}.b64`).then(r => r.text())))
      .then(parts => {
        if (!cancelled) setHeroImage(`data:image/jpeg;base64,${parts.join('').replace(/\s/g, '')}`);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

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
  const cardAnim = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

  const metricCards = [
    { label: 'Funcionarios ativos', value: rhVisivel ? totalFuncionarios : 'Restrito', icon: Users, tone: 'yellow' },
    { label: 'Proventos estimados', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalProventos, 0)), icon: TrendingUp, tone: 'violet' },
    { label: 'Descontos estimados', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalDescontos, 0)), icon: TrendingDown, tone: 'yellow' },
    { label: 'Liquido estimado', value: formatCurrency(companyStats.reduce((s, c) => s + c.totalLiquido, 0)), icon: DollarSign, tone: 'violet' },
  ];

  const quickActions = [
    { label: 'Operacional', subtitle: 'Chamados e rotina', icon: FileCheck, path: '/admin/chamados' },
    { label: 'App mecanicos', subtitle: 'Campo e produtividade', icon: Wrench, path: '/admin/app-mecanico' },
    { label: 'Ponto', subtitle: 'Jornada e horas', icon: ListChecks, path: '/admin/fechamento-ponto' },
    { label: 'QR Code', subtitle: 'Abastecimentos', icon: Fuel, path: '/admin/abastecimento-qrcode' },
    { label: 'Almoxarifado', subtitle: 'Estoque e saidas', icon: Package, path: '/admin/almoxarifado' },
    { label: 'VR / VT', subtitle: 'Beneficios e recibos', icon: Bus, path: '/admin/fechamento' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="relative min-h-[290px] overflow-hidden rounded-[26px] border border-violet-500/30 bg-[#09070d] shadow-[0_28px_80px_rgba(0,0,0,.42),0_0_60px_rgba(124,58,237,.08)]">
        {heroImage ? (
          <img src={heroImage} alt="TOPAC Compressores em operacao rodoviaria" className="absolute inset-0 h-full w-full object-cover object-center" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_35%,rgba(124,58,237,.3),transparent_32%),linear-gradient(120deg,#08070b,#15101f_58%,#070608)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/28 to-black/40" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/90 to-transparent" />
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-yellow-300 via-violet-500 to-fuchsia-500" />

        <div className="relative flex min-h-[290px] flex-col justify-between p-7 md:p-8">
          <div className="flex items-start justify-between gap-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/35 bg-black/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-300 backdrop-blur-md">
              <Circle className="h-2 w-2 fill-yellow-300 text-yellow-300" /> Central TOPAC online
            </div>
            <div className="hidden rounded-xl border border-violet-400/25 bg-black/45 px-4 py-2 text-right backdrop-blur-md md:block">
              <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">Competencia atual</div>
              <div className="mt-0.5 text-sm font-black text-white">{comp.split('-').reverse().join('/')}</div>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-300">TOPAC RH PRO</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">{greetingText}</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-300/90">
                {isDirector
                  ? 'Visao executiva consolidada para acompanhamento das empresas, indicadores e relatorios.'
                  : 'RH, fechamento, mecanicos, estoque, frota, beneficios e operacao reunidos em um unico painel.'}
              </p>
            </div>
            {!isDirector && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigate('/admin/app-mecanico')} className="inline-flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2.5 text-xs font-black text-black shadow-[0_0_24px_rgba(253,224,71,.2)] transition hover:-translate-y-0.5 hover:bg-yellow-200">
                  <Rocket className="h-4 w-4" /> App dos mecanicos
                </button>
                <button onClick={() => navigate('/admin/fechamento')} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/15 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-violet-500/25">
                  <ListChecks className="h-4 w-4 text-violet-300" /> Fechamento
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {isDirector && !liberarVisaoRhDiretor && (
        <div className="rounded-2xl border border-yellow-300/25 bg-yellow-300/[0.045] p-4 text-sm text-yellow-100">
          Dados operacionais de RH em tempo real estao ocultos para o perfil Diretor Geral. A liberacao depende do administrador.
        </div>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">Visao geral</p>
            <h2 className="mt-1 text-lg font-black text-white">Indicadores principais</h2>
          </div>
          <span className="text-[10px] text-zinc-600">dados da competencia {comp}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card, i) => {
            const yellow = card.tone === 'yellow';
            return (
              <motion.div
                key={card.label}
                {...cardAnim}
                transition={{ delay: i * 0.04 }}
                className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-[#0b0910] p-5 shadow-[0_14px_40px_rgba(0,0,0,.22)]"
              >
                <div className={yellow ? 'absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/80 to-transparent' : 'absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/90 to-transparent'} />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{card.label}</p>
                    <p className={yellow ? 'mt-2 truncate text-2xl font-black text-yellow-300' : 'mt-2 truncate text-2xl font-black text-violet-300'}>{card.value}</p>
                  </div>
                  <div className={yellow ? 'grid h-10 w-10 place-items-center rounded-xl border border-yellow-300/20 bg-yellow-300/10' : 'grid h-10 w-10 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10'}>
                    <card.icon className={yellow ? 'h-5 w-5 text-yellow-300' : 'h-5 w-5 text-violet-300'} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {!isDirector && (
        <section>
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-yellow-300/75">Acesso rapido</p>
            <h2 className="mt-1 text-lg font-black text-white">Operacao do dia</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {quickActions.map((item, i) => (
              <motion.button
                key={item.label}
                {...cardAnim}
                transition={{ delay: 0.08 + i * 0.035 }}
                onClick={() => navigate(item.path)}
                className="group rounded-2xl border border-violet-500/20 bg-[#0b0910] p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-yellow-300/35 hover:bg-[#0e0b14] hover:shadow-[0_18px_38px_rgba(0,0,0,.28)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300 transition group-hover:border-yellow-300/25 group-hover:bg-yellow-300/10 group-hover:text-yellow-300">
                    <item.icon className="h-[18px] w-[18px]" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-700 transition group-hover:text-yellow-300" />
                </div>
                <div className="mt-4 text-sm font-bold text-zinc-100">{item.label}</div>
                <div className="mt-1 text-[10px] text-zinc-600">{item.subtitle}</div>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {rhVisivel && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: 'Filiais fechadas', value: fechStats.fechadas, icon: Lock, color: 'text-yellow-300', border: 'border-yellow-300/20' },
            { label: 'Em andamento', value: fechStats.abertas, icon: Unlock, color: 'text-violet-300', border: 'border-violet-400/20' },
            { label: 'Pendentes', value: fechStats.pendentes, icon: AlertTriangle, color: 'text-fuchsia-300', border: 'border-fuchsia-400/20' },
          ].map((card, i) => (
            <motion.button
              key={card.label}
              {...cardAnim}
              transition={{ delay: 0.12 + i * 0.04 }}
              onClick={() => navigate('/admin/fechamento')}
              className={`flex items-center justify-between rounded-2xl border ${card.border} bg-[#0b0910] p-5 text-left transition hover:-translate-y-0.5 hover:bg-[#0e0b14]`}
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{card.label}</p>
                <p className={`mt-1 text-3xl font-black ${card.color}`}>{card.value}</p>
                <p className="mt-1 text-[10px] text-zinc-700">Competencia {comp}</p>
              </div>
              <card.icon className={`h-8 w-8 ${card.color} opacity-60`} />
            </motion.button>
          ))}
        </section>
      )}

      {rhVisivel && (
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-400">Empresas</p>
              <h2 className="mt-1 text-lg font-black text-white">Resumo por unidade</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {companyStats.map((cs, i) => (
              <motion.div
                key={cs.company.id}
                {...cardAnim}
                transition={{ delay: 0.16 + i * 0.04 }}
                className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-[#0b0910] p-5 shadow-[0_16px_44px_rgba(0,0,0,.22)]"
              >
                <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-violet-600/10 blur-3xl" />
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-yellow-300/20 bg-yellow-300/10">
                      <Building2 className="h-5 w-5 text-yellow-300" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-white">{cs.company.name}</h3>
                      <p className="mt-0.5 text-[10px] text-zinc-600">{cs.company.cnpj}</p>
                    </div>
                  </div>
                  <button onClick={() => navigate('/admin/fechamento')} className="rounded-lg border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold text-violet-200 transition hover:border-yellow-300/35 hover:text-yellow-300">Abrir</button>
                </div>

                <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
                  ].map(item => (
                    <div key={item.l} className="rounded-xl border border-violet-500/12 bg-white/[0.025] p-3">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-zinc-600">{item.l}</p>
                      <strong className="mt-1 block truncate text-[11px] font-bold text-zinc-200">{item.v}</strong>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default DashboardPage;
