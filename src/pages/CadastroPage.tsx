import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Lock, Mail, User, Phone, Loader2, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const RATE_LIMIT_MESSAGE = 'Limite temporario de envio de e-mail atingido. O administrador podera liberar seu acesso manualmente.';
const SIGNUPS_DISABLED_MESSAGE = 'Cadastro recebido para liberacao manual. O administrador podera concluir seu acesso.';
const MANUAL_SIGNUP_REASON = 'cadastro_sem_envio_email_liberacao_manual';

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const onlyDigits = (value: string) => value.replace(/\D/g, '');

const isRateLimitError = (message?: string) => {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('rate limit') || normalized.includes('email rate') || normalized.includes('too many');
};

const isOperationalSignupError = (message?: string) => {
  const normalized = (message || '').toLowerCase();
  return isRateLimitError(message)
    || normalized.includes('signups not allowed')
    || normalized.includes('smtp')
    || normalized.includes('send email')
    || normalized.includes('sending email')
    || normalized.includes('confirmation email');
};

const CadastroPage: React.FC = () => {
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [manualFallback, setManualFallback] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const registrarPendente = async (motivo: string) => {
    const { data, error } = await (supabase as any).rpc('registrar_cadastro_pendente_v2', {
      p_email: normalizeEmail(email),
      p_nome: nomeCompleto.trim(),
      p_telefone: telefone.trim(),
      p_cpf: onlyDigits(cpf),
      p_motivo: motivo,
    });

    if (error) {
      console.warn('Nao foi possivel registrar cadastro pendente:', error.message);
      return { ok: false, error: error.message };
    }

    return data || { ok: true };
  };

  const criarAuthPorFallback = async (motivo: string) => {
    const response = await fetch('/api/signup-fallback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: normalizeEmail(email),
        password,
        nome_completo: nomeCompleto.trim(),
        cpf: onlyDigits(cpf),
        telefone: telefone.trim(),
        motivo,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || 'fallback_signup_failed');
    }
    return payload;
  };

  const concluirCadastroManual = async (motivo: string, mensagem: string) => {
    await registrarPendente(motivo);

    try {
      await criarAuthPorFallback(motivo);
      setSuccessMessage('Cadastro recebido e conta preparada para liberacao manual. O administrador precisa aprovar seu acesso.');
    } catch (fallbackError) {
      console.warn('Fallback Auth indisponivel:', fallbackError);
      setSuccessMessage(mensagem);
    }

    setManualFallback(true);
    setSuccess(true);
    toast.warning(mensagem);
  };

  const cadastrarSemEnvioEmail = async () => {
    try {
      const payload = await criarAuthPorFallback(MANUAL_SIGNUP_REASON);
      setManualFallback(true);
      setSuccessMessage(payload?.authorized
        ? 'Cadastro confirmado pelo CPF autorizado. Voce ja pode entrar na plataforma.'
        : 'Cadastro recebido sem depender de envio de e-mail. Aguarde a liberacao do administrador.');
      setSuccess(true);
      toast.success(payload?.authorized ? 'Acesso liberado pelo CPF.' : 'Cadastro recebido. O administrador ja pode liberar seu acesso.');
      return true;
    } catch (error) {
      console.warn('Cadastro sem envio de e-mail indisponivel, usando fluxo padrao:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('As senhas nao coincidem');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (onlyDigits(cpf).length !== 11) {
      toast.error('Informe um CPF valido com 11 numeros');
      return;
    }

    setLoading(true);
    try {
      const savedWithoutEmail = await cadastrarSemEnvioEmail();
      if (savedWithoutEmail) return;

      const { error } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: { nome_completo: nomeCompleto.trim(), telefone: telefone.trim(), cpf: onlyDigits(cpf) },
        },
      });

      if (error) {
        if (isOperationalSignupError(error.message)) {
          await concluirCadastroManual(
            error.message || 'email_rate_limit',
            isRateLimitError(error.message) ? RATE_LIMIT_MESSAGE : SIGNUPS_DISABLED_MESSAGE,
          );
        } else {
          toast.error(error.message || 'Erro ao cadastrar. Tente novamente.');
        }
      } else {
        await registrarPendente('email_enviado_aguardando_liberacao');
        setManualFallback(false);
        setSuccessMessage('Enviamos um link de confirmacao. Depois da confirmacao, seu acesso continuara aguardando liberacao do administrador.');
        setSuccess(true);
      }
    } catch (error: any) {
      if (isOperationalSignupError(error?.message)) {
        await concluirCadastroManual(
          error?.message || 'email_rate_limit',
          isRateLimitError(error?.message) ? RATE_LIMIT_MESSAGE : SIGNUPS_DISABLED_MESSAGE,
        );
      } else {
        toast.error(error?.message || 'Erro ao cadastrar. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const reenviarConfirmacao = async () => {
    if (!email.trim()) return;
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizeEmail(email),
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      await (supabase as any).rpc('admin_marcar_reenvio_confirmacao', {
        p_email: normalizeEmail(email),
        p_ok: true,
        p_error: null,
      });
      toast.success('Email de confirmacao reenviado.');
    } catch (error: any) {
      await (supabase as any).rpc('admin_marcar_reenvio_confirmacao', {
        p_email: normalizeEmail(email),
        p_ok: false,
        p_error: error?.message || 'resend_failed',
      });
      toast.error(isRateLimitError(error?.message) ? RATE_LIMIT_MESSAGE : (error?.message || 'Nao foi possivel reenviar a confirmacao.'));
    } finally {
      setResendLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-primary">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="card-premium p-8 w-full max-w-md mx-4 text-center">
          <div className="w-16 h-16 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="text-xl font-bold font-display text-foreground mb-2">{manualFallback ? 'Cadastro recebido' : 'Verifique seu email'}</h1>
          <p className="text-sm text-muted-foreground mb-4">
            {successMessage || `Enviamos um link de confirmacao para ${email}. Clique no link para ativar sua conta.`}
          </p>
          {manualFallback ? (
            <p className="text-xs text-muted-foreground mb-4">
              Seu cadastro aparecera em Gerenciar Usuarios &gt; Aguardando Liberacao.
            </p>
          ) : null}
          <Link to="/login">
            <Button variant="outline" className="w-full">Voltar ao Login</Button>
          </Link>
          {!manualFallback ? (
            <Button variant="ghost" className="w-full" onClick={reenviarConfirmacao} disabled={resendLoading}>
              {resendLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Reenviar confirmacao
            </Button>
          ) : null}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center gradient-primary relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute rounded-full bg-primary-foreground/20"
            style={{ width: 200 + i * 100, height: 200 + i * 100, top: `${10 + i * 12}%`, left: `${5 + i * 15}%` }} />
        ))}
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="card-premium p-8 w-full max-w-md mx-4 relative z-10">
        <div className="text-center mb-6">
          <div className="w-16 h-16 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold font-display text-foreground">Criar Conta</h1>
          <p className="text-sm text-muted-foreground mt-1">Topac RH Multiempresa PRO</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Nome completo" value={nomeCompleto} onChange={e => setNomeCompleto(e.target.value)}
              className="pl-10" required />
          </div>
          <div className="relative">
            <Fingerprint className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="CPF" value={cpf} onChange={e => setCpf(e.target.value)}
              className="pl-10" inputMode="numeric" required />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="pl-10" required />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Telefone / Celular" value={telefone} onChange={e => setTelefone(e.target.value)}
              className="pl-10" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10" required />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="Confirmar senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="pl-10" required />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Cadastrar
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Ja tem conta? <Link to="/login" className="underline hover:text-primary">Entrar</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default CadastroPage;
