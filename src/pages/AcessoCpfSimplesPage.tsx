import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, Building2, MapPin, DollarSign, FileText, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const formatCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

const UNIDADE_META: Record<string, { titulo: string; cor: string; icon: React.ReactNode }> = {
  sp: { titulo: 'São Paulo',     cor: 'from-primary to-blue-600',     icon: <Building2 className="w-5 h-5 text-white" /> },
  pg: { titulo: 'Praia Grande',  cor: 'from-cyan-600 to-blue-700',    icon: <MapPin className="w-5 h-5 text-white" /> },
  go: { titulo: 'Goiânia',       cor: 'from-emerald-600 to-teal-700', icon: <MapPin className="w-5 h-5 text-white" /> },
};

const MODULO_META: Record<string, { label: string; icon: React.ReactNode; cor: string; rota: string }> = {
  financeiro:  { label: 'Financeiro',     icon: <DollarSign className="w-5 h-5 text-white" />, cor: 'from-cyan-600 to-sky-700',      rota: '/financeiro' },
  faturamento: { label: 'Faturamento',    icon: <FileText className="w-5 h-5 text-white" />,   cor: 'from-indigo-500 to-violet-600', rota: '/faturamento' },
  mecanicos:   { label: 'App Mecânicos',  icon: <Wrench className="w-5 h-5 text-white" />,     cor: 'from-amber-500 to-orange-600',  rota: '/app-mecanicos' },
};

const ERRO_LABEL: Record<string, string> = {
  cpf_invalido:           'Informe os 11 dígitos do CPF.',
  cpf_nao_localizado:     'CPF não localizado.',
  acesso_nao_autorizado:  'Acesso não autorizado.',
  unidade_incorreta:      'Você não tem acesso a esta unidade.',
  sem_permissao:          'Você não possui módulos liberados. Procure o RH.',
  link_invalido:          'Link inválido.',
  db_error:               'Falha temporária. Tente novamente.',
};

type Resp = {
  ok: boolean;
  error?: string;
  unidade?: string;
  modulos?: string[];
  usuario?: { id: string; nome: string; cargo: string; empresa: string; cpf: string };
};

const AcessoCpfSimplesPage: React.FC = () => {
  const { unidade: paramUnidade } = useParams<{ unidade: string }>();
  const unidade = (paramUnidade || (typeof window !== 'undefined' ? window.location.pathname.replace('/', '') : '')).toLowerCase();
  const navigate = useNavigate();
  const meta = UNIDADE_META[unidade] || { titulo: 'Acesso', cor: 'from-primary to-blue-600', icon: <Building2 className="w-5 h-5 text-white" /> };

  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resp, setResp] = useState<Resp | null>(null);

  const entrar = (modulo: string, r: Resp) => {
    try {
      sessionStorage.setItem('cpf_session_simples', JSON.stringify({
        modulo, unidade: r.unidade, usuario: r.usuario, ts: Date.now(),
      }));
    } catch { /* noop */ }
    const m = MODULO_META[modulo];
    if (m) navigate(m.rota, { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null); setResp(null);
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) { setErro(ERRO_LABEL.cpf_invalido); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('acesso_cpf_simples', { p_unidade: unidade, p_cpf: digits });
      if (error) { setErro(ERRO_LABEL.db_error); setLoading(false); return; }
      const r = (data as Resp) || { ok: false, error: 'db_error' };
      if (!r.ok) {
        setErro(ERRO_LABEL[r.error || 'db_error'] || 'Acesso negado.');
        setLoading(false);
        return;
      }
      const mods = (r.modulos || []).filter(m => MODULO_META[m]);
      if (mods.length === 0) { setErro(ERRO_LABEL.sem_permissao); setLoading(false); return; }
      if (mods.length === 1) { entrar(mods[0], r); return; }
      setResp(r); setLoading(false);
    } catch {
      setErro(ERRO_LABEL.db_error); setLoading(false);
    }
  };

  if (resp?.ok && (resp.modulos?.length || 0) > 1) {
    const lista = (resp.modulos || []).filter(m => MODULO_META[m]);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-white">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.cor} flex items-center justify-center shadow-lg`}>
              {meta.icon}
            </div>
            <div>
              <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">{meta.titulo}</p>
              <h1 className="text-lg font-bold leading-tight">{resp.usuario?.nome}</h1>
              <p className="text-[11px] text-white/60">{resp.usuario?.empresa}</p>
            </div>
          </div>
          <p className="text-xs text-white/60 mb-3">Escolha o módulo para entrar:</p>
          <div className="grid gap-2">
            {lista.map(m => {
              const md = MODULO_META[m];
              return (
                <button
                  key={m}
                  onClick={() => entrar(m, resp)}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${md.cor} hover:opacity-90 text-white text-left shadow-lg transition-opacity`}
                >
                  <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">{md.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold text-sm">{md.label}</div>
                    <div className="text-[10px] text-white/70">Entrar</div>
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={() => { setResp(null); setCpf(''); }} className="w-full mt-4 text-xs text-white/50 hover:text-white/80">
            Sair / trocar CPF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-white">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.cor} flex items-center justify-center shadow-lg`}>
            {meta.icon}
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso · {unidade.toUpperCase()}</p>
            <h1 className="text-lg font-bold leading-tight">Topac · {meta.titulo}</h1>
            <p className="text-[11px] text-white/60 leading-tight">Entrar com CPF</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={(e) => setCpf(formatCpf(e.target.value))}
            placeholder="000.000.000-00"
            className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {erro && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-gradient-to-r ${meta.cor} hover:opacity-90 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg transition-opacity flex items-center justify-center gap-2`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Entrar
          </button>
        </form>
        <p className="text-center text-[10px] text-white/30 mt-5">
          Topac · acesso por CPF
        </p>
      </div>
    </div>
  );
};

export default AcessoCpfSimplesPage;
