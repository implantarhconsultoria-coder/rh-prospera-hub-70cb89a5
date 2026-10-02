import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Clock, ClipboardList, Package, Gauge, LogIn, UtensilsCrossed, Coffee, LogOut as LogOutIcon, MapPin, Car } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useVeiculoColaborador } from '@/hooks/useVeiculoColaborador';
import { supabase } from '@/integrations/supabase/client';

const getGreeting = (nome?: string | null) => {
  const h = new Date().getHours();
  const prefix = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${prefix}, ${nome.split(' ')[0]}` : prefix;
};

const TIPO_LABELS: Record<string, string> = {
  entrada: 'Entrada registrada',
  almoco_saida: 'Saída para almoço',
  almoco_volta: 'Volta do almoço',
  saida: 'Saída do expediente',
};

const pontoActions = [
  { label: 'Bater Ponto', sub: 'Entrada', icon: LogIn, path: '/campo/ponto?tipo=entrada' },
  { label: 'Saída Almoço', sub: 'Pausa', icon: UtensilsCrossed, path: '/campo/ponto?tipo=almoco_saida' },
  { label: 'Volta Almoço', sub: 'Retorno', icon: Coffee, path: '/campo/ponto?tipo=almoco_volta' },
  { label: 'Saída Expediente', sub: 'Fim do dia', icon: LogOutIcon, path: '/campo/ponto?tipo=saida' },
];

const opActions = [
  { label: 'Chamados', sub: 'Aceitar / executar', icon: ClipboardList, path: '/campo/chamados' },
  { label: 'Estoque do Carro', sub: 'Itens disponíveis', icon: Package, path: '/campo/estoque' },
  { label: 'Registro de KM', sub: 'Foto + valor', icon: Gauge, path: '/campo/km' },
];

const CampoHomePage: React.FC = () => {
  const { session } = useApp();
  const navigate = useNavigate();
  const veiculo = useVeiculoColaborador();
  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || null;
  const [ultimoPonto, setUltimoPonto] = useState<{ tipo: string; hora: string } | null>(null);
  const [chamadosAbertos, setChamadosAbertos] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data: pontos } = await (supabase as any).from('registros_ponto')
        .select('tipo, hora')
        .eq('user_id', session.user.id)
        .eq('data', today)
        .order('hora', { ascending: false })
        .limit(1);
      if (pontos?.[0]) setUltimoPonto({ tipo: pontos[0].tipo, hora: pontos[0].hora });

      const { count } = await supabase.from('chamados')
        .select('id', { count: 'exact', head: true })
        .eq('colaborador_id', session.user.id)
        .in('status', ['pendente', 'aceito', 'em_andamento']);
      setChamadosAbertos(count || 0);
    })();
  }, [session?.user?.id]);

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[12px] border border-[#342442] bg-[#05080b] p-4 shadow-[0_14px_38px_rgba(0,0,0,.28)]"
      >
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-violet-400">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        <h1 className="mt-1 text-[20px] font-black tracking-[-.02em] text-white">{getGreeting(userName)}</h1>
        <p className="mt-1 text-[11px] text-zinc-500">Tudo pronto para mais um dia em campo.</p>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="rounded-[9px] border border-[#2b2631] bg-[#080b10] p-3">
            <div className="flex items-center gap-1.5 text-zinc-600 text-[10px] uppercase font-semibold tracking-wider">
              <Clock className="w-3 h-3" /> Último ponto
            </div>
            <p className="text-white font-semibold text-sm mt-1">
              {ultimoPonto ? `${TIPO_LABELS[ultimoPonto.tipo] || ultimoPonto.tipo} · ${ultimoPonto.hora.slice(0, 5)}` : 'Nenhum hoje'}
            </p>
          </div>
          <div className="rounded-[9px] border border-[#2b2631] bg-[#080b10] p-3">
            <div className="flex items-center gap-1.5 text-zinc-600 text-[10px] uppercase font-semibold tracking-wider">
              <ClipboardList className="w-3 h-3" /> Chamados
            </div>
            <p className="text-white font-semibold text-sm mt-1">{chamadosAbertos} em aberto</p>
          </div>
        </div>

        {veiculo.placa && (
          <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
            <Car className="w-4 h-4 text-primary" />
            <span className="font-medium text-white">{veiculo.placa}</span>
            <span className="text-zinc-600">·</span>
            <span>{veiculo.modelo}</span>
          </div>
        )}
      </motion.div>

      {/* Ponto digital */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[.14em] text-zinc-300">Ponto Digital</h2>
          <span className="text-[10px] text-zinc-600">Selfie obrigatória na entrada</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {pontoActions.map((a, i) => (
            <motion.button
              key={a.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate(a.path)}
              className="relative overflow-hidden rounded-[10px] border border-[#342442] bg-[#070a0f] p-4 text-left transition hover:border-violet-500/40 hover:bg-[#0b0d13]"
            >
              <div className="grid h-9 w-9 place-items-center rounded-[8px] border border-violet-500/25 bg-violet-500/10">
                <a.icon className="h-4 w-4 text-[#ffb400]" />
              </div>
              <p className="mt-3 text-[12px] font-black leading-tight text-white">{a.label}</p>
              <p className="mt-0.5 text-[10px] text-zinc-600">{a.sub}</p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Operação */}
      <div>
        <h2 className="mb-3 px-1 text-[10px] font-black uppercase tracking-[.14em] text-zinc-300">Operação</h2>
        <div className="space-y-2.5">
          {opActions.map((a, i) => (
            <motion.button
              key={a.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.04 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(a.path)}
              className="flex w-full items-center gap-4 rounded-[10px] border border-[#2b2631] bg-[#070a0f] p-4 transition hover:border-violet-500/35 hover:bg-[#0b0d13]"
            >
              <div className="grid h-10 w-10 place-items-center rounded-[8px] border border-violet-500/25 bg-violet-500/10">
                <a.icon className="h-4 w-4 text-[#ffb400]" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{a.label}</p>
                <p className="text-zinc-600 text-[11px]">{a.sub}</p>
              </div>
              <span className="text-zinc-700 text-lg">›</span>
            </motion.button>
          ))}
        </div>
      </div>

      <p className="text-center text-[10px] text-zinc-700 pt-4 pb-2">TOPAC RH PRO · Campo · GPS ativo</p>
    </div>
  );
};

export default CampoHomePage;
