import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const RedefinirSenhaPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    await supabase.auth.signOut();
    setLoading(false);
    toast.success('Senha redefinida com sucesso! Entre com a nova senha.');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-primary">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="card-premium p-8 w-full max-w-md mx-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-accent-foreground" />
          </div>
          <h1 className="text-xl font-bold font-display text-foreground">Redefinir Senha</h1>
          <p className="text-sm text-muted-foreground mt-2">Crie sua nova senha de acesso à TOPAC RH.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="Nova senha" value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10" required />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="Confirmar nova senha" value={confirm} onChange={e => setConfirm(e.target.value)}
              className="pl-10" required />
          </div>
          <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Redefinir Senha
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default RedefinirSenhaPage;
