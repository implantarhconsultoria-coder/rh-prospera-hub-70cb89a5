import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Lock, Mail, Loader2, ArrowRight, Circle, Activity, Cpu, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const LOGIN_ALIASES: Record<string, string> = {
  fat: 'fat@topac.local',
  fin: 'fin@topac.local',
};

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const raw = email.trim().toLowerCase();
    const finalEmail = LOGIN_ALIASES[raw] || raw;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
      if (error) toast.error(error.message === 'Invalid login credentials' ? 'Email ou senha inválidos' : error.message);
    } catch (err) {
      toast.error('Falha ao conectar no login.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const redirectTo = `${window.location.origin}/`;
    const isLovablePreview =
      window.location.hostname.includes('lovable.app') || window.location.hostname.includes('lovable.dev');
    try {
      if (isLovablePreview) {
        const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: redirectTo });
        if (result.error) { toast.error('Erro ao entrar com Google'); setLoading(false); return; }
        if (result.redirected) return;
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) { toast.error(error.message || 'Erro ao entrar com Google'); setLoading(false); }
    } catch (err) {
      toast.error('Falha ao iniciar login com Google.');
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden text-slate-100 font-body"
      style={{
        background:
          'radial-gradient(circle at 16% 42%, rgba(217, 70, 239, .18), transparent 32%),' +
          'radial-gradient(circle at 84% 18%, rgba(56, 189, 248, .14), transparent 34%),' +
          'radial-gradient(circle at 70% 88%, rgba(34, 197, 94, .12), transparent 36%),' +
          'linear-gradient(135deg, #050b16 0%, #06111f 50%, #0a0a1a 100%)',
      }}
    >
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(56,189,248,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      {/* Top status bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-cyan-400/10 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] text-sky-200/80">
          <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400 animate-pulse" />
          <span>Nucleo TOPAC online</span>
          <span className="text-sky-400/40">·</span>
          <span>central-rh</span>
          <span className="text-sky-400/40">·</span>
          <span>v2.4.1</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[11px] text-sky-200/60">
          <span className="inline-flex items-center gap-1.5"><Activity className="h-3 w-3 text-emerald-400" /> SLA 99.98%</span>
          <span className="inline-flex items-center gap-1.5"><Cpu className="h-3 w-3 text-cyan-400" /> Cluster OK</span>
          <span className="inline-flex items-center gap-1.5"><Radio className="h-3 w-3 text-fuchsia-400" /> sync</span>
        </div>
      </div>

      <div className="relative z-10 grid lg:grid-cols-[1.1fr_1fr] min-h-[calc(100vh-49px)]">
        {/* LEFT — Brand cockpit */}
        <div className="hidden lg:flex flex-col justify-center p-12 xl:p-20 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8 max-w-xl"
          >
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-emerald-400 blur-xl opacity-60" />
              <div className="relative w-20 h-20 rounded-2xl bg-[#0a1424] border border-cyan-400/30 flex items-center justify-center shadow-[0_0_40px_rgba(34,211,238,0.35)]">
                <Building2 className="w-10 h-10 text-cyan-300" strokeWidth={1.5} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-400/20 bg-cyan-400/5 text-[10px] uppercase tracking-[0.25em] text-cyan-300">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Central Operacional
              </div>
              <h1 className="font-display text-6xl xl:text-7xl font-bold tracking-tight leading-[1]">
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(90deg, #22d3ee, #60a5fa, #c084fc)' }}
                >
                  TOPAC RH PRO
                </span>
              </h1>
              <p className="text-2xl font-display font-light text-slate-300">Inteligência Operacional</p>
              <p className="text-slate-400 text-base pt-2">Acesse sua central operacional</p>
            </div>

            {/* Cockpit metric strip */}
            <div className="grid grid-cols-3 gap-3 pt-6">
              {[
                { k: 'NÓS', v: '12', c: 'text-cyan-300' },
                { k: 'FILIAIS', v: '08', c: 'text-emerald-300' },
                { k: 'STATUS', v: 'OK', c: 'text-fuchsia-300' },
              ].map((m) => (
                <div
                  key={m.k}
                  className="rounded-lg border border-white/5 bg-white/[0.02] p-3 backdrop-blur-sm"
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{m.k}</p>
                  <strong className={`text-2xl font-display ${m.c}`}>{m.v}</strong>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* RIGHT — Login panel */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md"
          >
            {/* Mobile brand */}
            <div className="lg:hidden text-center mb-8 space-y-3">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-400 via-fuchsia-500 to-emerald-400 blur-lg opacity-60" />
                <div className="relative w-16 h-16 rounded-2xl bg-[#0a1424] border border-cyan-400/30 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-cyan-300" strokeWidth={1.5} />
                </div>
              </div>
              <h1
                className="font-display text-3xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(90deg, #22d3ee, #60a5fa, #c084fc)' }}
              >
                TOPAC RH PRO
              </h1>
              <p className="text-sm text-slate-400">Inteligência Operacional</p>
            </div>

            {/* Glow border wrapper */}
            <div className="relative">
              <div
                className="absolute -inset-px rounded-2xl opacity-60 blur-sm"
                style={{ background: 'linear-gradient(135deg, rgba(34,211,238,.4), rgba(124,58,237,.3), rgba(34,197,94,.3))' }}
              />
              <div className="relative rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.85)] backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] p-8 sm:p-10">
                <div className="mb-7">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80 mb-2">Acesso seguro</p>
                  <h2 className="text-2xl font-display font-bold text-white">Entrar na central</h2>
                  <p className="text-sm text-slate-400 mt-1">Use suas credenciais corporativas.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em]">
                      Email ou usuário
                    </label>
                    <div className="relative group">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
                      <Input
                        type="text"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-11 h-12 bg-white/[0.03] border-cyan-400/10 text-white placeholder:text-slate-600 focus-visible:ring-cyan-400/40 focus-visible:border-cyan-400/40 transition-colors"
                        required
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em]">Senha</label>
                      <Link to="/recuperar-senha" className="text-[11px] text-cyan-300 hover:text-cyan-200 transition-colors">
                        Esqueci minha senha
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400/60" />
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-11 h-12 bg-white/[0.03] border-cyan-400/10 text-white placeholder:text-slate-600 focus-visible:ring-cyan-400/40 focus-visible:border-cyan-400/40 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 text-[#04131a] font-semibold border-0 group relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(100deg, #58ff35, #22d3ee, #c084fc)',
                      boxShadow: '0 0 30px rgba(34,211,238,0.35), 0 0 60px rgba(124,58,237,0.2)',
                    }}
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        Entrar na plataforma
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-cyan-400/10" /></div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-[0.3em]">
                      <span className="bg-[rgba(10,17,30,1)] px-3 text-slate-500">ou</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full h-12 bg-white/[0.03] hover:bg-white/[0.06] text-slate-200 border border-cyan-400/10 hover:border-cyan-400/25 font-medium"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5c1.617 0 3.077.557 4.224 1.648l3.157-3.157C17.452 1.602 14.93.5 12 .5 7.392.5 3.397 3.137 1.386 7.005l3.69 2.87C6.07 6.93 8.802 5 12 5z"/>
                      <path fill="#4285F4" d="M23.5 12.27c0-.84-.075-1.65-.214-2.43H12v4.59h6.45c-.28 1.5-1.13 2.77-2.4 3.62l3.6 2.79c2.1-1.94 3.85-4.81 3.85-8.57z"/>
                      <path fill="#FBBC05" d="M5.077 14.13a7.16 7.16 0 010-4.26L1.386 7A11.96 11.96 0 000 12c0 1.93.46 3.76 1.386 5l3.69-2.87z"/>
                      <path fill="#34A853" d="M12 23.5c3.24 0 5.96-1.07 7.94-2.9l-3.6-2.79c-1 .67-2.29 1.07-4.34 1.07-3.2 0-5.93-1.93-6.93-4.78l-3.68 2.87C3.4 20.87 7.39 23.5 12 23.5z"/>
                    </svg>
                    Entrar com Google
                  </Button>
                </form>

                <div className="mt-7 pt-6 border-t border-cyan-400/10 text-center">
                  <span className="text-sm text-slate-400">Ainda não tem conta? </span>
                  <Link to="/cadastro" className="text-sm font-medium text-cyan-300 hover:text-cyan-200 transition-colors">
                    Criar conta
                  </Link>
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-[11px] text-slate-600 tracking-wider">
              TOPAC RH PRO · CENTRAL-RH · ACESSO RESTRITO
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
