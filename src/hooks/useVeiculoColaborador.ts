import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';

interface VeiculoData {
  veiculo_id: string | null;
  placa: string;
  modelo: string;
  identificacao_interna: string;
  loading: boolean;
}

export const useVeiculoColaborador = () => {
  const { session } = useApp();
  const [data, setData] = useState<VeiculoData>({ veiculo_id: null, placa: '', modelo: '', identificacao_interna: '', loading: true });

  useEffect(() => {
    if (!session?.user?.id) { setData(prev => ({ ...prev, loading: false })); return; }
    const fetch = async () => {
      const { data: cv } = await supabase
        .from('colaborador_veiculo')
        .select('veiculo_id, veiculos(id, placa, modelo, identificacao_interna)')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cv && cv.veiculos) {
        const v = cv.veiculos as any;
        setData({ veiculo_id: v.id, placa: v.placa, modelo: v.modelo, identificacao_interna: v.identificacao_interna || '', loading: false });
      } else {
        setData(prev => ({ ...prev, loading: false }));
      }
    };
    fetch();
  }, [session?.user?.id]);

  return data;
};
