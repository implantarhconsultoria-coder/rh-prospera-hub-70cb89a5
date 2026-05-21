import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Lock, Mail, Loader2, ShieldCheck, Users, BarChart3,
  Sparkles, ArrowRight, CheckCircle2,
} from 'lucide-react';
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
      if (error) {
        toast.error(error.message === 'Invalid login credentials' ? 'Email ou senha inválidos' : error.message);
      }
    } catch (error) {
      toast.error('Falha ao conectar no login. Verifique as variáveis da Vercel/Supabase.');
      console.error('Login failure:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const redirectTo = `${window.location.origin}/`;
    const isLovablePreview =
      window.location.hostname.includes('lovable.app') ||
      window.location.hostname.includes('lovable.dev');
    try {
      if (isLovablePreview) {
        const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: redirectTo });
        if (result.error) { toast.error('Erro ao entrar com Google'); setLoading(false); return; }
        if (result.redirected) return;
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) { toast.error(error.message || 'Erro ao entrar com Google'); setLoading(false); }
    } catch (error) {
      toast.error('Falha ao iniciar login com Google.');
      console.error('Google login failure:', error);
      setLoading(false);
    }
  };

  const features = [
    { icon: Users, label: 'Gestão multiempresa centralizada' },
    { icon: BarChart3, label: 'Folha, ponto e benefícios integrados' },
    { icon: ShieldCheck, label: 'Segurança e auditoria em todos os níveis' },
  ];

  return (
    <div className="min-h-screen w-full bg-[hsl(215,40%,8%)] text-slate-100 relative overflow-hidden">
      {/* Background ambient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[hsl(200,60%,25%)]/30 blur-[140px]" />
        <div className="absolute -bottom-40 right-0 w-[500px] h-[500px] rounded-full bg-[hsl(25,90%,50%)]/15 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(200,30%,80%) 1px, transparent 1px), linear-gradient(90deg, hsl(200,30%,80%) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen grid lg:grid-cols-2">
        {/* LEFT — Brand */}
        <div className="hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[hsl(25,95%,55%)] to-[hsl(20,90%,45%)] flex items-center justify-center shadow-lg shadow-[hsl(25,90%,50%)]/30">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide text-white">Topac RH</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[hsl(25,90%,60%)]">Multiempresa PRO</div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8 max-w-xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-[hsl(25,90%,60%)]" />
              Plataforma corporativa de gestão de pessoas
            </div>
            <h1 className="font-display text-5xl xl:text-6xl font-bold leading-[1.05] tracking-tight">
              Controle total da sua{' '}
              <span className="bg-gradient-to-r from-[hsl(25,95%,60%)] to-[hsl(35,95%,65%)] bg-clip-text text-transparent">
                operação RH
              </span>{' '}
              em um só lugar.
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              Unifique filiais, folha, ponto, benefícios e auditoria com a robustez
              que a sua operação multiempresa exige.
            </p>

            <div className="space-y-3 pt-4">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-3 text-sm text-slate-300">
                  <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <f.icon className="w-4 h-4 text-[hsl(25,90%,60%)]" />
                  </div>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="flex items-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sistema online</span>
            </div>
            <span>v2.4.1</span>
            <span>© Topac RH PRO</span>
          </div>
        </div>

        {/* RIGHT — Form */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-full max-w-md"
          >
            {/* Mobile brand */}
            <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[hsl(25,95%,55%)] to-[hsl(20,90%,45%)] flex items-center justify-center shadow-lg shadow-[hsl(25,90%,50%)]/30">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Topac RH</div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-[hsl(25,90%,60%)]">Multiempresa PRO</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[hsl(215,40%,11%)]/80 backdrop-blur-xl shadow-2xl shadow-black/40 p-8 sm:p-10">
              <div className="mb-8">
                <h2 className="text-2xl font-display font-bold text-white">Acessar plataforma</h2>
                <p className="text-sm text-slate-400 mt-1.5">
                  Entre com suas credenciais corporativas para continuar.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                    Email ou usuário
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="text"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-[hsl(25,90%,55%)] focus-visible:border-[hsl(25,90%,55%)]/50"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                      Senha
                    </label>
                    <Link
                      to="/recuperar-senha"
                      className="text-xs text-[hsl(25,90%,60%)] hover:text-[hsl(25,95%,70%)] transition-colors"
                    >
                      Esqueci minha senha
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-[hsl(25,90%,55%)] focus-visible:border-[hsl(25,90%,55%)]/50"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-gradient-to-r from-[hsl(25,95%,55%)] to-[hsl(20,90%,48%)] hover:from-[hsl(25,95%,58%)] hover:to-[hsl(20,90%,52%)] text-white font-semibold shadow-lg shadow-[hsl(25,90%,45%)]/30 border-0 group"
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
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                    <span className="bg-[hsl(215,40%,11%)] px-3 text-slate-500">ou continue com</span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full h-12 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 font-medium"
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

              <div className="mt-7 pt-6 border-t border-white/10 text-center">
                <span className="text-sm text-slate-400">Ainda não tem conta? </span>
                <Link
                  to="/cadastro"
                  className="text-sm font-medium text-[hsl(25,90%,60%)] hover:text-[hsl(25,95%,70%)] transition-colors"
                >
                  Criar conta
                </Link>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-slate-500">
              Ao acessar, você concorda com os termos de uso e políticas de privacidade da Topac.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
