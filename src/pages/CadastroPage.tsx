import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Lock, Mail, User, Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const CadastroPage: React.FC = () => {
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome_completo: nomeCompleto, telefone },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSuccess(true);
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
          <h1 className="text-xl font-bold font-display text-foreground mb-2">Verifique seu email</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Enviamos um link de confirmação para <strong>{email}</strong>. Clique no link para ativar sua conta.
          </p>
          <Link to="/login">
            <Button variant="outline" className="w-full">Voltar ao Login</Button>
          </Link>
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
            Já tem conta? <Link to="/login" className="underline hover:text-primary">Entrar</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default CadastroPage;
