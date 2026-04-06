import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Lock, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LoginPage: React.FC = () => {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(username, password)) setError('Credenciais inválidas');
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
          <p className="text-sm text-muted-foreground mt-1">ImplantaRH ConsultoriaPRO</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)}
              className="pl-10" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10" />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full gradient-primary text-primary-foreground">Entrar</Button>
          <p className="text-xs text-center text-muted-foreground">
            Acesso: admin / admin ou rh / rh123
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginPage;
