import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const PASSWORD_RECOVERY_URL = 'https://topacrh.pro/redefinir-senha';

const RecuperarSenhaPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RECOVERY_URL,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-primary">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="card-premium p-8 w-full max-w-md mx-4 text-center">
        <div className="w-16 h-16 gradient-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-accent-foreground" />
        </div>
        {sent ? (
          <>
            <h1 className="text-xl font-bold font-display text-foreground mb-2">Email enviado</h1>
            <p className="text-sm text-muted-foreground mb-4">
              Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha na TOPAC RH.
            </p>
            <Link to="/login"><Button variant="outline" className="w-full">Voltar ao Login</Button></Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold font-display text-foreground mb-2">Recuperar Senha</h1>
            <p className="text-sm text-muted-foreground mb-4">Informe seu email para receber o link de redefinição.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                  className="pl-10" required />
              </div>
              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enviar link
              </Button>
              <Link to="/login" className="text-xs text-muted-foreground underline hover:text-primary block">Voltar ao Login</Link>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default RecuperarSenhaPage;
