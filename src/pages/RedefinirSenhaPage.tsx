import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const RedefinirSenhaPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [validRecovery, setValidRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const inspectRecovery = async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const query = new URLSearchParams(window.location.search);
      const errorCode = hash.get('error_code') || query.get('error_code') || hash.get('error') || query.get('error');
      const errorDescription = hash.get('error_description') || query.get('error_description');

      if (errorCode) {
        if (active) {
          setRecoveryError(errorDescription || 'Este link de recuperação é inválido ou expirou.');
          setChecking(false);
        }
        return;
      }

      const tokenHash = query.get('token_hash');
      const type = query.get('type');
      if (tokenHash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        if (error) {
          if (active) {
            setRecoveryError('Este link de recuperação é inválido ou expirou. Solicite um novo link.');
            setChecking(false);
          }
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (active) {
        setValidRecovery(Boolean(data.session));
        if (!data.session) setRecoveryError('Não foi possível validar este link. Solicite um novo link de recuperação.');
        setChecking(false);
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setValidRecovery(true);
        setRecoveryError('');
        setChecking(false);
      }
    });

    inspectRecovery();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validRecovery) {
      toast.error('Solicite um novo link de recuperação.');
      return;
    }
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

        {checking ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Validando link de recuperação...
          </div>
        ) : recoveryError || !validRecovery ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Link inválido ou expirado</p>
                  <p className="text-muted-foreground mt-1">{recoveryError || 'Solicite um novo link de recuperação.'}</p>
                </div>
              </div>
            </div>
            <Button type="button" className="w-full gradient-primary text-primary-foreground" onClick={() => navigate('/recuperar-senha', { replace: true })}>
              Solicitar novo link
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/login', { replace: true })}>
              Voltar ao Login
            </Button>
          </div>
        ) : (
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
        )}
      </motion.div>
    </div>
  );
};

export default RedefinirSenhaPage;
