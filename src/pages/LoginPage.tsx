import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Loader2, Lock, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { lovable } from '@/integrations/lovable/index';
import { supabase } from '@/integrations/supabase/client';

const LOGIN_ALIASES: Record<string, string> = {
  fat: 'fat@topac.local',
  fin: 'fin@topac.local',
};

const OPERATIONAL_STATS = [
  { label: 'UNIDADES', value: '03' },
  { label: 'FILIAIS', value: '02' },
  { label: 'STATUS', value: 'OK' },
];

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const raw = email.trim().toLowerCase();
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
    <div className="min-h-screen gradient-primary relative overflow-hidden text-foreground">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-primary-foreground/20"
            style={{
              width: 200 + i * 100,
              height: 200 + i * 100,
              top: `${10 + i * 12}%`,
              left: `${5 + i * 15}%`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.06)_1px,transparent_1px)] bg-[size:56px_56px] pointer-events-none" />

      <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.05fr_.95fr]">
        <motion.section
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden lg:flex flex-col justify-center px-20"
        >
          <div className="w-20 h-20 gradient-accent rounded-3xl flex items-center justify-center mb-10 shadow-[0_0_45px_rgba(34,211,238,.25)]">
            <Building2 className="w-10 h-10 text-accent-foreground" />
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
              <div key={stat.label} className="rounded-xl border border-cyan-400/15 bg-slate-950/35 px-4 py-4">
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
            className="card-premium p-8 w-full max-w-md mx-4 relative z-10 border-cyan-400/15"
          >
            <div className="mb-8">
              <p className="text-xs font-bold tracking-[0.32em] text-cyan-300 uppercase">Acesso seguro</p>
              <h2 className="mt-3 text-2xl font-bold font-display text-foreground">Entrar na central</h2>
              <p className="text-sm text-muted-foreground mt-1">Use suas credenciais corporativas.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-[0.28em] text-muted-foreground uppercase">
                  Email ou usuario
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-[0.28em] text-muted-foreground uppercase">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Entrar na plataforma
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span className="relative mx-auto block w-fit bg-card px-3 text-[10px] text-muted-foreground tracking-[0.3em]">
                  OU
                </span>
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={loading}>
                Entrar com Google
              </Button>

              <div className="flex justify-between text-xs text-muted-foreground">
                <Link to="/cadastro" className="hover:text-primary underline">Criar conta</Link>
                <Link to="/recuperar-senha" className="hover:text-primary underline">Esqueci minha senha</Link>
              </div>
            </form>

            <p className="mt-8 text-center text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
              TOPAC RH PRO - Central RH - Acesso restrito
            </p>
          </motion.div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
