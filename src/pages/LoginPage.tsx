import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Lock, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import FooterSobre from '@/components/FooterSobre';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const finalEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
    setLoading(false);
    if (error) toast.error(error.message === 'Invalid login credentials' ? 'Email ou senha inválidos' : error.message);
  };

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
        <div className="text-center mb-8">
          <div className="w-16 h-16 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold font-display text-foreground">Topac RH Multiempresa PRO</h1>
          <p className="text-sm text-muted-foreground mt-1">Plataforma de Gestão</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)}
              className="pl-10" required autoCapitalize="none" autoCorrect="off" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10" required />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Entrar
          </Button>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span />
            <Link to="/recuperar-senha" className="hover:text-primary underline">Esqueci minha senha</Link>
          </div>
        </form>
      </motion.div>
      <FooterSobre />
    </div>
  );
};

export default LoginPage;
