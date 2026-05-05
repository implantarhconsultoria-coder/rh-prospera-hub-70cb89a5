import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Loader2, LogOut, Building2, DollarSign, FileText, Wrench, Search, AlertCircle, CalendarDays, Stethoscope } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CpfSession {
  modulo: string;
  unidade: string;
  usuario: { id: string; nome: string; cargo: string; empresa: string; cpf: string };
  ts: number;
}

const SESSION_KEY = 'cpf_session_simples';
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

const MODULO_META: Record<string, { label: string; icon: React.ReactNode; cor: string }> = {
  rh_filial:   { label: 'RH da Filial', icon: <Building2 className="w-5 h-5 text-white" />,  cor: 'from-rose-500 to-pink-600' },
  financeiro:  { label: 'Financeiro',   icon: <DollarSign className="w-5 h-5 text-white" />, cor: 'from-cyan-600 to-sky-700' },
  faturamento: { label: 'Faturamento',  icon: <FileText className="w-5 h-5 text-white" />,   cor: 'from-indigo-500 to-violet-600' },
  mecanicos:   { label: 'App Mecânicos',icon: <Wrench className="w-5 h-5 text-white" />,     cor: 'from-amber-500 to-orange-600' },
};

const fmtCpf = (cpf: string) => (cpf || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const slugFromUnidade = (u: string) => (u === 'sp' || u === 'pg' || u === 'go') ? `/${u}` : '/';

const Header: React.FC<{ session: CpfSession; titulo: string; icon: React.ReactNode; cor: string; onSair: () => void }> = ({ session, titulo, icon, cor, onSair }) => (
  <header className="border-b border-white/10 bg-black/30 backdrop-blur sticky top-0 z-10">
    <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cor} flex items-center justify-center shadow-lg`}>{icon}</div>
        <div>
          <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso por CPF · {session.unidade.toUpperCase()}</p>
          <h1 className="text-base font-bold leading-tight">{titulo}</h1>
          <p className="text-[10px] text-white/60 leading-tight">{session.usuario.nome} · {fmtCpf(session.usuario.cpf)} · {session.usuario.empresa}</p>
        </div>
      </div>
      <button onClick={onSair} className="text-xs px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-1.5">
        <LogOut className="w-3.5 h-3.5" /> Sair
      </button>
    </div>
  </header>
);

// ============== PORTAL RH FILIAL ==============
const RhFilialPortal: React.FC<{ session: CpfSession }> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<any>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Busca direta - válida porque já passamos pela validação RPC
      const { data: emp } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('nome', session.usuario.empresa)
        .maybeSingle();
      if (!emp) { setErro('Empresa não localizada'); setLoading(false); return; }

      const { data: funcs, error } = await supabase
        .from('funcionarios')
        .select('id, nome, cpf, cargo, setor, status, celular, email, data_admissao, data_exame_medico')
        .eq('company_id', emp.id)
        .order('nome');
      if (error) { setErro(error.message); setLoading(false); return; }

      const ativos = (funcs || []).filter((f: any) => (f.status || '').toLowerCase() === 'ativo');
      const today = new Date();
      const elevenMonthsAgo = new Date(); elevenMonthsAgo.setMonth(today.getMonth() - 11);
      const aso = ativos.filter((f: any) => !f.data_exame_medico || new Date(f.data_exame_medico) < elevenMonthsAgo).length;
      const ferias = ativos.filter((f: any) => {
        if (!f.data_admissao) return false;
        const adm = new Date(f.data_admissao);
        const dias = Math.floor((today.getTime() - adm.getTime()) / 86400000);
        return dias > 330 && (dias % 365) > 300;
      }).length;

      setDados({ empresa: emp.nome, total: ativos.length, aso_alerta: aso, ferias_alerta: ferias, funcionarios: ativos });
      setLoading(false);
    })();
  }, [session]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = (dados?.funcionarios as any[]) || [];
    if (!q) return lista;
    return lista.filter(f =>
      (f.nome || '').toLowerCase().includes(q) ||
      (f.cargo || '').toLowerCase().includes(q) ||
      (f.cpf || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }, [busca, dados]);

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/60" /></div>;
  if (erro) return <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">{erro}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/50">Funcionários ativos</p>
          <p className="text-2xl font-bold mt-1">{dados.total}</p>
          <p className="text-[10px] text-white/50 mt-0.5">{dados.empresa}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-amber-200">ASO em alerta</p>
          <p className="text-2xl font-bold mt-1 text-amber-200">{dados.aso_alerta}</p>
          <Stethoscope className="w-4 h-4 text-amber-300/60 mt-1" />
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-blue-200">Férias a vencer</p>
          <p className="text-2xl font-bold mt-1 text-blue-200">{dados.ferias_alerta}</p>
          <CalendarDays className="w-4 h-4 text-blue-300/60 mt-1" />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold">Funcionários da {dados.empresa}</h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-white/40" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..." className="pl-7 pr-3 py-1.5 text-xs bg-white/10 border border-white/10 rounded-lg w-48 placeholder:text-white/30 focus:outline-none" />
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">CPF</th>
                <th className="py-2 pr-3 font-medium">Cargo</th>
                <th className="py-2 pr-3 font-medium">Setor</th>
                <th className="py-2 pr-3 font-medium">Contato</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((f: any) => (
                <tr key={f.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 pr-3 font-medium">{f.nome}</td>
                  <td className="py-2 pr-3 font-mono text-[10px]">{fmtCpf(f.cpf || '')}</td>
                  <td className="py-2 pr-3 text-white/80">{f.cargo}</td>
                  <td className="py-2 pr-3 text-white/60">{f.setor || '—'}</td>
                  <td className="py-2 pr-3 text-white/60">{f.celular || f.email || '—'}</td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-white/40">Nenhum funcionário encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============== PORTAL FINANCEIRO / FATURAMENTO (placeholder simples) ==============
const PlaceholderPortal: React.FC<{ titulo: string; descricao: string }> = ({ titulo, descricao }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
    <h2 className="text-lg font-bold mb-2">{titulo}</h2>
    <p className="text-sm text-white/60">{descricao}</p>
    <p className="text-xs text-white/40 mt-4">Use o portal administrativo para gestão completa.</p>
  </div>
);

// ============== PORTAL MECÂNICOS — gera token e redireciona ==============
const MecanicosPortal: React.FC<{ session: CpfSession }> = ({ session }) => {
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('portal_cpf_mecanico_token', { p_cpf: session.usuario.cpf });
      if (error || !(data as any)?.ok) {
        setErro((data as any)?.error || error?.message || 'Falha ao abrir app de mecânicos');
        return;
      }
      const token = (data as any).token;
      navigate(`/operacional/${token}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (erro) return <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {erro}</div>;
  return <div className="py-16 flex flex-col items-center gap-3 text-white/70"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Abrindo app de mecânicos...</span></div>;
};

// ============== ROOT ==============
const PortalCpfSimplesPage: React.FC = () => {
  const { modulo = '' } = useParams<{ modulo: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<CpfSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as CpfSession;
        if (s?.modulo === modulo && Date.now() - (s.ts || 0) < SESSION_MAX_MS) {
          setSession(s);
        }
      }
    } catch { /* noop */ }
    setReady(true);
  }, [modulo]);

  if (!ready) return null;
  if (!session) return <Navigate to="/" replace />;

  const meta = MODULO_META[modulo] || { label: modulo, icon: <Building2 className="w-5 h-5 text-white" />, cor: 'from-primary to-blue-600' };

  const sair = () => {
    sessionStorage.removeItem(SESSION_KEY);
    toast.success('Sessão encerrada');
    navigate(slugFromUnidade(session.unidade), { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <Header session={session} titulo={meta.label} icon={meta.icon} cor={meta.cor} onSair={sair} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {modulo === 'rh_filial'   && <RhFilialPortal session={session} />}
        {modulo === 'financeiro'  && <PlaceholderPortal titulo="Financeiro" descricao={`Portal financeiro da unidade ${session.usuario.empresa}.`} />}
        {modulo === 'faturamento' && <PlaceholderPortal titulo="Faturamento" descricao={`Portal de faturamento da unidade ${session.usuario.empresa}.`} />}
        {modulo === 'mecanicos'   && <MecanicosPortal session={session} />}
        {!['rh_filial','financeiro','faturamento','mecanicos'].includes(modulo) && (
          <div className="text-sm text-white/60 bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            Módulo "{modulo}" não disponível.
          </div>
        )}
      </main>
    </div>
  );
};

export default PortalCpfSimplesPage;
