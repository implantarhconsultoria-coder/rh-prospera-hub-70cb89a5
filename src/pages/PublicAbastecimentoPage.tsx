/**
 * Tela pública aberta pelo QR Code (sem login).
 * URL: /abastecimento/:codigo  (ex: /abastecimento/TOPAC-ABAST-032)
 *
 * Fluxo:
 *  1. Carrega dados da autorização (posto, veículo, empresa) via RPC pública.
 *  2. Pede CPF do mecânico (opcional para identificar) + foto da bomba + foto do painel.
 *  3. Salva via RPC registrar_abastecimento_publico (não exige login).
 */
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Fuel, Camera, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface DadosVale {
  vale: { id: string; codigo: string; valor_limite: number; litros_limite: number; validade?: string };
  posto?: { nome: string; cnpj: string; endereco: string };
  veiculo?: { id: string; placa: string; modelo: string } | null;
  empresa?: { id: string; nome: string } | null;
  agora: string;
}

const uploadFoto = async (blob: Blob, prefixo: string): Promise<string> => {
  const path = `qr/${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from('abastecimento-fotos')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
};

const PublicAbastecimentoPage: React.FC = () => {
  const { codigo = '' } = useParams<{ codigo: string }>();
  const [dados, setDados] = useState<DadosVale | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [done, setDone] = useState(false);

  // form
  const [cpf, setCpf] = useState('');
  const [placa, setPlaca] = useState('');
  const [km, setKm] = useState('');
  const [precoLitro, setPrecoLitro] = useState('');
  const [litros, setLitros] = useState('');
  const [combustivel, setCombustivel] = useState('Diesel S10');
  const [observacao, setObservacao] = useState('');
  const [fotoBomba, setFotoBomba] = useState<File | null>(null);
  const [fotoPainel, setFotoPainel] = useState<File | null>(null);

  const refBomba = useRef<HTMLInputElement>(null);
  const refPainel = useRef<HTMLInputElement>(null);

  const valorTotal = (() => {
    const p = parseFloat((precoLitro || '0').replace(',', '.'));
    const l = parseFloat((litros || '0').replace(',', '.'));
    if (!p || !l) return 0;
    return p * l;
  })();

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('qr_abastecimento_dados', { p_codigo: codigo });
        if (error) throw error;
        if (!data?.ok) {
          const map: Record<string, string> = {
            qr_nao_encontrado: 'QR Code não encontrado.',
            qr_bloqueado: 'QR Code bloqueado pelo administrador.',
            // Compatibilidade com mensagens antigas
            vale_invalido: 'QR Code não encontrado.',
            vale_indisponivel: 'QR Code bloqueado pelo administrador.',
            vale_vencido: 'QR Code bloqueado pelo administrador.',
          };
          setErro(map[data?.error] || 'Não foi possível abrir este QR Code.');
        } else {
          setDados(data as DadosVale);
          if (data.veiculo?.placa) setPlaca(data.veiculo.placa);
        }
      } catch (e: any) {
        setErro(e.message || 'Erro ao carregar autorização.');
      } finally {
        setLoading(false);
      }
    })();
  }, [codigo]);

  const finalizar = async () => {
    if (!fotoBomba) return toast.error('Foto da bomba é obrigatória');
    if (!fotoPainel) return toast.error('Foto do painel/odômetro é obrigatória');
    if (!km) return toast.error('Informe o KM atual');
    if (!precoLitro || !litros) return toast.error('Informe preço por litro e litros');

    setSalvando(true);
    try {
      const [pathBomba, pathPainel] = await Promise.all([
        uploadFoto(fotoBomba, 'bomba'),
        uploadFoto(fotoPainel, 'painel'),
      ]);

      const { data, error } = await (supabase as any).rpc('registrar_abastecimento_publico', {
        p_codigo: codigo,
        p_cpf: cpf || '',
        p_placa: placa || dados?.veiculo?.placa || '',
        p_km: Number(km),
        p_valor: Number(valorTotal.toFixed(2)),
        p_litros: parseFloat(litros.replace(',', '.')),
        p_combustivel: combustivel,
        p_foto_bomba_url: pathBomba,
        p_foto_painel_url: pathPainel,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao salvar');

      // Anexa observação e preço por litro num update direto (campos existentes)
      if (observacao && data?.id) {
        await supabase.from('abastecimentos').update({
          observacao_conferencia: observacao,
        } as any).eq('id', data.id);
      }

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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-rose-500/10 border border-rose-400/40 rounded-2xl p-6 max-w-md text-center">
          <AlertTriangle className="w-10 h-10 text-rose-300 mx-auto mb-3" />
          <h1 className="text-white text-xl font-bold mb-2">Não foi possível abrir</h1>
          <p className="text-rose-200 text-sm">{erro}</p>
          <p className="text-white/40 text-xs mt-4 font-mono">{codigo}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-emerald-900/40 flex items-center justify-center p-4">
        <div className="bg-emerald-500/10 border border-emerald-400/40 rounded-2xl p-8 max-w-md text-center text-white">
          <div className="w-16 h-16 rounded-full bg-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Abastecimento enviado!</h1>
          <p className="text-emerald-200 text-sm mb-1">Autorização <span className="font-mono">{codigo}</span></p>
          <p className="text-white/60 text-xs mt-4">Pode fechar esta tela.</p>
        </div>
      </div>
    );
  }

  if (!dados) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <header className="text-center pt-4 pb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
            <Fuel className="w-3 h-3" /> Autorização TOPAC-ABAST
          </div>
          <h1 className="text-xl font-bold mt-2">{dados.vale.codigo}</h1>
        </header>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 text-sm">
          {dados.posto?.nome && (
            <Info label="Posto" valor={dados.posto.nome} />
          )}
          {dados.posto?.cnpj && <Info label="CNPJ" valor={dados.posto.cnpj} />}
          {dados.posto?.endereco && <Info label="Endereço" valor={dados.posto.endereco} />}
          {dados.empresa?.nome && <Info label="Empresa" valor={dados.empresa.nome} />}
          {dados.veiculo && (
            <Info label="Veículo" valor={`${dados.veiculo.modelo} — ${dados.veiculo.placa}`} />
          )}
          <Info label="Data/hora" valor={new Date(dados.agora).toLocaleString('pt-BR')} />
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-white/70">CPF do mecânico (opcional)</Label>
            <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00"
              className="bg-white/5 border-white/10 text-white" />
          </div>
          {!dados.veiculo && (
            <div>
              <Label className="text-white/70">Placa do veículo</Label>
              <Input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23"
                className="bg-white/5 border-white/10 text-white" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70">KM atual *</Label>
              <Input value={km} onChange={(e) => setKm(e.target.value)} placeholder="123456"
                className="bg-white/5 border-white/10 text-white" inputMode="numeric" />
            </div>
            <div>
              <Label className="text-white/70">Combustível</Label>
              <Input value={combustivel} onChange={(e) => setCombustivel(e.target.value)}
                className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70">Preço/litro *</Label>
              <Input value={precoLitro} onChange={(e) => setPrecoLitro(e.target.value)} placeholder="6,29"
                className="bg-white/5 border-white/10 text-white" inputMode="decimal" />
            </div>
            <div>
              <Label className="text-white/70">Litros *</Label>
              <Input value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="50,00"
                className="bg-white/5 border-white/10 text-white" inputMode="decimal" />
            </div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3 text-center">
            <p className="text-[10px] text-emerald-200 uppercase font-bold">Valor total</p>
            <p className="text-2xl font-bold text-emerald-300">R$ {valorTotal.toFixed(2).replace('.', ',')}</p>
          </div>

          <FotoButton label="Foto da bomba *" file={fotoBomba} onPick={() => refBomba.current?.click()} />
          <input ref={refBomba} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => setFotoBomba(e.target.files?.[0] || null)} />

          <FotoButton label="Foto do painel/odômetro *" file={fotoPainel} onPick={() => refPainel.current?.click()} />
          <input ref={refPainel} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => setFotoPainel(e.target.files?.[0] || null)} />

          <div>
            <Label className="text-white/70">Observação (opcional)</Label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)}
              className="bg-white/5 border-white/10 text-white" />
          </div>

          <Button onClick={finalizar} disabled={salvando}
            className="w-full h-14 bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-2xl border-0 text-base font-semibold">
            {salvando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
            Salvar abastecimento
          </Button>
        </div>
      </div>
    </div>
  );
};

const Info: React.FC<{ label: string; valor: string }> = ({ label, valor }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-[10px] text-white/50 uppercase font-semibold pt-0.5">{label}</span>
    <span className="text-white text-sm text-right flex-1">{valor}</span>
  </div>
);

const FotoButton: React.FC<{ label: string; file: File | null; onPick: () => void }> = ({ label, file, onPick }) => (
  <button type="button" onClick={onPick}
    className={`w-full flex items-center gap-3 p-3 rounded-xl border ${
      file ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200' : 'bg-white/5 border-white/10 text-white'
    }`}>
    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
      {file ? <Check className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
    </div>
    <div className="flex-1 text-left">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[11px] opacity-70">{file ? file.name : 'Tocar para tirar foto'}</p>
    </div>
  </button>
);

export default PublicAbastecimentoPage;
