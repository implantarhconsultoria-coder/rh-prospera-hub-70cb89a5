import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Clock, ClipboardList, Package, Gauge, LogIn, UtensilsCrossed, Coffee, LogOut as LogOutIcon } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const getGreeting = (nome?: string | null) => {
  const h = new Date().getHours();
  const prefix = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${prefix}, ${nome.split(' ')[0]}` : prefix;
};

const actions = [
  { label: 'Bater Ponto', icon: LogIn, path: '/campo/ponto', color: 'bg-blue-500/10 text-blue-500' },
  { label: 'Saída Almoço', icon: UtensilsCrossed, path: '/campo/ponto?tipo=almoco_saida', color: 'bg-orange-500/10 text-orange-500' },
  { label: 'Volta Almoço', icon: Coffee, path: '/campo/ponto?tipo=almoco_volta', color: 'bg-green-500/10 text-green-500' },
  { label: 'Saída Expediente', icon: LogOutIcon, path: '/campo/ponto?tipo=saida', color: 'bg-red-500/10 text-red-500' },
  { label: 'Chamados', icon: ClipboardList, path: '/campo/chamados', color: 'bg-purple-500/10 text-purple-500' },
  { label: 'Estoque do Carro', icon: Package, path: '/campo/estoque', color: 'bg-teal-500/10 text-teal-500' },
  { label: 'Registro de KM', icon: Gauge, path: '/campo/km', color: 'bg-amber-500/10 text-amber-500' },
];

const CampoHomePage: React.FC = () => {
  const { session } = useApp();
  const navigate = useNavigate();
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">{getGreeting(userName)}</h1>
        <p className="text-sm text-muted-foreground mt-1">Seja bem-vindo novamente.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {actions.map((a, i) => (
          <motion.button
            key={a.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => navigate(a.path)}
            className="bg-card border border-border rounded-2xl p-5 flex flex-col items-center gap-3 active:scale-[0.97] transition-transform shadow-sm"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${a.color}`}>
              <a.icon className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold text-foreground text-center leading-tight">{a.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default CampoHomePage;
