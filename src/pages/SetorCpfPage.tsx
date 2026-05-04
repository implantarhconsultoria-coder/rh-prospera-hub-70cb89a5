import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { LogOut, Users, Package, Cog, Building2, ShieldCheck, Loader2, Search, AlertCircle, CalendarDays, Stethoscope } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CpfSession {
  modulo: string;
  unidade: string;
  link_nome: string;
  usuario: { funcionario_id: string; nome: string; cpf: string; empresa?: string; cargo?: string; setor?: string; company_id?: string };
  ts: number;
}

const SESSION_KEY = 'cpf_session';
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

const ICONS: Record<string, React.ReactNode> = {
  rh:           <Users className="w-5 h-5 text-white" />,
  filial:       <Building2 className="w-5 h-5 text-white" />,
  almoxarifado: <Package className="w-5 h-5 text-white" />,
  mecanicos:    <Cog className="w-5 h-5 text-white" />,
};

const TITULOS: Record<string, string> = {
  rh:           'Portal RH',
  filial:       'Portal Filial',
  almoxarifado: 'Portal Almoxarifado',
  mecanicos:    'Portal Mecânicos',
};

const fmtCpf = (cpf: string) => (cpf || '').replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

const Header: React.FC<{ session: CpfSession; titulo: string; icon: React.ReactNode; onSair: () => void }> = ({ session, titulo, icon, onSair }) => (
  <header className="border-b border-white/10 bg-black/30 backdrop-blur sticky top-0 z-10">
    <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30">
          {icon}
        </div>
        <div>
          <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso por CPF</p>
          <h1 className="text-base font-bold font-display leading-tight">{titulo}</h1>
          <p className="text-[10px] text-white/60 leading-tight">{session.usuario.nome} · {fmtCpf(session.usuario.cpf)}</p>
        </div>
      </div>
      <button onClick={onSair} className="text-xs px-3 py-2 rounded-lg border border-white/15 hover:bg-white/5 flex items-center gap-1.5">
        <LogOut className="w-3.5 h-3.5" /> Sair
      </button>
    </div>
  </header>
);

// ================= PORTAL FILIAL / RH =================
const FilialPortal: React.FC<{ session: CpfSession }> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<any>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('portal_cpf_dados_filial', { p_cpf: session.usuario.cpf, p_modulo: session.modulo === 'rh' ? 'rh' : 'filial' });
      if (error || !(data as any)?.ok) {
        setErro((data as any)?.error || error?.message || 'Falha ao carregar dados');
      } else {
        setDados(data);
      }
      setLoading(false);
    })();
  }, [session]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = (dados?.funcionarios as any[]) || [];
    if (!q) return lista;
    return lista.filter(f => (f.nome || '').toLowerCase().includes(q) || (f.cargo || '').toLowerCase().includes(q) || (f.cpf || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')));
  }, [busca, dados]);

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/60" /></div>;
  if (erro) return <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">{erro}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/50">Funcionários ativos</p>
          <p className="text-2xl font-bold font-display mt-1">{dados.total}</p>
          <p className="text-[10px] text-white/50 mt-0.5">{dados.empresa}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-amber-200">ASO em alerta</p>
          <p className="text-2xl font-bold font-display mt-1 text-amber-200">{dados.aso_alerta}</p>
          <Stethoscope className="w-4 h-4 text-amber-300/60 mt-1" />
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-blue-200">Férias a vencer</p>
          <p className="text-2xl font-bold font-display mt-1 text-blue-200">{dados.ferias_alerta}</p>
          <CalendarDays className="w-4 h-4 text-blue-300/60 mt-1" />
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold">Funcionários da {dados.empresa || 'filial'}</h2>
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
                  <td className="py-2 pr-3 font-mono text-[10px]">{fmtCpf(f.cpf)}</td>
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

// ================= PORTAL ALMOXARIFADO =================
const AlmoxarifadoPortal: React.FC<{ session: CpfSession }> = ({ session }) => {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('portal_cpf_almoxarifado', { p_cpf: session.usuario.cpf });
      if (error || !(data as any)?.ok) {
        setErro((data as any)?.error || error?.message || 'Falha ao carregar estoque');
      } else {
        setItens((data as any).itens || []);
      }
      setLoading(false);
    })();
  }, [session]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(i => (i.nome || '').toLowerCase().includes(q) || (i.codigo_sku || '').toLowerCase().includes(q) || (i.categoria || '').toLowerCase().includes(q));
  }, [busca, itens]);

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/60" /></div>;
  if (erro) return <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">{erro}</div>;

  const semEstoque = itens.filter(i => Number(i.quantidade) <= Number(i.estoque_minimo || 0)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/50">Total de itens</p>
          <p className="text-2xl font-bold font-display mt-1">{itens.length}</p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-rose-200">Itens abaixo do mínimo</p>
          <p className="text-2xl font-bold font-display mt-1 text-rose-200">{semEstoque}</p>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Estoque do almoxarifado</h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-white/40" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item..." className="pl-7 pr-3 py-1.5 text-xs bg-white/10 border border-white/10 rounded-lg w-56 placeholder:text-white/30 focus:outline-none" />
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Categoria</th>
                <th className="py-2 pr-3 font-medium text-right">Qtd</th>
                <th className="py-2 pr-3 font-medium text-right">Mín.</th>
                <th className="py-2 pr-3 font-medium">Local</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i: any) => {
                const baixo = Number(i.quantidade) <= Number(i.estoque_minimo || 0);
                return (
                  <tr key={i.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 pr-3 font-medium">{i.nome}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-white/60">{i.codigo_sku || '—'}</td>
                    <td className="py-2 pr-3 text-white/70">{i.categoria || '—'}</td>
                    <td className={`py-2 pr-3 text-right font-mono ${baixo ? 'text-rose-300 font-bold' : ''}`}>{Number(i.quantidade).toLocaleString('pt-BR')} {i.unidade}</td>
                    <td className="py-2 pr-3 text-right font-mono text-white/40">{Number(i.estoque_minimo || 0).toLocaleString('pt-BR')}</td>
                    <td className="py-2 pr-3 text-white/60">{i.localizacao || '—'}</td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-white/40">Nenhum item encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ================= PORTAL MECÂNICOS =================
const MecanicosPortal: React.FC<{ session: CpfSession }> = ({ session }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('portal_cpf_mecanico_token', { p_cpf: session.usuario.cpf });
      if (error || !(data as any)?.ok) {
        setErro((data as any)?.error || error?.message || 'Falha ao abrir app de mecânicos');
        setLoading(false);
        return;
      }
      const token = (data as any).token;
      navigate(`/operacional/${token}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !erro) return <div className="py-16 flex flex-col items-center gap-3 text-white/70"><Loader2 className="w-6 h-6 animate-spin" /><span className="text-xs">Abrindo app de mecânicos...</span></div>;
  return <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {erro}</div>;
};

// ================= ROOT =================
const SetorCpfPage: React.FC = () => {
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
  if (!session) {
    const slug = modulo === 'filial' ? 'matriz' : modulo;
    return <Navigate to={`/acesso/${slug}`} replace />;
  }

  const sair = () => {
    sessionStorage.removeItem(SESSION_KEY);
    toast.success('Sessão encerrada');
    navigate(`/acesso/${modulo === 'filial' ? 'matriz' : modulo}`, { replace: true });
  };

  const titulo = TITULOS[modulo] || `Portal ${modulo}`;
  const icon = ICONS[modulo] || <ShieldCheck className="w-5 h-5 text-white" />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <Header session={session} titulo={titulo} icon={icon} onSair={sair} />
      <main className="max-w-5xl mx-auto px-4 py-6">
        {(modulo === 'filial' || modulo === 'rh') && <FilialPortal session={session} />}
        {modulo === 'almoxarifado' && <AlmoxarifadoPortal session={session} />}
        {modulo === 'mecanicos' && <MecanicosPortal session={session} />}
        {!['filial','rh','almoxarifado','mecanicos'].includes(modulo) && (
          <div className="text-sm text-white/60 bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
            Portal "{modulo}" não disponível para acesso por CPF. Procure o RH.
          </div>
        )}
      </main>
    </div>
  );
};

export default SetorCpfPage;
