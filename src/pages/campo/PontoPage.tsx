import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, UtensilsCrossed, Coffee, LogOut, Loader2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useVeiculoColaborador } from '@/hooks/useVeiculoColaborador';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';
import SelfieCapture from '@/components/SelfieCapture';
import { toast } from 'sonner';
import { useSearchParams, useNavigate } from 'react-router-dom';

const TIPOS = [
  { tipo: 'entrada', label: 'Bater Ponto', sublabel: 'Entrada · selfie obrigatória', icon: LogIn, gradient: 'from-blue-500 to-blue-700' },
  { tipo: 'almoco_saida', label: 'Saída Almoço', sublabel: 'Início da pausa', icon: UtensilsCrossed, gradient: 'from-orange-500 to-amber-600' },
  { tipo: 'almoco_volta', label: 'Volta Almoço', sublabel: 'Retorno', icon: Coffee, gradient: 'from-emerald-500 to-green-600' },
  { tipo: 'saida', label: 'Saída Expediente', sublabel: 'Fim do dia', icon: LogOut, gradient: 'from-rose-500 to-red-600' },
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);
  const [selfieFor, setSelfieFor] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const tipoParam = searchParams.get('tipo');

  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'Colaborador';

  const persistRegistro = async (tipo: string, selfieUrl?: string) => {
    const geo = await getLocation();
    const now = new Date();
    const data = now.toISOString().split('T')[0];
    const hora = now.toTimeString().slice(0, 8);

    const { error } = await (supabase as any).from('registros_ponto').insert({
      user_id: session!.user.id,
      tipo,
      data,
      hora,
      latitude: geo.latitude,
      longitude: geo.longitude,
      veiculo_id: veiculo.veiculo_id,
      selfie_url: selfieUrl || null,
    });
    if (error) throw error;

    setConfirmacao({
      titulo: 'Ponto registrado com sucesso!',
      detalhes: [
        { label: 'Colaborador', valor: userName },
        { label: 'Tipo', valor: TIPO_LABELS[tipo] || tipo },
        { label: 'Data', valor: new Date().toLocaleDateString('pt-BR') },
        { label: 'Hora', valor: hora },
        ...(selfieUrl ? [{ label: 'Selfie', valor: '✓ Capturada' }] : []),
        ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ...(veiculo.placa ? [{ label: 'Veículo', valor: `${veiculo.modelo} — ${veiculo.placa}` }] : []),
      ],
    });
  };

  const registrar = async (tipo: string) => {
    // Entrada exige selfie
    if (tipo === 'entrada') {
      setSelfieFor(tipo);
      return;
    }
    setLoading(tipo);
    try {
      await persistRegistro(tipo);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar ponto');
    } finally {
      setLoading(null);
    }
  };

  const handleSelfieCapture = async (blob: Blob) => {
    if (!selfieFor || !session?.user?.id) return;
    setLoading(selfieFor);
    try {
      const path = `${session.user.id}/${Date.now()}-${selfieFor}.jpg`;
      const { error: upErr } = await supabase.storage.from('ponto-selfies').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('ponto-selfies').getPublicUrl(path);
      await persistRegistro(selfieFor, pub.publicUrl);
      setSelfieFor(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar ponto');
      throw err;
    } finally {
      setLoading(null);
    }
  };

  const filteredTipos = tipoParam ? TIPOS.filter(t => t.tipo === tipoParam) : TIPOS;
  const showAll = !tipoParam;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold font-display text-white">Controle de Ponto</h2>
        <p className="text-sm text-white/60 mt-1">Geolocalização ativa · entrada com selfie</p>
      </div>

      <div className="space-y-3">
        {filteredTipos.map((t, i) => (
          <motion.div key={t.tipo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Button
              onClick={() => registrar(t.tipo)}
              disabled={!!loading}
              className={`w-full h-20 bg-gradient-to-br ${t.gradient} hover:opacity-95 text-white text-base font-semibold rounded-2xl shadow-lg shadow-black/30 flex items-center justify-start gap-4 px-5 relative overflow-hidden border-0`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -translate-y-6 translate-x-6" />
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm relative">
                {loading === t.tipo ? <Loader2 className="w-6 h-6 animate-spin" /> : <t.icon className="w-6 h-6" />}
                {t.tipo === 'entrada' && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center border-2 border-white">
                    <Camera className="w-2.5 h-2.5 text-amber-900" />
                  </div>
                )}
              </div>
              <div className="text-left flex-1 relative">
                <div className="font-bold leading-tight">{t.label}</div>
                <div className="text-xs font-normal opacity-90 mt-0.5">{t.sublabel}</div>
              </div>
            </Button>
          </motion.div>
        ))}
      </div>

      {!showAll && (
        <Button variant="outline" className="w-full bg-white/5 text-white border-white/10 hover:bg-white/10" onClick={() => navigate('/campo/ponto')}>
          Ver todas as opções
        </Button>
      )}

      <SelfieCapture
        open={!!selfieFor}
        onClose={() => setSelfieFor(null)}
        onCapture={handleSelfieCapture}
        title="Selfie de Entrada"
      />

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
