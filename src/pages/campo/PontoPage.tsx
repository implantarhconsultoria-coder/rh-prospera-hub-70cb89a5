import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, UtensilsCrossed, Coffee, LogOut, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useVeiculoColaborador } from '@/hooks/useVeiculoColaborador';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';

const TIPOS = [
  { tipo: 'entrada', label: 'Bater Ponto', sublabel: 'Entrada', icon: LogIn, color: 'bg-blue-500 hover:bg-blue-600' },
  { tipo: 'almoco_saida', label: 'Saída Almoço', sublabel: 'Almoço — Saída', icon: UtensilsCrossed, color: 'bg-orange-500 hover:bg-orange-600' },
  { tipo: 'almoco_volta', label: 'Volta Almoço', sublabel: 'Almoço — Retorno', icon: Coffee, color: 'bg-green-500 hover:bg-green-600' },
  { tipo: 'saida', label: 'Saída Expediente', sublabel: 'Fim do dia', icon: LogOut, color: 'bg-red-500 hover:bg-red-600' },
];

const TIPO_LABELS: Record<string, string> = {
  entrada: 'Entrada',
  almoco_saida: 'Saída para Almoço',
  almoco_volta: 'Volta do Almoço',
  saida: 'Saída do Expediente',
};

const PontoPage: React.FC = () => {
  const { session } = useApp();
  const { getLocation } = useGeolocation();
  const veiculo = useVeiculoColaborador();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);
  const [searchParams] = useSearchParams();
  const tipoParam = searchParams.get('tipo');

  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || 'Colaborador';

  const registrar = async (tipo: string) => {
    setLoading(tipo);
    try {
      const geo = await getLocation();
      const now = new Date();
      const data = now.toISOString().split('T')[0];
      const hora = now.toTimeString().slice(0, 8);

      const { error } = await supabase.from('registros_ponto').insert({
        user_id: session!.user.id,
        tipo,
        data,
        hora,
        latitude: geo.latitude,
        longitude: geo.longitude,
        veiculo_id: veiculo.veiculo_id,
      });

      if (error) throw error;

      setConfirmacao({
        titulo: 'Ponto registrado com sucesso!',
        detalhes: [
          { label: 'Colaborador', valor: userName },
          { label: 'Tipo', valor: TIPO_LABELS[tipo] || tipo },
          { label: 'Data', valor: new Date().toLocaleDateString('pt-BR') },
          { label: 'Hora', valor: hora },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
          ...(veiculo.placa ? [{ label: 'Veículo', valor: `${veiculo.modelo} — ${veiculo.placa}` }] : []),
        ],
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar ponto');
    } finally {
      setLoading(null);
    }
  };

  // If came with tipo param, show only that button prominently
  const filteredTipos = tipoParam ? TIPOS.filter(t => t.tipo === tipoParam) : TIPOS;
  const showAll = !tipoParam;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold font-display text-foreground">Controle de Ponto</h2>
        <p className="text-sm text-muted-foreground">Registre seu ponto com geolocalização</p>
      </div>

      <div className={showAll ? "grid grid-cols-1 gap-3" : "flex flex-col items-center gap-4"}>
        {filteredTipos.map((t, i) => (
          <motion.div key={t.tipo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Button
              onClick={() => registrar(t.tipo)}
              disabled={!!loading}
              className={`w-full h-20 text-white text-base font-semibold rounded-2xl shadow-md ${t.color} flex items-center justify-center gap-3`}
            >
              {loading === t.tipo ? <Loader2 className="w-6 h-6 animate-spin" /> : <t.icon className="w-6 h-6" />}
              <div className="text-left">
                <div>{t.label}</div>
                <div className="text-xs font-normal opacity-80">{t.sublabel}</div>
              </div>
            </Button>
          </motion.div>
        ))}
      </div>

      {!showAll && (
        <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
          Ver todas as opções
        </Button>
      )}

      <ConfirmacaoVisual
        open={!!confirmacao}
        onClose={() => setConfirmacao(null)}
        titulo={confirmacao?.titulo || ''}
        detalhes={confirmacao?.detalhes || []}
      />
    </div>
  );
};

export default PontoPage;
