import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, ClipboardList, Package, Gauge, LogIn, UtensilsCrossed, Coffee, LogOut as LogOutIcon, Car } from 'lucide-react';
import { useTecnicoApp } from '@/context/TecnicoAppContext';

const TIPO_LABELS: Record<string, string> = {
  entrada: 'Entrada registrada',
  almoco_saida: 'Saída para almoço',
  almoco_volta: 'Volta do almoço',
  saida: 'Saída do expediente',
};

const pontoActions = [
  { label: 'Bater Ponto', sub: 'Entrada com selfie', icon: LogIn, sub2: 'ponto?tipo=entrada', gradient: 'from-blue-500 to-blue-700' },
  { label: 'Saída Almoço', sub: 'Pausa', icon: UtensilsCrossed, sub2: 'ponto?tipo=almoco_saida', gradient: 'from-orange-500 to-amber-600' },
  { label: 'Volta Almoço', sub: 'Retorno', icon: Coffee, sub2: 'ponto?tipo=almoco_volta', gradient: 'from-emerald-500 to-green-600' },
  { label: 'Saída Expediente', sub: 'Fim do dia', icon: LogOutIcon, sub2: 'ponto?tipo=saida', gradient: 'from-rose-500 to-red-600' },
];

const opActions = [
  { label: 'Chamados', sub: 'Aceitar / executar', icon: ClipboardList, sub2: 'chamados', gradient: 'from-purple-500 to-fuchsia-600' },
  { label: 'Estoque do Carro', sub: 'Itens disponíveis', icon: Package, sub2: 'estoque', gradient: 'from-teal-500 to-cyan-600' },
  { label: 'Registro de KM', sub: 'Foto + valor', icon: Gauge, sub2: 'km', gradient: 'from-amber-500 to-yellow-600' },
];

const greeting = (nome?: string) => {
  const h = new Date().getHours();
  const prefix = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  return nome ? `${prefix}, ${nome.split(' ')[0]}` : prefix;
};

const MecanicoHomePage: React.FC = () => {
  const navigate = useNavigate();
  const { token = '' } = useParams<{ token: string }>();
  const { tecnico, call } = useTecnicoApp();
  const [ultimoPonto, setUltimoPonto] = useState<{ tipo: string; hora: string } | null>(null);
  const [chamadosAbertos, setChamadosAbertos] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await call('perfil');
        const last = (r.today || [])[0];
        if (last) setUltimoPonto({ tipo: last.tipo, hora: last.hora });
        else setUltimoPonto(null);
        setChamadosAbertos(r.chamados_abertos || 0);
      } catch { /* noop */ }
    })();
  }, [call]);

  const go = (sub: string) => navigate(`/m/${token}/${sub}`);
  const veic = tecnico.veiculos;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-gradient-to-br from-primary/20 via-blue-600/10 to-transparent border border-white/10 p-5 backdrop-blur-sm"
      >
        <p className="text-xs text-white/60 font-medium uppercase tracking-wider">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </p>
        <h1 className="text-2xl font-bold font-display text-white mt-1">{greeting(tecnico.apelido)}</h1>
        <p className="text-sm text-white/70 mt-1">Tudo pronto para mais um dia em campo.</p>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-white/50 text-[10px] uppercase font-semibold tracking-wider">
              <Clock className="w-3 h-3" /> Último ponto
            </div>
            <p className="text-white font-semibold text-sm mt-1">
              {ultimoPonto ? `${TIPO_LABELS[ultimoPonto.tipo] || ultimoPonto.tipo} · ${ultimoPonto.hora.slice(0, 5)}` : 'Nenhum hoje'}
            </p>
          </div>
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <div className="flex items-center gap-1.5 text-white/50 text-[10px] uppercase font-semibold tracking-wider">
              <ClipboardList className="w-3 h-3" /> Chamados
            </div>
            <p className="text-white font-semibold text-sm mt-1">{chamadosAbertos} em aberto</p>
          </div>
        </div>

        {veic?.placa && (
          <div className="mt-3 flex items-center gap-2 text-xs text-white/70 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
            <Car className="w-4 h-4 text-primary" />
            <span className="font-medium text-white">{veic.placa}</span>
            <span className="text-white/50">·</span>
            <span>{veic.modelo}</span>
            {veic.identificacao_interna && (
              <>
                <span className="text-white/50">·</span>
                <span className="text-white/60">{veic.identificacao_interna}</span>
              </>
            )}
          </div>
        )}
      </motion.div>

      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Ponto Digital</h2>
          <span className="text-[10px] text-white/40">Selfie obrigatória na entrada</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {pontoActions.map((a, i) => (
            <motion.button
              key={a.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => go(a.sub2)}
              className={`bg-gradient-to-br ${a.gradient} rounded-2xl p-4 text-left shadow-lg shadow-black/20 active:shadow-md transition-shadow relative overflow-hidden`}
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-xl -translate-y-4 translate-x-4" />
              <a.icon className="w-7 h-7 text-white drop-shadow" />
              <p className="text-white font-bold text-sm mt-3 leading-tight">{a.label}</p>
              <p className="text-white/80 text-[11px] mt-0.5">{a.sub}</p>
            </motion.button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-3 px-1">Operação</h2>
        <div className="space-y-2.5">
          {opActions.map((a, i) => (
            <motion.button
              key={a.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.04 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => go(a.sub2)}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-4 flex items-center gap-4 transition-colors"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${a.gradient} flex items-center justify-center shadow-lg`}>
                <a.icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-semibold text-sm">{a.label}</p>
                <p className="text-white/50 text-[11px]">{a.sub}</p>
              </div>
              <span className="text-white/30 text-lg">›</span>
            </motion.button>
          ))}
        </div>
      </div>

      <p className="text-center text-[10px] text-white/30 pt-4 pb-2">
        Topac Campo · acesso por link · GPS ativo
      </p>
    </div>
  );
};

export default MecanicoHomePage;
