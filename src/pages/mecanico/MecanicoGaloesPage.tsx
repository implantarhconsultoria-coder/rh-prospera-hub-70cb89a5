import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Droplet, Camera, Loader2, Receipt, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useTecnicoApp } from '@/context/TecnicoAppContext';
import { getBrowserLocation } from '@/lib/browserGeo';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';

const blobToBase64 = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(b);
  });

interface GaloesItem {
  id: string;
  tipo_combustivel: string;
  quantidade_litros: number;
  placa: string;
  observacao: string;
  foto_url: string;
  data: string;
  hora: string;
  created_at: string;
}

const TIPOS = [
  { v: 'gasolina', l: 'Gasolina' },
  { v: 'diesel', l: 'Diesel' },
  { v: 'diesel_s10', l: 'Diesel S10' },
  { v: 'etanol', l: 'Etanol' },
];

const MecanicoGaloesPage: React.FC = () => {
  const { tecnico, veiculoSelecionado, call } = useTecnicoApp();
  const [tipo, setTipo] = useState('gasolina');
  const [litros, setLitros] = useState('');
  const [obs, setObs] = useState('');
  const [foto, setFoto] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentes, setRecentes] = useState<GaloesItem[]>([]);
  const [confirm, setConfirm] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      const r: any = await call('listar_galoes');
      setRecentes(r.galoes || []);
    } catch { /* noop */ }
  };

  useEffect(() => { reload(); }, []);

  const onFile = (f: File) => {
    setFoto(f);
    setFotoUrl(URL.createObjectURL(f));
  };

  const reset = () => {
    setLitros(''); setObs(''); setFoto(null); setFotoUrl('');
  };

  const salvar = async () => {
    const l = Number(litros.replace(',', '.'));
    if (!l || l <= 0) { toast.error('Informe a quantidade em litros'); return; }
    setLoading(true);
    try {
      const geo = await getBrowserLocation();
      const foto64 = foto ? await blobToBase64(foto) : undefined;
      await call('registrar_galao', {
        tipo_combustivel: tipo,
        quantidade_litros: l,
        observacao: obs,
        foto_base64: foto64,
        latitude: geo.latitude,
        longitude: geo.longitude,
      });
      setConfirm({
        titulo: 'Retirada do galão registrada',
        detalhes: [
          { label: 'Motorista', valor: tecnico?.funcionarios?.nome || tecnico?.apelido || '—' },
          { label: 'Veículo', valor: veiculoSelecionado ? `${veiculoSelecionado.modelo} — ${veiculoSelecionado.placa}` : '—' },
          { label: 'Combustível', valor: TIPOS.find(t => t.v === tipo)?.l || tipo },
          { label: 'Quantidade', valor: `${l.toFixed(2).replace('.', ',')} L` },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ],
      });
      reset();
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold font-display text-white flex items-center gap-2">
          <Droplet className="w-6 h-6 text-amber-400" /> Combustível dos Galões
        </h2>
        <p className="text-sm text-white/60 mt-1">Retirada interna · separado do abastecimento de posto</p>
      </div>

      <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3 text-xs text-amber-200 flex gap-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Use este fluxo apenas para retirada de combustível dos galões internos. Para posto, use <strong>Abastecimento (QR)</strong>.</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-white/50 uppercase font-semibold">Motorista</p>
              <p className="text-white font-medium">{tecnico?.funcionarios?.nome || tecnico?.apelido}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/50 uppercase font-semibold">Veículo</p>
              <p className="text-white font-medium">{veiculoSelecionado?.placa || '—'} {veiculoSelecionado?.modelo ? `· ${veiculoSelecionado.modelo}` : ''}</p>
            </div>
          </div>
        </div>

        <div>
          <Label className="text-white/70 text-xs">Tipo de combustível</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {TIPOS.map(t => (
              <button
                key={t.v}
                onClick={() => setTipo(t.v)}
                className={`rounded-xl py-3 px-2 text-sm font-semibold border transition-colors ${
                  tipo === t.v
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-100'
                    : 'bg-white/5 border-white/10 text-white/70'
                }`}
              >{t.l}</button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-white/70 text-xs">Quantidade (litros)</Label>
          <Input
            inputMode="decimal"
            value={litros}
            onChange={(e) => setLitros(e.target.value)}
            placeholder="0,00"
            className="bg-white/5 border-white/10 text-white mt-1 text-lg font-bold"
          />
        </div>

        <div>
          <Label className="text-white/70 text-xs">Observação (opcional)</Label>
          <Textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex: serviço na obra X"
            className="bg-white/5 border-white/10 text-white mt-1"
            rows={2}
          />
        </div>

        <div>
          <Label className="text-white/70 text-xs">Foto (opcional)</Label>
          {fotoUrl ? (
            <div className="mt-1 space-y-2">
              <img src={fotoUrl} alt="galão" className="w-full rounded-xl border border-white/10 max-h-48 object-cover" />
              <Button variant="outline" size="sm" onClick={() => { setFoto(null); setFotoUrl(''); }} className="bg-white/5 border-white/10 text-white">
                Remover foto
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="w-full mt-1 bg-white/5 border-white/10 text-white"
            >
              <Camera className="w-4 h-4 mr-2" /> Adicionar foto
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </div>

        <Button
          onClick={salvar}
          disabled={loading}
          className="w-full h-14 bg-gradient-to-br from-amber-500 to-yellow-700 text-white rounded-2xl border-0 font-semibold"
        >
          {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Receipt className="w-5 h-5 mr-2" />}
          Registrar retirada
        </Button>
      </motion.div>

      {recentes.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2 px-1">Últimas retiradas</h3>
          <div className="space-y-2">
            {recentes.slice(0, 5).map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                {r.foto_url ? (
                  <img src={r.foto_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Droplet className="w-5 h-5 text-amber-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold">
                    {Number(r.quantidade_litros).toFixed(2)} L · {TIPOS.find(t => t.v === r.tipo_combustivel)?.l || r.tipo_combustivel}
                  </p>
                  <p className="text-white/50 text-[11px]">{r.placa} · {new Date(r.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmacaoVisual
        open={!!confirm}
        onClose={() => setConfirm(null)}
        titulo={confirm?.titulo || ''}
        detalhes={confirm?.detalhes || []}
      />
    </div>
  );
};

export default MecanicoGaloesPage;
