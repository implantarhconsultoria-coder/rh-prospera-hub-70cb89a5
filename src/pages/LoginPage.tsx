import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';

const ROLE_REDIRECTS: Record<string, string> = {
  admin: '/admin',
  diretor_geral: '/admin',
  filial_matriz: '/filial',
  filial_praia: '/filial',
  filial_goiania: '/filial',
  faturamento: '/faturamento',
  financeiro: '/financeiro',
  almoxarifado: '/almoxarifado',
  operacional: '/operacional',
  tecnico_campo: '/campo',
};

const getRedirectPath = (roles: string[], email = '') => {
  if (!roles.includes('admin') && !roles.includes('diretor_geral') && ['faturamento.matriz@topac.com.br','fat2.matriz@topac.com.br','fat3.matriz@topac.com.br','compras@topac.com.br','financeiro@topac.com.br'].includes(email.toLowerCase())) return '/estoque-interno';
  const role = Object.keys(ROLE_REDIRECTS).find((key) => roles.includes(key));
  return role ? ROLE_REDIRECTS[role] : '/admin';
};

const OPERATIONAL_STATS = [
  { label: 'UNIDADES', value: '03' },
  { label: 'FILIAIS', value: '02' },
  { label: 'STATUS', value: 'OK' },
];

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const LoginPage: React.FC = () => {
  const { isAuthenticated, userRoles, roleLoading, session } = useApp();
  const [cpf, setCpf] = useState('');
  const [phoneLast4, setPhoneLast4] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || roleLoading) return;
    window.location.replace(getRedirectPath(userRoles, session?.user?.email || ''));
  }, [isAuthenticated, roleLoading, userRoles, session?.user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cpfDigits = onlyDigits(cpf);
    const phoneDigits = onlyDigits(phoneLast4);

    if (cpfDigits.length !== 11) {
      toast.error('Informe um CPF com 11 dígitos.');
      return;
    }
    if (phoneDigits.length !== 4) {
      toast.error('Informe os 4 últimos dígitos do celular cadastrado.');
      return;
    }

    setLoading(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });

      const { data, error } = await supabase.functions.invoke('topac-cpf-login', {
        body: { cpf: cpfDigits, phoneLast4: phoneDigits },
      });

      if (error || !data?.ok || !data?.token_hash) {
        console.error('Falha no login CPF TOPAC:', error || data);
        toast.error(data?.message || 'CPF, celular ou acesso não conferem.');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      });

      if (verifyError) {
        console.error('Falha ao criar sessão TOPAC:', verifyError);
        toast.error('Não foi possível abrir sua sessão. Tente novamente.');
        return;
      }

      toast.success('Acesso confirmado.');
      window.location.assign('/');
    } catch (error) {
      console.error('Erro inesperado no login TOPAC:', error);
      toast.error('Não foi possível concluir o acesso. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050b16] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_17%_48%,rgba(168,85,247,0.22),transparent_34%),radial-gradient(circle_at_72%_28%,rgba(34,211,238,0.15),transparent_30%),linear-gradient(115deg,#070918_0%,#081426_46%,#041916_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,0.035)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.34),transparent_42%,rgba(0,0,0,0.15))]" />

      <div className="absolute left-6 right-6 top-4 z-20 hidden items-center justify-between text-xs text-slate-400 lg:flex">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Núcleo TOPAC online</span>
          <span className="text-slate-600">•</span>
          <span>central-rh</span>
          <span className="text-slate-600">•</span>
          <span>acesso seguro</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-emerald-300">ONLINE</span>
          <span className="text-cyan-300">Supabase</span>
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
          <p className="mt-5 text-2xl text-slate-100">Multiempresas</p>
          <p className="mt-8 max-w-xl text-slate-300">Acesse sua central com a identificação já cadastrada na TOPAC.</p>

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
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-300">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-black text-white">TOPAC RH PRO</p>
                  <p className="text-xs font-semibold text-fuchsia-300">Multiempresas</p>
                </div>
              </div>
              <h2 className="text-2xl font-bold font-display text-white">Entrar</h2>
              <p className="text-sm text-slate-400 mt-1">CPF e os 4 últimos dígitos do celular cadastrado.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-[0.28em] text-slate-400 uppercase">CPF</label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-3 w-4 h-4 text-cyan-300" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="00000000000"
                    value={cpf}
                    onChange={(e) => setCpf(onlyDigits(e.target.value).slice(0, 11))}
                    className="pl-10 border-cyan-400/20 bg-slate-900/70 text-white placeholder:text-slate-500"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-[0.28em] text-slate-400 uppercase">4 últimos dígitos do celular</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-3 w-4 h-4 text-cyan-300" />
                  <Input
                    type="password"
                    inputMode="numeric"
                    placeholder="0000"
                    value={phoneLast4}
                    onChange={(e) => setPhoneLast4(onlyDigits(e.target.value).slice(0, 4))}
                    className="pl-10 border-cyan-400/20 bg-slate-900/70 text-white placeholder:text-slate-500 tracking-[0.3em]"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <p className="text-[11px] text-slate-500">A validação acontece no servidor. Nenhuma chave administrativa é enviada ao navegador.</p>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#45ff33] via-[#35d8f2] to-[#b875ff] text-slate-950 font-bold shadow-[0_0_34px_rgba(34,211,238,.25)] hover:opacity-95"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {loading ? 'Conferindo acesso...' : 'Entrar'}
                {!loading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
              </Button>
            </form>

            <p className="mt-8 text-center text-[10px] tracking-[0.25em] text-slate-600 uppercase">
              TOPAC RH PRO • Central RH • Acesso restrito
            </p>
          </motion.div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
