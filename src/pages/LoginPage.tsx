import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Lock, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { lovable } from '@/integrations/lovable/index';
import { supabase } from '@/integrations/supabase/client';
import {
  createExternalSession,
  saveExternalSession,
  saveLastExternalUser,
  type PortalExterno,
} from '@/lib/acessoExternoAuth';

const LOGIN_ALIASES: Record<string, string> = {
  fat: 'fat@topac.local',
  fin: 'fin@topac.local',
};

const OPERATIONAL_STATS = [
  { label: 'UNIDADES', value: '03' },
  { label: 'FILIAIS', value: '02' },
  { label: 'STATUS', value: 'OK' },
];

const MODULO_REDIRECT: Record<string, (id: string) => string> = {
  filial: (id) => `/filial-ext/${id}`,
  financeiro: (id) => `/financeiro-ext/${id}`,
  faturamento: (id) => `/faturamento-ext/${id}`,
  almoxarifado: (id) => `/almoxarifado-ext/${id}`,
  operacional: (id) => `/operacional-ext/${id}`,
  campo: (id) => `/campo-ext/${id}`,
  mecanico: (id) => `/app-mecanico/${id}`,
};

type UsuarioCpf = {
  cpf_clean: string;
  nome: string;
  portais: PortalExterno[];
};

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const abrirPortalCpf = async (usuario: UsuarioCpf) => {
    const sessao = createExternalSession({
      cpf_clean: usuario.cpf_clean,
      nome: usuario.nome,
      portais: usuario.portais,
    });
    saveExternalSession(sessao);
    saveLastExternalUser({ nome: usuario.nome, cpf_clean: usuario.cpf_clean });

    if (usuario.portais.length !== 1) {
      window.location.assign('/portais');
      return;
    }

    const portal = usuario.portais[0];
    if (portal.modulo === 'mecanico') {
      localStorage.setItem('app_mecanico_acesso_id', portal.acesso_id);
      window.location.assign(MODULO_REDIRECT.mecanico(portal.acesso_id));
      return;
    }

    const { data, error } = await supabase.rpc('acesso_externo_obter' as any, {
      p_id: portal.acesso_id,
      p_modulo: portal.modulo,
    });

    if (error || !(data as any)?.ok) {
      toast.error('Acesso nao liberado para este modulo.');
      return;
    }

    localStorage.setItem('acesso_externo', JSON.stringify({ ...(data as any).acesso, ts: Date.now() }));
    const redirect = MODULO_REDIRECT[portal.modulo];
    if (!redirect) {
      toast.error('Modulo sem rota liberada.');
      return;
    }
    window.location.assign(redirect((data as any).acesso.id));
  };

  const handleCpfPinLogin = async (pin: string) => {
    const [{ data: portData, error: portError }, { data: mecData, error: mecError }] = await Promise.all([
      supabase.rpc('acesso_externo_listar_portais' as any, { p_pin: pin }),
      supabase.rpc('acesso_externo_validar_pin' as any, { p_pin: pin, p_modulo: 'mecanico' }),
    ]);

    if (portError && mecError) {
      toast.error('Erro ao validar CPF. Tente novamente.');
      return;
    }

    const usuarios = new Map<string, UsuarioCpf>();
    const addUsuario = (u: any) => {
      const key = `${u.cpf_clean || ''}:${u.nome || ''}`;
      const atual = usuarios.get(key) || {
        cpf_clean: u.cpf_clean || `pin:${pin}`,
        nome: u.nome || 'Usuario TOPAC',
        portais: [],
      };
      atual.portais.push(...((u.portais || []) as PortalExterno[]));
      usuarios.set(key, atual);
    };

    if ((portData as any)?.ok) {
      ((portData as any).usuarios || []).forEach(addUsuario);
    }

    if ((mecData as any)?.ok) {
      ((mecData as any).usuarios || []).forEach((m: any) => addUsuario({
        cpf_clean: `pin:${pin}:${m.id}`,
        nome: m.nome,
        portais: [{
          acesso_id: m.id,
          modulo: 'mecanico',
          perfil_acesso: m.perfil_acesso || 'mecanico',
          empresa: m.empresa || '',
          filial: m.filial || '',
          funcao: m.funcao || '',
        }],
      }));
    }

    const lista = Array.from(usuarios.values()).filter((u) => u.portais.length > 0);
    if (lista.length === 0) {
      const bloqueado = (portData as any)?.error === 'bloqueado' || (mecData as any)?.error === 'bloqueado';
      toast.error(bloqueado ? 'Acesso bloqueado pelo administrador.' : 'CPF/PIN nao encontrado ou sem modulo liberado.');
      return;
    }

    if (lista.length === 1) {
      await abrirPortalCpf(lista[0]);
      return;
    }

    const sessao = createExternalSession({
      cpf_clean: `pin:${pin}`,
      nome: 'Usuario TOPAC',
      portais: lista.flatMap((u) => u.portais),
    });
    saveExternalSession(sessao);
    window.location.assign('/portais');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const raw = email.trim().toLowerCase();
    const pin = raw.replace(/\D/g, '');
    if (pin.length === 4 && !password.trim()) {
      await handleCpfPinLogin(pin);
      setLoading(false);
      return;
    }
    const finalEmail = LOGIN_ALIASES[raw] || raw;
    const { error } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
    setLoading(false);
    if (error) toast.error(error.message === 'Invalid login credentials' ? 'Email ou senha invalidos' : error.message);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error('Erro ao entrar com Google');
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050b16] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_17%_48%,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_72%_28%,rgba(34,211,238,0.15),transparent_30%),linear-gradient(115deg,#070918_0%,#081426_46%,#041916_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.035)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.34),transparent_42%,rgba(0,0,0,0.15))]" />

      <div className="absolute left-6 right-6 top-4 z-20 hidden items-center justify-between text-xs text-slate-400 lg:flex">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Nucleo TOPAC online</span>
          <span className="text-slate-600">.</span>
          <span>central-rh</span>
          <span className="text-slate-600">.</span>
          <span>v2.4.1</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-emerald-300">SLA 99.98%</span>
          <span className="text-cyan-300">Cluster OK</span>
          <span className="text-fuchsia-300">sync</span>
        </div>
      </div>

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.05fr_.95fr]">
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden lg:flex flex-col justify-center px-20"
        >
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-10 bg-[#071827] border border-cyan-400/15 shadow-[0_0_58px_rgba(34,211,238,.28)]">
            <img src="/icons/icon-192.png?v=20260524-2" alt="TOPAC RH PRO" className="w-14 h-14 rounded-xl object-cover" />
          </div>
          <div className="inline-flex items-center gap-2 w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold tracking-[0.35em] text-cyan-200 mb-8">
            <span className="h-2 w-2 rounded-full bg-cyan-300" />
            CENTRAL OPERACIONAL
          </div>
          <h1 className="text-6xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-blue-300 to-fuchsia-300 bg-clip-text text-transparent">
            TOPAC RH PRO
          </h1>
          <p className="mt-5 text-2xl text-slate-100">Inteligencia Operacional</p>
          <p className="mt-8 max-w-xl text-slate-300">Acesse sua central operacional.</p>

          <div className="mt-16 grid grid-cols-3 gap-3 max-w-xl">
            {OPERATIONAL_STATS.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-4 backdrop-blur">
                <p className="text-[10px] font-bold tracking-[0.28em] text-slate-400">{stat.label}</p>
                <p className="mt-2 text-2xl font-black text-cyan-200">{stat.value}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <section className="flex items-center justify-center px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md mx-4 relative z-10 rounded-2xl border border-cyan-400/15 bg-[#101829]/88 p-8 shadow-[0_0_55px_rgba(34,211,238,.13)] backdrop-blur-xl"
          >
            <div className="mb-8">
              <p className="text-xs font-bold tracking-[0.32em] text-cyan-300 uppercase">Acesso seguro</p>
              <h2 className="mt-3 text-2xl font-bold font-display text-white">Entrar na central</h2>
              <p className="text-sm text-slate-400 mt-1">Use suas credenciais corporativas.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-[0.28em] text-slate-400 uppercase">
                  Email ou usuario
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-cyan-300" />
                  <Input
                    type="text"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 border-cyan-400/20 bg-slate-900/70 text-white placeholder:text-slate-500"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold tracking-[0.28em] text-slate-400 uppercase">Senha</label>
                  <Link to="/recuperar-senha" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-cyan-300" />
                  <Input
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 border-cyan-400/20 bg-slate-900/70 text-white placeholder:text-slate-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">Para CPF/PIN, digite os 4 ultimos numeros acima e deixe a senha em branco.</p>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#45ff33] via-[#35d8f2] to-[#b875ff] text-slate-950 font-bold shadow-[0_0_34px_rgba(34,211,238,.25)] hover:opacity-95"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Entrar na plataforma
                {!loading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
                <span className="relative mx-auto block w-fit bg-[#101829] px-3 text-[10px] text-slate-500 tracking-[0.3em]">
                  OU
                </span>
              </div>

              <Button
                type="button"
                variant="outline"
                className="group w-full border-white/10 bg-slate-900/45 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] hover:border-cyan-300/35 hover:bg-slate-800/80 hover:text-white"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <span className="mr-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-base font-black shadow-[0_0_18px_rgba(255,255,255,.12)]">
                  <span className="bg-gradient-to-r from-[#4285f4] via-[#34a853] to-[#fbbc05] bg-clip-text text-transparent">G</span>
                </span>
                <span className="font-semibold">Entrar com Google</span>
              </Button>

              <div className="flex justify-center text-sm text-slate-400">
                <span>Ainda nao tem conta? </span>
                <Link to="/cadastro" className="ml-1 font-semibold text-cyan-300 hover:text-cyan-200">Criar conta</Link>
              </div>
            </form>

            <p className="mt-8 text-center text-[10px] tracking-[0.25em] text-slate-600 uppercase">
              TOPAC RH PRO - Central RH - Acesso restrito
            </p>
          </motion.div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
