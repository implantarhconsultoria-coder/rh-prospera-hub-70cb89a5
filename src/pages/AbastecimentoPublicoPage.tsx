import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Fuel, Camera, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface ValeInfo {
  id: string;
  codigo: string;
  posto_nome: string;
  posto_cnpj: string;
  posto_endereco: string;
  valor_limite: number | null;
  litros_limite: number | null;
}

const AbastecimentoPublicoPage: React.FC = () => {
  const { codigo = '' } = useParams<{ codigo: string }>();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string>('');
  const [vale, setVale] = useState<ValeInfo | null>(null);

  const [cpf, setCpf] = useState('');
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [combustivel, setCombustivel] = useState('Diesel S10');
  const [precoLitro, setPrecoLitro] = useState('');
  const [litros, setLitros] = useState('');
  const [valor, setValor] = useState('');
  const [fotoBomba, setFotoBomba] = useState<File | null>(null);
  const [fotoPainel, setFotoPainel] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [done, setDone] = useState(false);

  const refBomba = useRef<HTMLInputElement>(null);
  const refPainel = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('validar_qr_combustivel_publico', { p_codigo: codigo });
        if (error) throw error;
        const r: any = data;
        if (!r?.ok) {
          const mapa: Record<string, string> = {
            vale_invalido: 'QR Code inválido ou inexistente',
            vale_indisponivel: 'Este QR já foi utilizado ou está bloqueado',
            vale_vencido: 'Autorização vencida',
          };
          setErro(mapa[r?.error] || 'Autorização indisponível');
        } else {
          setVale(r.vale);
        }
      } catch (e: any) {
        setErro(e.message || 'Erro ao validar QR Code');
      } finally {
        setLoading(false);
      }
    })();
  }, [codigo]);

  // Auto-cálculo: preço × litros
  useEffect(() => {
    const p = Number(precoLitro.replace(',', '.'));
    const l = Number(litros.replace(',', '.'));
    if (p > 0 && l > 0) setValor((p * l).toFixed(2));
  }, [precoLitro, litros]);

  const uploadFoto = async (file: File, tipo: 'bomba' | 'painel'): Promise<string> => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `qr/${codigo}/${Date.now()}-${tipo}.${ext}`;
    const { error } = await supabase.storage.from('abastecimento-fotos').upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('abastecimento-fotos').getPublicUrl(path);
    return data.publicUrl;
  };

  const finalizar = async () => {
    if (!vale) return;
    if (!fotoBomba) return toast.error('Tire a foto da bomba');
    if (!fotoPainel) return toast.error('Tire a foto do painel/odômetro');
    const v = Number(valor.replace(',', '.'));
    const l = Number(litros.replace(',', '.'));
    const k = Number(km);
    if (!v || !l) return toast.error('Informe litros e valor');
    if (!k) return toast.error('Informe o KM atual');

    setSalvando(true);
    try {
      const [urlBomba, urlPainel] = await Promise.all([
        uploadFoto(fotoBomba, 'bomba'),
        uploadFoto(fotoPainel, 'painel'),
      ]);
      const { data, error } = await supabase.rpc('registrar_abastecimento_publico', {
        p_codigo: vale.codigo,
        p_cpf: cpf,
        p_placa: placa,
        p_km: k,
        p_valor: v,
        p_litros: l,
        p_combustivel: combustivel,
        p_foto_bomba_url: urlBomba,
        p_foto_painel_url: urlPainel,
      });
      if (error) throw error;
      const r: any = data;
      if (!r?.ok) throw new Error(r?.error || 'Erro');
      setDone(true);
      toast.success('Abastecimento registrado!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md w-full bg-card border rounded-2xl p-8 text-center shadow-lg">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <h1 className="text-lg font-bold mb-2">QR Code não disponível</h1>
          <p className="text-sm text-muted-foreground">{erro}</p>
          <p className="text-xs text-muted-foreground mt-4">Código: <strong>{codigo}</strong></p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
        <div className="max-w-md w-full bg-white border rounded-2xl p-8 text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4">
            <Check className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-xl font-bold mb-1">Abastecimento registrado!</h1>
          <p className="text-sm text-muted-foreground mb-4">Pode fechar esta página.</p>
          <div className="text-xs text-muted-foreground border-t pt-3">
            <div>Código: <strong>{vale?.codigo}</strong></div>
            <div>Posto: {vale?.posto_nome}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      <header className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-5 shadow-lg">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <Fuel className="w-7 h-7" />
          <div>
            <div className="text-xs uppercase tracking-wider opacity-90">Autorização TOPAC</div>
            <div className="font-bold text-lg">{vale?.codigo}</div>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-xs text-muted-foreground uppercase font-bold mb-1">Posto</div>
          <div className="font-bold">{vale?.posto_nome || '—'}</div>
          {vale?.posto_cnpj && <div className="text-xs text-muted-foreground">CNPJ: {vale.posto_cnpj}</div>}
          {vale?.posto_endereco && <div className="text-xs text-muted-foreground">{vale.posto_endereco}</div>}
          {(vale?.valor_limite || vale?.litros_limite) ? (
            <div className="text-xs mt-2 text-amber-700">
              Limite: {vale.valor_limite ? `R$ ${vale.valor_limite}` : ''} {vale.litros_limite ? `· ${vale.litros_limite} L` : ''}
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
          <div>
            <Label>CPF do mecânico (opcional)</Label>
            <Input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
          </div>
          <div>
            <Label>Placa do veículo</Label>
            <Input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-1D23" />
          </div>
          <div>
            <Label>KM atual *</Label>
            <Input value={km} onChange={e => setKm(e.target.value)} type="number" inputMode="numeric" placeholder="123456" />
          </div>
          <div>
            <Label>Combustível</Label>
            <select className="w-full h-10 rounded-md border px-3 text-sm" value={combustivel} onChange={e => setCombustivel(e.target.value)}>
              <option>Diesel S10</option>
              <option>Diesel S500</option>
              <option>Gasolina</option>
              <option>Etanol</option>
              <option>Arla 32</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Preço/L</Label>
              <Input value={precoLitro} onChange={e => setPrecoLitro(e.target.value)} inputMode="decimal" placeholder="6,29" />
            </div>
            <div>
              <Label>Litros *</Label>
              <Input value={litros} onChange={e => setLitros(e.target.value)} inputMode="decimal" placeholder="50,00" />
            </div>
            <div>
              <Label>Total *</Label>
              <Input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="314,50" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => refBomba.current?.click()}
            className={`p-4 rounded-xl border-2 ${fotoBomba ? 'border-emerald-500 bg-emerald-50' : 'border-dashed border-slate-300 bg-white'} flex flex-col items-center gap-1`}
          >
            <Camera className="w-6 h-6" />
            <span className="text-xs font-bold">Foto da bomba *</span>
            {fotoBomba && <span className="text-[10px] text-emerald-700">✓ ok</span>}
          </button>
          <button
            onClick={() => refPainel.current?.click()}
            className={`p-4 rounded-xl border-2 ${fotoPainel ? 'border-emerald-500 bg-emerald-50' : 'border-dashed border-slate-300 bg-white'} flex flex-col items-center gap-1`}
          >
            <Camera className="w-6 h-6" />
            <span className="text-xs font-bold">Foto do painel *</span>
            {fotoPainel && <span className="text-[10px] text-emerald-700">✓ ok</span>}
          </button>
          <input ref={refBomba} type="file" accept="image/*" capture="environment" hidden onChange={e => e.target.files?.[0] && setFotoBomba(e.target.files[0])} />
          <input ref={refPainel} type="file" accept="image/*" capture="environment" hidden onChange={e => e.target.files?.[0] && setFotoPainel(e.target.files[0])} />
        </div>

        <Button onClick={finalizar} disabled={salvando} className="w-full h-12 text-base bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90">
          {salvando ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Finalizar abastecimento'}
        </Button>

        <p className="text-[11px] text-center text-muted-foreground">
          Este link é uma autorização específica TOPAC. Não compartilhe.
        </p>
      </div>
    </div>
  );
};

export default AbastecimentoPublicoPage;
