import React, { useState, useRef } from 'react';
import { Camera, Keyboard, Loader2, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useVeiculoColaborador } from '@/hooks/useVeiculoColaborador';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';
import { toast } from 'sonner';

const RegistroKmPage: React.FC = () => {
  const { session } = useApp();
  const { getLocation } = useGeolocation();
  const veiculo = useVeiculoColaborador();
  const [modo, setModo] = useState<'escolha' | 'foto' | 'manual'>('escolha');
  const [kmValor, setKmValor] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const userName = session?.user?.user_metadata?.nome_completo || session?.user?.user_metadata?.full_name || 'Colaborador';

  const handleFotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFoto(file);
      setFotoPreview(URL.createObjectURL(file));
    }
  };

  const registrar = async () => {
    if (!kmValor.trim() || !veiculo.veiculo_id) { toast.error('Preencha a quilometragem'); return; }
    setLoading(true);
    try {
      const geo = await getLocation();
      let foto_url = '';

      if (foto) {
        const path = `${session!.user.id}/${Date.now()}-km.jpg`;
        const { error: upErr } = await supabase.storage.from('km-fotos').upload(path, foto);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('km-fotos').getPublicUrl(path);
        foto_url = urlData.publicUrl;
      }

      const now = new Date();
      const { error } = await supabase.from('registros_km').insert({
        user_id: session!.user.id,
        veiculo_id: veiculo.veiculo_id,
        km_valor: Number(kmValor),
        tipo_registro: modo === 'foto' ? 'foto' : 'manual',
        foto_url,
        latitude: geo.latitude,
        longitude: geo.longitude,
        data: now.toISOString().split('T')[0],
        hora: now.toTimeString().slice(0, 8),
      });
      if (error) throw error;

      setConfirmacao({
        titulo: 'KM registrado com sucesso!',
        detalhes: [
          { label: 'Colaborador', valor: userName },
          { label: 'Veículo', valor: `${veiculo.modelo} — ${veiculo.placa}` },
          { label: 'KM', valor: `${kmValor} km` },
          { label: 'Método', valor: modo === 'foto' ? 'Foto do painel' : 'Digitação manual' },
          { label: 'Data/Hora', valor: now.toLocaleString('pt-BR') },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ],
      });
      setKmValor('');
      setFoto(null);
      setFotoPreview(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar KM');
    } finally {
      setLoading(false);
    }
  };

  if (veiculo.loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (!veiculo.veiculo_id) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Gauge className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhum veículo vinculado</p>
      </div>
    );
  }

  if (modo === 'escolha') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold font-display text-foreground">Registro de KM</h2>
          <p className="text-xs text-muted-foreground">{veiculo.modelo} — {veiculo.placa}</p>
        </div>
        <p className="text-sm text-muted-foreground">Como deseja registrar?</p>
        <div className="grid grid-cols-1 gap-3">
          <Button onClick={() => setModo('foto')} variant="outline" className="h-20 rounded-2xl flex items-center gap-4 text-left justify-start px-6">
            <Camera className="w-8 h-8 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Foto do painel</p>
              <p className="text-xs text-muted-foreground">Tire uma foto legível do hodômetro</p>
            </div>
          </Button>
          <Button onClick={() => setModo('manual')} variant="outline" className="h-20 rounded-2xl flex items-center gap-4 text-left justify-start px-6">
            <Keyboard className="w-8 h-8 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Digitação manual</p>
              <p className="text-xs text-muted-foreground">Digite a quilometragem manualmente</p>
            </div>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="text-sm" onClick={() => setModo('escolha')}>← Voltar</Button>
      <h2 className="text-xl font-bold font-display text-foreground">
        {modo === 'foto' ? 'Foto do Painel' : 'Digitação Manual'}
      </h2>

      {modo === 'foto' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Tire uma foto nítida do hodômetro do veículo.</p>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoCapture} />
          <Button variant="outline" className="w-full h-32 rounded-2xl border-dashed" onClick={() => inputRef.current?.click()}>
            {fotoPreview ? (
              <img src={fotoPreview} alt="Foto do painel" className="h-full object-contain rounded-lg" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Camera className="w-8 h-8" />
                <span className="text-xs">Toque para tirar foto</span>
              </div>
            )}
          </Button>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-foreground block mb-1.5">Quilometragem (KM)</label>
        <Input type="number" placeholder="Ex: 45230" value={kmValor} onChange={e => setKmValor(e.target.value)} className="text-lg h-12" />
        {modo === 'manual' && <p className="text-[10px] text-muted-foreground mt-1">Registro identificado como manual</p>}
      </div>

      <Button className="w-full h-14 text-base font-semibold rounded-xl" onClick={registrar} disabled={loading || !kmValor.trim()}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
        Registrar KM
      </Button>

      <ConfirmacaoVisual open={!!confirmacao} onClose={() => { setConfirmacao(null); setModo('escolha'); }} titulo={confirmacao?.titulo || ''} detalhes={confirmacao?.detalhes || []} />
    </div>
  );
};

export default RegistroKmPage;
