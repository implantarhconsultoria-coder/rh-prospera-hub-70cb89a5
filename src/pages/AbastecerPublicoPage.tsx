import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Fuel, Camera, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

interface ValeData {
  id: string; codigo: string;
  posto_nome: string; posto_cnpj: string; posto_endereco: string;
  valor_limite: number; litros_limite: number;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });

const AbastecerPublicoPage: React.FC = () => {
  const { codigo: codigoParam } = useParams();
  const [loading, setLoading] = useState(true);
  const [vale, setVale] = useState<ValeData | null>(null);
  const [erro, setErro] = useState<string>('');
  const [cpf, setCpf] = useState('');
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [preco, setPreco] = useState('');
  const [litros, setLitros] = useState('');
  const [valor, setValor] = useState('');
  const [combustivel, setCombustivel] = useState('Diesel S10');
  const [fotoBomba, setFotoBomba] = useState<File | null>(null);
  const [fotoPainel, setFotoPainel] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [done, setDone] = useState(false);
  const fileBomba = useRef<HTMLInputElement>(null);
  const filePainel = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!codigoParam) return;
    (async () => {
      const { data, error } = await supabase.rpc('validar_qr_combustivel_publico', { p_codigo: codigoParam });
      setLoading(false);
      if (error) { setErro(error.message); return; }
      const r = data as any;
      if (!r?.ok) { setErro(r?.error || 'vale_invalido'); return; }
      setVale(r.vale as ValeData);
    })();
  }, [codigoParam]);

  // calcular total se preço + litros
  useEffect(() => {
    const p = Number(preco.replace(',', '.'));
    const l = Number(litros.replace(',', '.'));
    if (p > 0 && l > 0) setValor((p * l).toFixed(2).replace('.', ','));
  }, [preco, litros]);

  const finalizar = async () => {
    if (!vale) return;
    if (!cpf.replace(/\D/g, '')) { toast.error('Informe o CPF'); return; }
    if (!fotoBomba || !fotoPainel) { toast.error('Tire as duas fotos (bomba e painel)'); return; }
    const v = Number(valor.replace(',', '.'));
    const l = Number(litros.replace(',', '.'));
    if (!v || !l) { toast.error('Informe valor e litros'); return; }
    setSalvando(true);
    try {
      // upload fotos -> bucket abastecimento-fotos (já existe)
      const uploadFoto = async (file: File, prefix: string) => {
        const path = `qr/${vale.codigo}/${Date.now()}-${prefix}.jpg`;
        const { error } = await supabase.storage.from('abastecimento-fotos').upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        const { data: signed } = await supabase.storage.from('abastecimento-fotos').createSignedUrl(path, 60 * 60 * 24 * 365);
        return signed?.signedUrl || '';
      };
      const urlBomba = await uploadFoto(fotoBomba, 'bomba');
      const urlPainel = await uploadFoto(fotoPainel, 'painel');

      const { data, error } = await supabase.rpc('registrar_abastecimento_publico', {
        p_codigo: vale.codigo, p_cpf: cpf, p_placa: placa, p_km: km ? Number(km) : null,
        p_valor: v, p_litros: l, p_combustivel: combustivel,
        p_foto_bomba_url: urlBomba, p_foto_painel_url: urlPainel,
      });
      if (error) throw error;
      const r = data as any;
      if (!r?.ok) throw new Error(r?.error || 'falha');
      setDone(true);
      toast.success('Abastecimento registrado!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (erro || !vale) {
    const msg = erro === 'vale_invalido' ? 'QR Code não encontrado.' :
      erro === 'vale_indisponivel' ? 'Esta autorização já foi utilizada ou está bloqueada.' :
      erro === 'vale_vencido' ? 'Autorização vencida.' : 'Não foi possível abrir esta autorização.';
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold">{msg}</h1>
          <p className="text-sm text-muted-foreground">Código: {codigoParam}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full text-center space-y-3">
          <CheckCircle2 className="w-16 h-16 text-success mx-auto" />
          <h1 className="text-2xl font-bold">Tudo certo!</h1>
          <p className="text-sm text-muted-foreground">Abastecimento {vale.codigo} registrado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-md mx-auto space-y-5">
        <div className="bg-primary text-primary-foreground rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <Fuel className="w-7 h-7" />
            <div>
              <p className="text-xs opacity-80">TOPAC · Autorização</p>
              <p className="font-bold text-lg">{vale.codigo}</p>
            </div>
          </div>
          <div className="mt-3 text-xs space-y-0.5 opacity-90">
            <p><strong>Posto:</strong> {vale.posto_nome || '—'}</p>
            <p><strong>CNPJ:</strong> {vale.posto_cnpj || '—'}</p>
            <p><strong>Endereço:</strong> {vale.posto_endereco || '—'}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="CPF do funcionário" value={cpf} onChange={setCpf} placeholder="000.000.000-00" />
          <Field label="Placa do veículo" value={placa} onChange={(v) => setPlaca(v.toUpperCase())} placeholder="ABC1D23" />
          <Field label="KM atual do painel" value={km} onChange={setKm} placeholder="0" inputMode="numeric" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preço por litro" value={preco} onChange={setPreco} placeholder="5,89" />
            <Field label="Litros" value={litros} onChange={setLitros} placeholder="0,00" />
          </div>
          <Field label="Valor total (R$)" value={valor} onChange={setValor} placeholder="0,00" />
          <Field label="Combustível" value={combustivel} onChange={setCombustivel} />

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="outline" className="h-20 flex-col gap-1" onClick={() => fileBomba.current?.click()}>
              <Camera className="w-5 h-5" />
              <span className="text-xs">{fotoBomba ? '✓ Bomba' : 'Foto da bomba'}</span>
            </Button>
            <Button type="button" variant="outline" className="h-20 flex-col gap-1" onClick={() => filePainel.current?.click()}>
              <Camera className="w-5 h-5" />
              <span className="text-xs">{fotoPainel ? '✓ Painel' : 'Foto do painel'}</span>
            </Button>
          </div>
          <input ref={fileBomba} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFotoBomba(f); }} />
          <input ref={filePainel} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFotoPainel(f); }} />

          <Button onClick={finalizar} disabled={salvando} className="w-full h-14 font-bold text-base">
            {salvando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
            Salvar abastecimento
          </Button>
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: any }> = ({ label, value, onChange, placeholder, inputMode }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} className="mt-1" />
  </div>
);

export default AbastecerPublicoPage;
