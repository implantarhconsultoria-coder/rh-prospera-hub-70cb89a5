import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, ClipboardList, Gauge, Fuel, History, Calendar } from 'lucide-react';
import { useTecnicoApp } from '@/context/TecnicoAppContext';

type Filter = 'todos' | 'ponto' | 'chamado' | 'km' | 'abastecimento';

const TIPO_PONTO: Record<string, string> = {
  entrada: 'Entrada',
  almoco_saida: 'Saída almoço',
  almoco_volta: 'Volta almoço',
  saida: 'Saída expediente',
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

const MecanicoHistoricoPage: React.FC = () => {
  const { call } = useTecnicoApp();
  const [filter, setFilter] = useState<Filter>('todos');
  const [mes, setMes] = useState<string>(currentMonth());
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r: any = await call('historico', { tipo: filter, mes });
        setItems(r.historico || []);
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, [call, filter, mes]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold font-display text-white flex items-center gap-2">
          <History className="w-6 h-6 text-primary" /> Histórico
        </h2>
        <p className="text-sm text-white/60 mt-1">Pontos, chamados, KM e abastecimentos do mês</p>
      </div>

      {/* Mês */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
        <Calendar className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <p className="text-[10px] text-white/50 uppercase font-semibold tracking-wider">Mês</p>
          <p className="text-sm text-white font-semibold capitalize">{monthLabel(mes)}</p>
        </div>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value || currentMonth())}
          max={currentMonth()}
          className="bg-white/10 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label="Selecionar mês"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2">
        {(['todos','ponto','chamado','km','abastecimento'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border ${
              filter === f ? 'bg-primary text-white border-primary' : 'bg-white/5 text-white/70 border-white/10'
            }`}
          >
            {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p className="text-white/50 text-sm text-center py-6">Carregando…</p>}
      {!loading && items.length === 0 && <p className="text-white/50 text-sm text-center py-6">Nenhum registro neste mês</p>}

      <div className="space-y-2">
        {items.map((it, idx) => {
          const date = new Date(it.created_at).toLocaleString('pt-BR');
          return (
            <motion.div key={`${it._kind}-${it.id}-${idx}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                {it._kind === 'ponto' && <Clock className="w-5 h-5 text-blue-400" />}
                {it._kind === 'chamado' && <ClipboardList className="w-5 h-5 text-purple-400" />}
                {it._kind === 'km' && <Gauge className="w-5 h-5 text-amber-400" />}
                {it._kind === 'abastecimento' && <Fuel className="w-5 h-5 text-orange-400" />}
              </div>
              <div className="flex-1 min-w-0">
                {it._kind === 'ponto' && (
                  <>
                    <p className="text-white text-sm font-semibold">{TIPO_PONTO[it.tipo] || it.tipo}</p>
                    <p className="text-white/50 text-[11px]">{date}</p>
                  </>
                )}
                {it._kind === 'chamado' && (
                  <>
                    <p className="text-white text-sm font-semibold truncate">{it.cliente || 'Chamado'} — {it.status}</p>
                    <p className="text-white/50 text-[11px] truncate">{it.tipo_servico} · {date}</p>
                  </>
                )}
                {it._kind === 'km' && (
                  <>
                    <p className="text-white text-sm font-semibold">KM: {it.km_valor}</p>
                    <p className="text-white/50 text-[11px]">{date}</p>
                  </>
                )}
                {it._kind === 'abastecimento' && (
                  <>
                    <p className="text-white text-sm font-semibold">R$ {Number(it.valor).toFixed(2)} · {Number(it.litros).toFixed(2)} L</p>
                    <p className="text-white/50 text-[11px]">{it.placa} · {date}</p>
                  </>
                )}
              </div>
              {(it.foto_bomba_url || it.foto_url || it.selfie_url) && (
                <img src={it.foto_bomba_url || it.foto_url || it.selfie_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default MecanicoHistoricoPage;
