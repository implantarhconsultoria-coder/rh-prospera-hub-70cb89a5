import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, Wrench, DollarSign, FileText, Users, Package, Cog, Building2, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const formatCpf = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
};

// Slug curto -> rótulo da região
const REGION_LABEL: Record<string, { titulo: string; subtitulo: string; cor: string; icon: React.ReactNode }> = {
  sp: { titulo: 'Topac · São Paulo',     subtitulo: 'Acesso por CPF',  cor: 'from-primary to-blue-600',     icon: <Building2 className="w-5 h-5 text-white" /> },
  pg: { titulo: 'Topac · Praia Grande',  subtitulo: 'Acesso por CPF',  cor: 'from-cyan-600 to-blue-700',    icon: <MapPin className="w-5 h-5 text-white" /> },
  go: { titulo: 'Topac · Goiânia',       subtitulo: 'Acesso por CPF',  cor: 'from-emerald-600 to-teal-700', icon: <MapPin className="w-5 h-5 text-white" /> },
};

// Metadados de cada módulo (rótulo, ícone, destino, cor)
const MODULO_META: Record<string, { label: string; icon: React.ReactNode; cor: string; destino: (filialQS: string) => string }> = {
  operacional:   { label: 'App Operacional',  icon: <Wrench className="w-5 h-5 text-white" />,    cor: 'from-primary to-blue-600',     destino: (qs) => `/setor-cpf/mecanicos${qs}` },
  mecanicos:     { label: 'App Mecânicos',    icon: <Cog className="w-5 h-5 text-white" />,       cor: 'from-slate-500 to-zinc-700',   destino: (qs) => `/setor-cpf/mecanicos${qs}` },
  financeiro:    { label: 'Financeiro',       icon: <DollarSign className="w-5 h-5 text-white" />,cor: 'from-cyan-600 to-sky-700',     destino: (qs) => `/financeiro-cpf${qs}` },
  faturamento:   { label: 'Faturamento',      icon: <FileText className="w-5 h-5 text-white" />,  cor: 'from-indigo-500 to-violet-600',destino: (qs) => `/faturamento-cpf${qs}` },
  rh:            { label: 'RH',               icon: <Users className="w-5 h-5 text-white" />,     cor: 'from-rose-500 to-pink-600',    destino: (qs) => `/setor-cpf/rh${qs}` },
  almoxarifado:  { label: 'Almoxarifado',     icon: <Package className="w-5 h-5 text-white" />,   cor: 'from-amber-500 to-orange-600', destino: (qs) => `/setor-cpf/almoxarifado${qs}` },
  documentos_rh: { label: 'Documentos RH',    icon: <FileText className="w-5 h-5 text-white" />,  cor: 'from-fuchsia-500 to-rose-600', destino: (qs) => `/setor-cpf/documentos-rh${qs}` },
  filial:        { label: 'Painel da Filial', icon: <Building2 className="w-5 h-5 text-white" />, cor: 'from-indigo-600 to-blue-700',  destino: (qs) => `/setor-cpf/filial${qs}` },
  abastecimento: { label: 'Abastecimento',    icon: <Wrench className="w-5 h-5 text-white" />,    cor: 'from-amber-500 to-orange-600', destino: (qs) => `/setor-cpf/almoxarifado${qs}` },
};

const ERRO_LABEL: Record<string, string> = {
  cpf_invalido:                'CPF inválido. Confira os 11 dígitos.',
  cpf_nao_encontrado:          'CPF não encontrado.',
  sem_permissao_modulo:        'Este CPF não tem nenhum módulo liberado. Procure o RH.',
  acesso_bloqueado:            'Acesso bloqueado.',
  acesso_bloqueado_admin:      'Seu acesso foi bloqueado pelo administrador.',
  link_invalido:               'Link inválido. Use o link correto.',
  db_error:                    'Falha temporária. Tente novamente.',
  internal:                    'Falha temporária. Tente novamente.',
};

type ModuloItem = { modulo: string; status?: string };
type AcessoCpfResponse = {
  ok?: boolean;
  error?: string;
  slug?: string;
  unidade?: string;
  modulos?: ModuloItem[];
  tecnico_token?: string | null;
  usuario?: {
    funcionario_id: string;
    cpf: string;
    nome: string;
    empresa?: string;
    cargo?: string;
    setor?: string;
    company_id?: string | null;
  };
};

const AcessoModuloCpfPage: React.FC = () => {
  const { slug: rawSlug = '' } = useParams<{ slug: string }>();
  // Rotas curtas (/sp, /pg, /go) não têm :slug — derivar do pathname
  const slug = (rawSlug || (typeof window !== 'undefined' ? window.location.pathname.replace('/', '') : '')).toLowerCase();
  const navigate = useNavigate();
  const meta = REGION_LABEL[slug] || { titulo: 'Acesso por CPF', subtitulo: '', cor: 'from-primary to-blue-600', icon: <Wrench className="w-5 h-5 text-white" /> };

  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<AcessoCpfResponse | null>(null);

  useEffect(() => { setErro(null); setResposta(null); }, [slug]);

  const filialQS = slug === 'sp' ? '?filial=sp' : slug === 'pg' ? '?filial=praia_grande' : slug === 'go' ? '?filial=goiania' : '';

  const navegarParaModulo = (modulo: string, data: AcessoCpfResponse) => {
    // Salva sessão isolada por CPF até 23:59:59 do dia
    const now = new Date();
    const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const expiresAt = fim.getTime();
    try {
      sessionStorage.setItem('cpf_session', JSON.stringify({
        modulo, area: modulo, filial: filialQS.replace('?filial=', '') || null,
        unidade: data.unidade, link_nome: meta.titulo, usuario: data.usuario,
        ts: Date.now(), expiresAt,
      }));
    } catch { /* noop */ }

    // Operacional/mecanicos: usa token do técnico se existir
    if ((modulo === 'operacional' || modulo === 'mecanicos') && data.tecnico_token) {
      const dest = `/operacional/${data.tecnico_token}`;
      try { localStorage.setItem(`cpf_device_session_${slug}_${modulo}`, JSON.stringify({ expiresAt, redirect: dest })); } catch { /* noop */ }
      navigate(dest, { replace: true });
      return;
    }

    const m = MODULO_META[modulo];
    const dest = m ? m.destino(filialQS) : `/setor-cpf/${modulo}${filialQS}`;
    try { localStorage.setItem(`cpf_device_session_${slug}_${modulo}`, JSON.stringify({ expiresAt, redirect: dest })); } catch { /* noop */ }
    navigate(dest, { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setResposta(null);
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) { setErro(ERRO_LABEL.cpf_invalido); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('validar_acesso_cpf_slug', { p_slug: slug, p_cpf: digits });
      if (error) { setErro(ERRO_LABEL.db_error); setLoading(false); return; }
      const resp = (data as AcessoCpfResponse) || { ok: false, error: 'db_error' };

      if (!resp.ok) {
        setErro(ERRO_LABEL[resp.error || 'db_error'] || `Acesso negado (${resp.error}).`);
        setLoading(false);
        return;
      }

      const lista = (resp.modulos || []).filter(m => MODULO_META[m.modulo]);

      if (lista.length === 0) {
        setErro(ERRO_LABEL.sem_permissao_modulo);
        setLoading(false);
        return;
      }

      if (lista.length === 1) {
        navegarParaModulo(lista[0].modulo, resp);
        return;
      }

      // Múltiplos módulos: deixa o usuário escolher
      setResposta(resp);
      setLoading(false);
    } catch {
      setErro(ERRO_LABEL.db_error);
      setLoading(false);
    }
  };

  // Tela de seleção de módulo
  if (resposta?.ok && (resposta.modulos?.length || 0) > 1) {
    const lista = (resposta.modulos || []).filter(m => MODULO_META[m.modulo]);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-white">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.cor} flex items-center justify-center shadow-lg`}>
              {meta.icon}
            </div>
            <div>
              <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">{meta.titulo}</p>
              <h1 className="text-lg font-bold leading-tight">{resposta.usuario?.nome || 'Funcionário'}</h1>
              <p className="text-[11px] text-white/60">{resposta.usuario?.empresa}</p>
            </div>
          </div>
          <p className="text-xs text-white/60 mb-3">Você tem acesso a mais de um módulo. Escolha onde deseja entrar:</p>
          <div className="grid gap-2">
            {lista.map(m => {
              const md = MODULO_META[m.modulo];
              return (
                <button
                  key={m.modulo}
                  onClick={() => navegarParaModulo(m.modulo, resposta)}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${md.cor} hover:opacity-90 text-white text-left shadow-lg transition-opacity`}
                >
                  <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center">{md.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold text-sm">{md.label}</div>
                    <div className="text-[10px] text-white/70">Entrar no módulo</div>
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { setResposta(null); setCpf(''); }}
            className="w-full mt-4 text-xs text-white/50 hover:text-white/80"
          >
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
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.cor} flex items-center justify-center shadow-lg shadow-primary/30`}>
            {meta.icon}
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Link único · {slug.toUpperCase()}</p>
            <h1 className="text-lg font-bold font-display leading-tight">{meta.titulo}</h1>
            <p className="text-[11px] text-white/60 leading-tight">{meta.subtitulo}</p>
          </div>
        </div>
        <p className="text-xs text-white/60 mb-4">
          Informe seu CPF. O sistema vai abrir os módulos em que você tem permissão.
        </p>
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
            className={`w-full bg-gradient-to-r ${meta.cor} hover:opacity-90 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-lg shadow-primary/30 transition-opacity flex items-center justify-center gap-2`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Entrar
          </button>
        </form>
        <p className="text-center text-[10px] text-white/30 mt-5">
          Topac · link único permanente · acesso por CPF
        </p>
      </div>
    </div>
  );
};

export default AcessoModuloCpfPage;
