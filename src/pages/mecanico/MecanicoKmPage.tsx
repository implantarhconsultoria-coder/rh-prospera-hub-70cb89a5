import React, { useState, useRef } from 'react';
import { Camera, Keyboard, Loader2, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useTecnicoApp } from '@/context/TecnicoAppContext';
import { getBrowserLocation } from '@/lib/browserGeo';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });

const MecanicoKmPage: React.FC = () => {
  const { tecnico, call } = useTecnicoApp();
  const [modo, setModo] = useState<'escolha' | 'foto' | 'manual'>('escolha');
  const [kmValor, setKmValor] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const v = tecnico.veiculos;

  if (!tecnico.veiculo_id || !v) {
    return (
      <div className="text-center py-12 text-white/70">
        <Gauge className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhum veículo vinculado</p>
      </div>
    );
  }

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFoto(f); setFotoPreview(URL.createObjectURL(f)); }
  };

  const registrar = async () => {
    if (!kmValor.trim()) { toast.error('Preencha a quilometragem'); return; }
    setLoading(true);
    try {
      const geo = await getBrowserLocation();
      const payload: any = { km_valor: Number(kmValor), latitude: geo.latitude, longitude: geo.longitude };
      if (foto) payload.foto_base64 = await fileToBase64(foto);
      await call('registrar_km', payload);
      const now = new Date();
      setConfirmacao({
        titulo: 'KM registrado com sucesso!',
        detalhes: [
          { label: 'Colaborador', valor: tecnico.apelido },
          { label: 'Veículo', valor: `${v.modelo} — ${v.placa}` },
          { label: 'KM', valor: `${kmValor} km` },
          { label: 'Método', valor: modo === 'foto' ? 'Foto do painel' : 'Digitação manual' },
          { label: 'Data/Hora', valor: now.toLocaleString('pt-BR') },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ],
      });
      setKmValor(''); setFoto(null); setFotoPreview(null);
    } catch (e: any) { toast.error(e.message || 'Erro ao registrar KM'); }
    finally { setLoading(false); }
  };

  if (modo === 'escolha') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold font-display text-white">Registro de KM</h2>
          <p className="text-xs text-white/60">{v.modelo} — {v.placa}</p>
        </div>
        <p className="text-sm text-white/70">Como deseja registrar?</p>
        <div className="grid grid-cols-1 gap-3">
          <Button onClick={() => setModo('foto')} variant="outline" className="h-20 rounded-2xl flex items-center gap-4 text-left justify-start px-6 bg-white/5 text-white border-white/10 hover:bg-white/10">
            <Camera className="w-8 h-8 text-primary" />
            <div>
              <p className="font-semibold text-white">Foto do painel</p>
              <p className="text-xs text-white/60">Tire uma foto legível do hodômetro</p>
            </div>
          </Button>
          <Button onClick={() => setModo('manual')} variant="outline" className="h-20 rounded-2xl flex items-center gap-4 text-left justify-start px-6 bg-white/5 text-white border-white/10 hover:bg-white/10">
            <Keyboard className="w-8 h-8 text-primary" />
            <div>
              <p className="font-semibold text-white">Digitação manual</p>
              <p className="text-xs text-white/60">Digite a quilometragem manualmente</p>
            </div>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="text-sm text-white/70 hover:text-white hover:bg-white/10" onClick={() => setModo('escolha')}>← Voltar</Button>
      <h2 className="text-xl font-bold font-display text-white">{modo === 'foto' ? 'Foto do Painel' : 'Digitação Manual'}</h2>

      {modo === 'foto' && (
        <div className="space-y-3">
          <p className="text-xs text-white/60">Tire uma foto nítida do hodômetro do veículo.</p>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
          <Button variant="outline" className="w-full h-32 rounded-2xl border-dashed bg-white/5 border-white/20 hover:bg-white/10" onClick={() => inputRef.current?.click()}>
            {fotoPreview ? (
              <img src={fotoPreview} alt="Foto do painel" className="h-full object-contain rounded-lg" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/70">
                <Camera className="w-8 h-8" />
                <span className="text-xs">Toque para tirar foto</span>
              </div>
            )}
          </Button>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-white block mb-1.5">Quilometragem (KM)</label>
        <Input type="number" placeholder="Ex: 45230" value={kmValor} onChange={(e) => setKmValor(e.target.value)} className="text-lg h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40" />
        {modo === 'manual' && <p className="text-[10px] text-white/50 mt-1">Registro identificado como manual</p>}
      </div>

      <Button className="w-full h-14 text-base font-semibold rounded-xl" onClick={registrar} disabled={loading || !kmValor.trim()}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
        Registrar KM
      </Button>

      <ConfirmacaoVisual open={!!confirmacao} onClose={() => { setConfirmacao(null); setModo('escolha'); }} titulo={confirmacao?.titulo || ''} detalhes={confirmacao?.detalhes || []} />
    </div>
  );
};

export default MecanicoKmPage;
