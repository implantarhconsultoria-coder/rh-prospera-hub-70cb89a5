import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Archive, BarChart3, Building2, Bus, CalendarCheck, CheckCircle2,
  CircleX, FileCheck, FileText, Fuel, Gauge, HardHat, History, ListChecks, Lock,
  Package, Receipt, Shirt, Stethoscope, Target, TrendingUp, Users, Wrench, Clock3,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { feriasStatus } from '@/lib/calculations';
import { supabase } from '@/integrations/supabase/client';
import { isDirectorRole } from '@/lib/directorPermissions';

interface DashboardCounts {
  documents: number;
  signatures: number;
  holerites: number;
  holeritesSigned: number;
  employeeDocuments: number;
  pointRecords: number;
  fuelRecords: number;
  vehiclePoints: number;
  authorizations: number;
  vacationRecords: number;
  epiHistory: number;
  protocols: number;
  asoRecords: number;
}

interface SignatureMonth {
  key: string;
  label: string;
  value: number;
}

const initialCounts: DashboardCounts = {
  documents: 0,
  signatures: 0,
  holerites: 0,
  holeritesSigned: 0,
  employeeDocuments: 0,
  pointRecords: 0,
  fuelRecords: 0,
  vehiclePoints: 0,
  authorizations: 0,
  vacationRecords: 0,
  epiHistory: 0,
  protocols: 0,
  asoRecords: 0,
};

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value || 0);
const formatDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';

const DashboardPage: React.FC = () => {
  const { companies, employees, session, userRoles } = useApp();
  const navigate = useNavigate();
  const now = new Date();
  const comp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [liberarVisaoRhDiretor, setLiberarVisaoRhDiretor] = useState(false);
  const [heroImage, setHeroImage] = useState<string>('');
  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const [closingRows, setClosingRows] = useState<any[]>([]);
  const [vacationRows, setVacationRows] = useState<any[]>([]);
  const [signatureMonths, setSignatureMonths] = useState<SignatureMonth[]>([]);
  const isAdmin = userRoles.includes('admin');
  const isDirector = isDirectorRole(userRoles) && !isAdmin;
  const rhVisivel = !isDirector || liberarVisaoRhDiretor;

  const dbFrom = (table: string) => (supabase.from as any)(table);

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
      .then(({ data }) => setLiberarVisaoRhDiretor(Boolean((data as any)?.liberar_visao_rh_diretor)));
  }, [isDirector, session?.user?.id]);

  useEffect(() => {
    let active = true;

    const countRows = async (table: string, mutate?: (query: any) => any) => {
      let query = dbFrom(table).select('*', { count: 'exact', head: true });
      if (mutate) query = mutate(query);
      const { count } = await query;
      return Number(count || 0);
    };

    const loadDashboard = async () => {
      const monthBase = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthKeys = Array.from({ length: 6 }, (_, index) => {
        const d = new Date(monthBase.getFullYear(), monthBase.getMonth() - (5 - index), 1);
        return {
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
        };
      });
      const signatureStart = `${monthKeys[0].key}-01T00:00:00`;

      const [
        documents,
        signatures,
        holerites,
        holeritesSigned,
        employeeDocuments,
        pointRecords,
        fuelRecords,
        vehiclePoints,
        authorizations,
        vacationRecords,
        epiHistory,
        protocols,
        asoRecords,
        closingResult,
        vacationResult,
        signatureResult,
      ] = await Promise.all([
        countRows('payroll_documents', q => q.eq('is_current', true)),
        countRows('payroll_signatures'),
        countRows('payroll_documents', q => q.eq('is_current', true).eq('competencia', comp).eq('document_type', 'HOLERITE')),
        countRows('payroll_signatures', q => q.eq('competencia', comp).eq('document_type', 'HOLERITE')),
        countRows('documentos_funcionario'),
        countRows('registros_ponto', q => q.eq('registro_teste', false)),
        countRows('abastecimentos', q => q.eq('excluido', false).eq('registro_teste', false)),
        countRows('ponto_veiculo'),
        countRows('abastecimento_autorizacoes'),
        countRows('ferias_avisos'),
        countRows('epi_historico'),
        countRows('protocolos_documentos'),
        countRows('aso_agendamentos'),
        dbFrom('fechamentos_filial')
          .select('company_id,status,conferido_em,encaminhado_contabilidade_em')
          .eq('competencia', comp),
        dbFrom('ferias_avisos')
          .select('id,funcionario_nome,empresa_nome,periodo_gozo_inicio,data_retorno,status')
          .gte('periodo_gozo_inicio', `${comp}-01`)
          .order('periodo_gozo_inicio', { ascending: true })
          .limit(3),
        dbFrom('payroll_signatures')
          .select('signed_at')
          .gte('signed_at', signatureStart),
      ]);

      if (!active) return;

      setCounts({
        documents,
        signatures,
        holerites,
        holeritesSigned,
        employeeDocuments,
        pointRecords,
        fuelRecords,
        vehiclePoints,
        authorizations,
        vacationRecords,
        epiHistory,
        protocols,
        asoRecords,
      });
      setClosingRows(closingResult?.data || []);
      setVacationRows(vacationResult?.data || []);

      const signatureDates = (signatureResult?.data || []) as Array<{ signed_at?: string | null }>;
      const aggregated = monthKeys.map(month => ({
        ...month,
        value: signatureDates.filter(item => item.signed_at?.slice(0, 7) === month.key).length,
      }));
      setSignatureMonths(aggregated);
    };

    loadDashboard().catch(() => undefined);
    return () => { active = false; };
  }, [comp]);

  const totalFuncionarios = employees.filter(e => e.status === 'ativo' && e.categoria === 'operacional').length;
  const admittedThisMonth = employees.filter(e => e.status === 'ativo' && String(e.dataAdmissao || '').slice(0, 7) === comp).length;
  const holeritesPending = Math.max(0, counts.holerites - counts.holeritesSigned);
  const signaturePending = Math.max(0, counts.documents - counts.signatures);
  const signaturePct = counts.documents > 0 ? Math.min(100, Math.round((counts.signatures / counts.documents) * 100)) : 0;
  const pendingPct = Math.max(0, 100 - signaturePct);

  const vacationAlerts = useMemo(() => employees.filter(e => e.status === 'ativo' && feriasStatus(e.dataAdmissao).status !== 'em dia'), [employees]);
  const vacationExpired = vacationAlerts.filter(e => String(feriasStatus(e.dataAdmissao).status).toLowerCase().includes('venc')).length;
  const vacationDue = Math.max(0, vacationAlerts.length - vacationExpired);

  const visibleVacations = useMemo(() => {
    if (vacationRows.length) return vacationRows;
    return vacationAlerts.slice(0, 3).map(employee => ({
      id: employee.id,
      funcionario_nome: employee.name,
      empresa_nome: companies.find(c => c.id === employee.companyId)?.name || 'TOPAC',
      periodo_gozo_inicio: null,
      status: feriasStatus(employee.dataAdmissao).status,
    }));
  }, [vacationRows, vacationAlerts, companies]);

  const monthCompetence = comp.split('-').reverse().join('/');
  const cardAnim = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  const closureMap = useMemo(() => new Map(closingRows.map(row => [row.company_id, row])), [closingRows]);

  const getClosureMeta = (row?: any) => {
    if (!row) return { label: 'Pendente', className: 'text-[#ff3b30]', icon: CircleX };
    const status = String(row.status || '').toLowerCase();
    if (status === 'fechado' || status === 'concluido') return { label: 'Concluído', className: 'text-[#68d82f]', icon: CheckCircle2 };
    return { label: 'Em andamento', className: 'text-[#ffb000]', icon: Clock3 };
  };

  const chart = useMemo(() => {
    const values = signatureMonths.length ? signatureMonths.map(m => m.value) : [0, 0, 0, 0, 0, 0];
    const width = 520;
    const height = 128;
    const left = 18;
    const right = 14;
    const top = 16;
    const bottom = 18;
    const max = Math.max(1, ...values);
    const stepX = (width - left - right) / Math.max(1, values.length - 1);
    const points = values.map((value, index) => ({
      x: left + index * stepX,
      y: top + (1 - value / max) * (height - top - bottom),
      value,
    }));
    let path = points.length ? `M ${points[0].x} ${points[0].y}` : '';
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` C ${midX} ${prev.y}, ${midX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    const area = points.length ? `${path} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z` : '';
    return { width, height, points, path, area, max };
  }, [signatureMonths]);

  const kpis = [
    {
      label: 'FUNCIONÁRIOS ATIVOS',
      value: rhVisivel ? formatNumber(totalFuncionarios) : 'Restrito',
      note: admittedThisMonth > 0 ? `+ ${admittedThisMonth} este mês` : 'Base ativa atual',
      noteClass: 'text-[#39d353]',
      icon: Users,
    },
    {
      label: 'HOLERITES PENDENTES',
      value: rhVisivel ? formatNumber(holeritesPending) : 'Restrito',
      note: `Referência: ${monthCompetence}`,
      noteClass: holeritesPending > 0 ? 'text-[#ffb000]' : 'text-[#39d353]',
      icon: FileText,
    },
    {
      label: 'ASSINATURAS CONCLUÍDAS',
      value: rhVisivel ? formatNumber(counts.signatures) : 'Restrito',
      note: `${signaturePct}% do acervo atual`,
      noteClass: 'text-[#39d353]',
      icon: Receipt,
    },
    {
      label: 'FILIAIS ATIVAS',
      value: formatNumber(companies.length),
      note: 'Total de unidades',
      noteClass: 'text-zinc-500',
      icon: Building2,
    },
  ];

  const historyMetrics = [
    { label: 'PAYROLL', value: counts.documents, icon: Archive },
    { label: 'DOCUMENTOS', value: counts.employeeDocuments, icon: FileText },
    { label: 'FÉRIAS', value: counts.vacationRecords, icon: CalendarCheck },
    { label: 'EPI', value: counts.epiHistory, icon: HardHat },
    { label: 'PROTOCOLOS', value: counts.protocols, icon: FileCheck },
    { label: 'ASO', value: counts.asoRecords, icon: Stethoscope },
  ];

  const mechanicMetrics = [
    { label: 'PONTOS', value: counts.pointRecords, icon: Clock3, hint: 'Registros totais' },
    { label: 'ABASTECIMENTOS', value: counts.fuelRecords, icon: Fuel, hint: 'Operação real' },
    { label: 'KM / VEÍCULO', value: counts.vehiclePoints, icon: Gauge, hint: 'Registros de rota' },
    { label: 'LIBERAÇÕES', value: counts.authorizations, icon: Lock, hint: 'Autorizações' },
  ];

  return (
    <div className="space-y-[10px] pb-2 text-[#f2eef7]">
      <motion.section
        {...cardAnim}
        className="relative h-[182px] overflow-hidden rounded-[10px] border border-[#4b2364] bg-[#05080b] shadow-[0_0_0_1px_rgba(154,43,255,.04),0_18px_50px_rgba(0,0,0,.34)]"
      >
        {heroImage ? (
          <img src={heroImage} alt="TOPAC Compressores em rodovia em obra" className="absolute inset-0 h-full w-full object-cover object-center" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_50%,rgba(26,79,117,.28),transparent_26%),linear-gradient(90deg,#030609,#14100e_60%,#05080b)]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.93)_0%,rgba(0,0,0,.72)_29%,rgba(0,0,0,.18)_58%,rgba(0,0,0,.20)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/65 to-transparent" />
        <div className="relative z-10 flex h-full w-[58%] flex-col justify-center px-9">
          <h1 className="text-[46px] font-black leading-none tracking-[-.04em] text-white">
            TOPAC <span className="text-[#ffb400]">RH PRO</span>
          </h1>
          <p className="mt-3 text-[16px] font-medium text-zinc-200">Painel inteligente de gestão operacional e RH.</p>
          <div className="mt-4 flex items-center gap-3 text-[13px] italic text-zinc-400">
            <span className="text-[30px] font-black leading-none text-[#a82fff]">“</span>
            <span>Dados que conectam <strong className="font-bold text-[#ffb400]">pessoas, processos e resultados.</strong></span>
          </div>
        </div>
      </motion.section>

      {isDirector && !liberarVisaoRhDiretor && (
        <div className="rounded-[8px] border border-[#6a4720] bg-[#1c1308] px-4 py-2 text-[12px] text-[#ffd879]">
          Dados operacionais de RH estão ocultos para o perfil Diretor Geral. A liberação depende do administrador.
        </div>
      )}

      <section className="grid grid-cols-1 gap-[10px] md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((card, index) => (
          <motion.div
            key={card.label}
            {...cardAnim}
            transition={{ delay: index * 0.035 }}
            className="flex h-[104px] items-center gap-4 rounded-[9px] border border-[#3a2148] bg-[#05090d] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,.018)]"
          >
            <div className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full border border-[#6e2699] bg-[radial-gradient(circle,rgba(109,31,167,.22),rgba(18,10,28,.55))] text-[#ad43ff] shadow-[0_0_24px_rgba(132,37,198,.11)]">
              <card.icon className="h-8 w-8" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[11px] font-medium tracking-wide text-zinc-400">{card.label}</div>
              <div className="mt-1 text-[31px] font-black leading-none text-[#ffb400]">{card.value}</div>
              <div className={`mt-2 text-[10px] ${card.noteClass}`}>{card.note}</div>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-[10px] xl:grid-cols-[1.02fr_1.16fr_1.22fr]">
        <div className="rounded-[9px] border border-[#432052] bg-[#05090d] p-[10px]">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-[15px] font-bold text-white"><FileCheck className="h-5 w-5 text-[#ffb400]" /> ASSINATURA DIGITAL</div>
            <button onClick={() => navigate('/admin/folha-pagamento')} className="text-[11px] text-[#b34cff] hover:text-[#d58cff]">Ver todas</button>
          </div>
          <div className="h-[175px] rounded-[7px] border border-[#252b31] bg-[#04080b] p-3">
            <div className="text-[11px] text-zinc-400">Status geral das assinaturas de documentos</div>
            <div className="mt-4 flex items-end justify-between text-[11px]"><span className="text-zinc-300">Pendentes:</span><span className="text-[#b54cff]">{formatNumber(signaturePending)} ({pendingPct}%)</span></div>
            <div className="mt-2 h-3 overflow-hidden rounded bg-[#171b20]"><div className="h-full rounded bg-gradient-to-r from-[#7b24e8] to-[#a52cff]" style={{ width: `${pendingPct}%` }} /></div>
            <div className="mt-4 flex items-end justify-between text-[11px]"><span className="text-zinc-300">Assinados:</span><span className="text-[#b54cff]">{formatNumber(counts.signatures)} ({signaturePct}%)</span></div>
            <div className="mt-2 h-3 overflow-hidden rounded bg-[#171b20]"><div className="h-full rounded bg-gradient-to-r from-[#7b24e8] via-[#8f2cff] to-[#ab39ff]" style={{ width: `${signaturePct}%` }} /></div>
            <div className="mt-3 flex items-center justify-between border-t border-[#1f252b] pt-2 text-[10px] text-zinc-500"><span>Total de documentos</span><strong className="font-medium text-zinc-300">{formatNumber(counts.documents)}</strong></div>
          </div>
        </div>

        <div className="rounded-[9px] border border-[#432052] bg-[#05090d] p-[10px]">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-[15px] font-bold text-white"><CalendarCheck className="h-5 w-5 text-[#ffb400]" /> FECHAMENTO DO MÊS</div>
            <button onClick={() => navigate('/admin/fechamento')} className="text-[11px] text-[#b34cff] hover:text-[#d58cff]">Ver detalhes</button>
          </div>
          <div className="h-[175px] overflow-hidden rounded-[7px] border border-[#252b31] bg-[#04080b]">
            <div className="grid grid-cols-[1.45fr_.65fr_.72fr_.85fr_.95fr] border-b border-[#1d2328] px-3 py-2 text-[9px] uppercase tracking-wide text-zinc-500">
              <span>Empresa</span><span className="text-center">Folha</span><span className="text-center">Encargos</span><span className="text-center">Contab.</span><span className="text-right">Status</span>
            </div>
            {companies.slice(0, 5).map(company => {
              const row = closureMap.get(company.id);
              const meta = getClosureMeta(row);
              const MetaIcon = meta.icon;
              const folhaOk = Boolean(row);
              const encargosOk = Boolean(row?.conferido_em);
              const contabOk = Boolean(row?.encaminhado_contabilidade_em);
              return (
                <div key={company.id} className="grid h-[27px] grid-cols-[1.45fr_.65fr_.72fr_.85fr_.95fr] items-center border-b border-[#151a1e] px-3 text-[10px] last:border-0">
                  <span className="truncate text-zinc-300">{company.name.replace('TOPAC FILIAL ', '').replace('TOPAC ', '')}</span>
                  <span className="grid place-items-center">{folhaOk ? <CheckCircle2 className="h-3.5 w-3.5 text-[#65cf28]" /> : <CircleX className="h-3.5 w-3.5 text-[#ff3b30]" />}</span>
                  <span className="grid place-items-center">{encargosOk ? <CheckCircle2 className="h-3.5 w-3.5 text-[#65cf28]" /> : row ? <Clock3 className="h-3.5 w-3.5 text-[#ffb000]" /> : <CircleX className="h-3.5 w-3.5 text-[#ff3b30]" />}</span>
                  <span className="grid place-items-center">{contabOk ? <CheckCircle2 className="h-3.5 w-3.5 text-[#65cf28]" /> : row ? <Clock3 className="h-3.5 w-3.5 text-[#ffb000]" /> : <CircleX className="h-3.5 w-3.5 text-[#ff3b30]" />}</span>
                  <span className={`truncate text-right ${meta.className}`}><span className="inline-flex items-center gap-1"><MetaIcon className="h-3 w-3" />{meta.label}</span></span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[9px] border border-[#432052] bg-[#05090d] p-[10px]">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-[15px] font-bold text-white"><AlertTriangle className="h-5 w-5 text-[#ffb400]" /> FÉRIAS E ALERTAS</div>
            <button onClick={() => navigate('/admin/aviso-ferias')} className="text-[11px] text-[#b34cff] hover:text-[#d58cff]">Ver todas</button>
          </div>
          <div className="grid h-[175px] grid-cols-[1.5fr_.8fr] gap-2">
            <div className="rounded-[7px] border border-[#252b31] bg-[#04080b] p-3">
              <div className="mb-2 text-[10px] text-zinc-500">Próximas férias</div>
              <div className="space-y-2">
                {visibleVacations.slice(0, 3).map((item: any) => (
                  <div key={item.id || item.funcionario_nome} className="flex items-center gap-2 border-b border-[#161b1f] pb-2 last:border-0 last:pb-0">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#314033] bg-[#0c1710] text-[10px] font-black text-[#74d23d]">{String(item.funcionario_nome || '?').charAt(0)}</div>
                    <div className="min-w-0 flex-1"><div className="truncate text-[10px] text-zinc-200">{item.funcionario_nome}</div><div className="truncate text-[8px] text-zinc-600">{item.empresa_nome}</div></div>
                    <div className="text-[9px] text-zinc-400">{formatDate(item.periodo_gozo_inicio)}</div>
                  </div>
                ))}
                {visibleVacations.length === 0 && <div className="py-8 text-center text-[10px] text-zinc-600">Nenhuma programação futura registrada.</div>}
              </div>
            </div>
            <div className="rounded-[7px] border border-[#252b31] bg-[#04080b] p-3">
              <div className="mb-2 text-[10px] text-zinc-500">Indicadores</div>
              <div className="rounded-[7px] border border-[#222a30] bg-[#070b0e] px-3 py-3">
                <div className="flex items-center gap-3"><CalendarCheck className="h-7 w-7 text-[#ffb400]" /><div><div className="text-[27px] font-black leading-none text-[#ffb400]">{String(vacationDue).padStart(2, '0')}</div><div className="mt-1 text-[8px] text-zinc-500">A VENCER</div></div></div>
              </div>
              <div className="mt-2 rounded-[7px] border border-[#2a2223] bg-[#0d090a] px-3 py-3">
                <div className="flex items-center gap-3"><CalendarCheck className="h-7 w-7 text-[#ff3b30]" /><div><div className="text-[27px] font-black leading-none text-[#ff3b30]">{String(vacationExpired).padStart(2, '0')}</div><div className="mt-1 text-[8px] text-zinc-500">VENCIDAS</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-[10px] xl:grid-cols-[1fr_1.22fr_1.35fr]">
        <div className="rounded-[9px] border border-[#432052] bg-[#05090d] p-[10px]">
          <div className="mb-2 flex items-center justify-between px-1"><div className="flex items-center gap-2 text-[15px] font-bold text-white"><Wrench className="h-5 w-5 text-[#ffb400]" /> APP MECÂNICO</div><button onClick={() => navigate('/admin/app-mecanico')} className="text-[11px] text-[#b34cff]">Acessar aplicativo</button></div>
          <div className="grid h-[130px] grid-cols-4 gap-2">
            {mechanicMetrics.map(metric => (
              <button key={metric.label} onClick={() => navigate('/admin/app-mecanico')} className="rounded-[7px] border border-[#242a30] bg-[#04080b] px-2 py-3 text-center transition hover:border-[#6d2a8d]">
                <metric.icon className="mx-auto h-6 w-6 text-[#a33cff]" strokeWidth={1.6} />
                <div className="mt-2 text-[8px] text-zinc-500">{metric.label}</div>
                <div className="mt-1 text-[18px] font-black text-[#ffb400]">{formatNumber(metric.value)}</div>
                <div className="mt-1 truncate text-[7px] text-zinc-600">{metric.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[9px] border border-[#432052] bg-[#05090d] p-[10px]">
          <div className="mb-2 flex items-center justify-between px-1"><div className="flex items-center gap-2 text-[15px] font-bold text-white"><History className="h-5 w-5 text-[#ffb400]" /> HISTÓRICO DOCUMENTAL</div><button onClick={() => navigate('/admin/historico')} className="text-[11px] text-[#b34cff]">Acessar arquivos</button></div>
          <div className="grid h-[130px] grid-cols-3 gap-2">
            {historyMetrics.map(metric => (
              <button key={metric.label} onClick={() => navigate('/admin/historico')} className="flex items-center gap-2 rounded-[7px] border border-[#242a30] bg-[#04080b] px-3 text-left transition hover:border-[#6d2a8d]">
                <metric.icon className="h-5 w-5 shrink-0 text-[#a33cff]" strokeWidth={1.6} />
                <div className="min-w-0"><div className="truncate text-[8px] text-zinc-500">{metric.label}</div><div className="mt-1 text-[15px] font-black text-[#ffb400]">{formatNumber(metric.value)}</div></div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[9px] border border-[#432052] bg-[#05090d] p-[10px]">
          <div className="mb-1 flex items-center justify-between px-1"><div className="flex items-center gap-2 text-[15px] font-bold text-white"><TrendingUp className="h-5 w-5 text-[#ffb400]" /> EVOLUÇÃO DE ASSINATURAS</div><span className="rounded border border-[#252b31] px-2 py-1 text-[9px] text-zinc-500">Últimos 6 meses</span></div>
          <div className="relative h-[135px] overflow-hidden rounded-[7px] border border-[#242a30] bg-[#04080b] px-2 pt-1">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="h-[108px] w-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="topacSignatureArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b2cff" stopOpacity="0.42" /><stop offset="100%" stopColor="#8b2cff" stopOpacity="0.02" /></linearGradient>
                <filter id="topacGlow"><feGaussianBlur stdDeviation="2.2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              </defs>
              {[24, 52, 80, 108].map(y => <line key={y} x1="12" y1={y} x2="508" y2={y} stroke="#1c242a" strokeWidth="1" />)}
              {chart.area && <path d={chart.area} fill="url(#topacSignatureArea)" />}
              {chart.path && <path d={chart.path} fill="none" stroke="#9941ff" strokeWidth="2.4" filter="url(#topacGlow)" />}
              {chart.points.map((point, index) => (
                <g key={index}>
                  <circle cx={point.x} cy={point.y} r="4.4" fill="#7d27df" stroke="#d2adff" strokeWidth="1.5" />
                  <text x={point.x} y={Math.max(10, point.y - 8)} textAnchor="middle" fill="#f4eef9" fontSize="9" fontWeight="700">{point.value}</text>
                </g>
              ))}
            </svg>
            <div className="grid grid-cols-6 px-2 text-center text-[8px] text-zinc-500">
              {(signatureMonths.length ? signatureMonths : Array.from({ length: 6 }, (_, i) => ({ label: `M${i + 1}` }))).map((month: any, index) => <span key={`${month.label}-${index}`}>{month.label}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="relative h-[154px] overflow-hidden rounded-[9px] border border-[#482056] bg-[#05090d]">
        {heroImage && <img src={heroImage} alt="Operação TOPAC" className="absolute inset-0 h-full w-full object-cover object-[center_62%] opacity-55" />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,9,.98)_0%,rgba(2,6,9,.92)_50%,rgba(2,6,9,.20)_100%)]" />
        <div className="relative z-10 p-4">
          <div className="flex items-center gap-2 text-[16px] font-bold text-white"><span className="text-[24px]">🔥</span> PAINEL MOTIVADOR</div>
          <div className="mt-3 grid max-w-[850px] grid-cols-3 divide-x divide-[#4b3a25]">
            <div className="flex items-center gap-4 pr-6"><Gauge className="h-12 w-12 shrink-0 text-[#ffb400]" strokeWidth={1.8} /><div><div className="text-[13px] font-bold text-[#ffb400]">DISCIPLINA HOJE</div><div className="mt-1 text-[11px] leading-relaxed text-zinc-400">Foco e consistência na alta performance.</div></div></div>
            <div className="flex items-center gap-4 px-6"><BarChart3 className="h-12 w-12 shrink-0 text-[#ffb400]" strokeWidth={1.8} /><div><div className="text-[13px] font-bold text-[#ffb400]">PATRIMÔNIO AMANHÃ</div><div className="mt-1 text-[11px] leading-relaxed text-zinc-400">Construímos valor com processos bem executados.</div></div></div>
            <div className="flex items-center gap-4 pl-6"><Target className="h-12 w-12 shrink-0 text-[#ffb400]" strokeWidth={1.8} /><div><div className="text-[13px] font-bold text-[#ffb400]">ORGANIZAÇÃO SEMPRE</div><div className="mt-1 text-[11px] leading-relaxed text-zinc-400">Resultados que permanecem e geram confiança.</div></div></div>
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-3 py-2 text-[10px] text-zinc-600"><span className="h-px w-28 bg-gradient-to-r from-transparent to-[#482056]" /><span><strong className="font-semibold text-[#a33cff]">TOPAC</strong> <strong className="font-semibold text-[#ffb400]">RH PRO</strong> • Plataforma interna de gestão</span><span className="h-px w-28 bg-gradient-to-l from-transparent to-[#482056]" /></footer>
    </div>
  );
};

export default DashboardPage;
