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

const SLUG_LABEL: Record<string, { titulo: string; subtitulo: string; icon: React.ReactNode; cor: string }> = {
  'op-sp':       { titulo: 'App Operacional · SP',          subtitulo: 'Topac Matriz · São Paulo',     icon: <Wrench className="w-5 h-5 text-white" />,   cor: 'from-primary to-blue-600' },
  'op-pg':       { titulo: 'App Operacional · Praia Grande',subtitulo: 'Topac Filial Praia Grande',    icon: <Wrench className="w-5 h-5 text-white" />,   cor: 'from-cyan-500 to-blue-600' },
  'op-go':       { titulo: 'App Operacional · Goiânia',     subtitulo: 'Topac Filial Goiânia',         icon: <Wrench className="w-5 h-5 text-white" />,   cor: 'from-emerald-500 to-teal-600' },
  'fat-sp':      { titulo: 'Faturamento · SP',              subtitulo: 'Topac Matriz · São Paulo',     icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-indigo-500 to-violet-600' },
  'fat-pg':      { titulo: 'Faturamento · Praia Grande',    subtitulo: 'Topac Filial Praia Grande',    icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-indigo-500 to-violet-600' },
  'fat-go':      { titulo: 'Faturamento · Goiânia',         subtitulo: 'Topac Filial Goiânia',         icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-indigo-500 to-violet-600' },
  'fin-sp':      { titulo: 'Financeiro · SP',               subtitulo: 'Topac Matriz · São Paulo',     icon: <DollarSign className="w-5 h-5 text-white" />, cor: 'from-cyan-600 to-sky-700' },
  'fin-pg':      { titulo: 'Financeiro · Praia Grande',     subtitulo: 'Topac Filial Praia Grande',    icon: <DollarSign className="w-5 h-5 text-white" />, cor: 'from-cyan-600 to-sky-700' },
  'fin-go':      { titulo: 'Financeiro · Goiânia',          subtitulo: 'Topac Filial Goiânia',         icon: <DollarSign className="w-5 h-5 text-white" />, cor: 'from-cyan-600 to-sky-700' },
  'rh-sp':       { titulo: 'RH · SP',                       subtitulo: 'Topac Matriz · São Paulo',     icon: <Users className="w-5 h-5 text-white" />,    cor: 'from-rose-500 to-pink-600' },
  'rh-pg':       { titulo: 'RH · Praia Grande',             subtitulo: 'Topac Filial Praia Grande',    icon: <Users className="w-5 h-5 text-white" />,    cor: 'from-rose-500 to-pink-600' },
  'rh-go':       { titulo: 'RH · Goiânia',                  subtitulo: 'Topac Filial Goiânia',         icon: <Users className="w-5 h-5 text-white" />,    cor: 'from-rose-500 to-pink-600' },
  'alm-sp':      { titulo: 'Almoxarifado · SP',             subtitulo: 'Topac Matriz · São Paulo',     icon: <Package className="w-5 h-5 text-white" />,  cor: 'from-amber-500 to-orange-600' },
  'alm-pg':      { titulo: 'Almoxarifado · Praia Grande',   subtitulo: 'Topac Filial Praia Grande',    icon: <Package className="w-5 h-5 text-white" />,  cor: 'from-amber-500 to-orange-600' },
  'alm-go':      { titulo: 'Almoxarifado · Goiânia',        subtitulo: 'Topac Filial Goiânia',         icon: <Package className="w-5 h-5 text-white" />,  cor: 'from-amber-500 to-orange-600' },
  'docrh-sp':    { titulo: 'Documentos RH · SP',            subtitulo: 'EPI · Uniformes · Avisos',     icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-fuchsia-500 to-rose-600' },
  'docrh-pg':    { titulo: 'Documentos RH · Praia Grande',  subtitulo: 'EPI · Uniformes · Avisos',     icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-fuchsia-500 to-rose-600' },
  'docrh-go':    { titulo: 'Documentos RH · Goiânia',       subtitulo: 'EPI · Uniformes · Avisos',     icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-fuchsia-500 to-rose-600' },
  'financeiro':  { titulo: 'Portal Financeiro TOPAC',       subtitulo: 'Acesso por CPF',               icon: <DollarSign className="w-5 h-5 text-white" />, cor: 'from-cyan-600 to-sky-700' },
  'faturamento': { titulo: 'Portal Faturamento TOPAC',      subtitulo: 'Acesso por CPF',               icon: <FileText className="w-5 h-5 text-white" />, cor: 'from-indigo-500 to-violet-600' },
  'rh':          { titulo: 'Portal RH',                     subtitulo: 'Acesso por CPF',               icon: <Users className="w-5 h-5 text-white" />,    cor: 'from-rose-500 to-pink-600' },
  'almoxarifado':{ titulo: 'Portal Almoxarifado',           subtitulo: 'Acesso por CPF',               icon: <Package className="w-5 h-5 text-white" />,  cor: 'from-amber-500 to-orange-600' },
  'mecanicos':   { titulo: 'Portal Mecânicos',              subtitulo: 'Acesso por CPF',               icon: <Cog className="w-5 h-5 text-white" />,      cor: 'from-slate-500 to-zinc-700' },
  'matriz':      { titulo: 'Filial · Matriz',               subtitulo: 'Topac Matriz / Alqui / LMT',   icon: <Building2 className="w-5 h-5 text-white" />,cor: 'from-indigo-600 to-blue-700' },
  'filial-pg':   { titulo: 'Filial · Praia Grande',         subtitulo: 'Topac Filial Praia Grande',    icon: <MapPin className="w-5 h-5 text-white" />,   cor: 'from-cyan-600 to-blue-700' },
  'filial-go':   { titulo: 'Filial · Goiânia',              subtitulo: 'Topac Filial Goiânia',         icon: <MapPin className="w-5 h-5 text-white" />,   cor: 'from-emerald-600 to-teal-700' },
};

const ERRO_LABEL: Record<string, string> = {
  cpf_invalido:                     'CPF inválido. Confira os 11 dígitos.',
  cpf_sem_permissao_cadastrada:     'CPF sem permissão cadastrada.',
  cpf_nao_encontrado:               'CPF sem permissão cadastrada.',
  cpf_nao_encontrado_funcionarios:  'CPF sem permissão cadastrada.',
  sem_permissao_modulo:             'CPF sem permissão para este módulo.',
  acesso_bloqueado:                 'Acesso bloqueado.',
  funcionario_inativo:              'Acesso bloqueado.',
  funcionario_bloqueado:            'Acesso bloqueado.',
  funcionario_ferias:               'Acesso bloqueado.',
  funcionario_desligado:            'Acesso bloqueado.',
  modulo_bloqueado:                 'Acesso bloqueado.',
  cpf_bloqueado:                    'Acesso bloqueado.',
  unidade_incorreta:                'Este CPF pertence a outra unidade.',
  link_invalido:                    'Link inválido. Solicite o link correto ao RH.',
  link_bloqueado:                   'Acesso bloqueado.',
  tecnico_nao_encontrado:           'CPF sem permissão para este módulo.',
  blocked_link:                     'Acesso bloqueado.',
  revoked_link:                     'Acesso bloqueado.',
  invalid_token:                    'Acesso bloqueado.',
  db_error:                         'Falha temporária. Tente novamente em instantes.',
  internal:                         'Falha temporária. Tente novamente em instantes.',
};

type AcessoCpfResponse = {
  ok?: boolean;
  error?: string;
  modulo?: string;
  area?: string;
  filial?: string | null;
  unidade?: string;
  link_nome?: string;
  tecnico_token?: string;
  usuario?: {
    funcionario_id: string;
    cpf: string;
    nome: string;
    empresa?: string;
    cargo?: string;
    setor?: string;
    company_id?: string;
  };
};

type LinkAcessoPublico = {
  slug: string;
  modulo: string;
  unidade: string;
  nome: string;
  status: string;
};

const AcessoModuloCpfPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const meta = SLUG_LABEL[slug] || { titulo: 'Acesso por CPF', subtitulo: '', icon: <Wrench className="w-5 h-5 text-white" />, cor: 'from-primary to-blue-600' };
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Sessão por dispositivo válida até 23:59:59 do mesmo dia
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cpf_device_session_${slug}`);
      if (!raw) return;
      const sess = JSON.parse(raw) as { expiresAt: number; redirect: string };
      if (sess.expiresAt > Date.now() && sess.redirect) {
        navigate(sess.redirect, { replace: true });
      } else {
        localStorage.removeItem(`cpf_device_session_${slug}`);
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => { setErro(null); }, [slug]);

  const validarAcesso = async (slugAtual: string, digits: string): Promise<AcessoCpfResponse> => {
    // Chamada direta ao RPC (anon tem GRANT EXECUTE).
    // A função no banco infere o módulo pelo slug se o registro de link
    // não existir ou estiver inativo, então não retornamos mais "link_invalido".
    const { data, error } = await supabase.rpc('validar_acesso_cpf_slug', {
      p_slug: slugAtual,
      p_cpf: digits,
    });
    if (error) {
      return { ok: false, error: 'db_error' };
    }
    return (data as AcessoCpfResponse) || { ok: false, error: 'db_error' };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
      setErro(ERRO_LABEL.cpf_invalido);
      return;
    }
    setLoading(true);
    try {
      const data = await validarAcesso(slug, digits);

      if (!data?.ok) {
        const code = data?.error || 'db_error';
        setErro(ERRO_LABEL[code] || `Acesso negado (${code}).`);
        setLoading(false);
        return;
      }

      // Sessão por dispositivo válida até 23:59:59 do mesmo dia
      const now = new Date();
      const fim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const expiresAt = fim.getTime();

      // Operacional: token é dado complementar. Se faltar, cai no portal de mecânicos por CPF.
      if (data.area === 'operacional' || data.modulo === 'operacional') {
        const dest = data.tecnico_token
          ? `/operacional/${data.tecnico_token}`
          : `/setor-cpf/mecanicos${data.filial ? `?filial=${data.filial}` : ''}`;
        try {
          sessionStorage.setItem('cpf_session', JSON.stringify({
            modulo: data.modulo, area: data.area, filial: data.filial || null,
            unidade: data.unidade, link_nome: data.link_nome, usuario: data.usuario,
            ts: Date.now(), expiresAt,
          }));
          localStorage.setItem(`cpf_device_session_${slug}`, JSON.stringify({ expiresAt, redirect: dest }));
        } catch { /* noop */ }
        navigate(dest, { replace: true });
        return;
      }

      // Sessão isolada por CPF
      const sessao = {
        modulo: data.modulo,
        area: data.area,
        filial: data.filial || null,
        unidade: data.unidade,
        link_nome: data.link_nome,
        usuario: data.usuario,
        ts: Date.now(),
        expiresAt,
      };
      sessionStorage.setItem('cpf_session', JSON.stringify(sessao));

      const area = data.area || data.modulo || '';
      const filialQS = data.filial ? `?filial=${data.filial}` : '';

      const destino: Record<string, string> = {
        financeiro:   `/financeiro-cpf${filialQS}`,
        faturamento:  `/faturamento-cpf${filialQS}`,
        rh:           `/setor-cpf/rh${filialQS}`,
        almoxarifado: `/setor-cpf/almoxarifado${filialQS}`,
        documentos_rh: `/setor-cpf/documentos-rh${filialQS}`,
        mecanicos:    `/setor-cpf/mecanicos${filialQS}`,
        filial:       `/setor-cpf/filial${filialQS}`,
      };
      const dest = destino[area] || `/setor-cpf/${area}${filialQS}`;
      try {
        localStorage.setItem(`cpf_device_session_${slug}`, JSON.stringify({ expiresAt, redirect: dest }));
      } catch { /* noop */ }
      navigate(dest, { replace: true });
    } catch {
      setErro(ERRO_LABEL.db_error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-white">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.cor} flex items-center justify-center shadow-lg shadow-primary/30`}>
            {meta.icon}
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider leading-none">Acesso por CPF · link permanente</p>
            <h1 className="text-lg font-bold font-display leading-tight">{meta.titulo}</h1>
            {meta.subtitulo && <p className="text-[11px] text-white/60 leading-tight">{meta.subtitulo}</p>}
          </div>
        </div>
        <p className="text-xs text-white/60 mb-4">
          Informe seu CPF para entrar. Cada CPF abre uma sessão isolada e segura.
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
          Topac · link permanente · acesso por CPF
        </p>
      </div>
    </div>
  );
};

export default AcessoModuloCpfPage;
