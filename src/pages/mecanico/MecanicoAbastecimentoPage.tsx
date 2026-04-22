import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Fuel, QrCode, Camera, Loader2, Check, AlertTriangle, X, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useTecnicoApp } from '@/context/TecnicoAppContext';
import { getBrowserLocation } from '@/lib/browserGeo';
import ConfirmacaoVisual from '@/components/ConfirmacaoVisual';
import { Html5Qrcode } from 'html5-qrcode';

type Step = 'idle' | 'scan' | 'confirm' | 'photo' | 'fill' | 'done';

interface ValeData {
  vale: { id: string; codigo: string; valor_limite: number; litros_limite: number; tipo?: string };
  tipo?: string;
  mecanico: { id: string; nome: string; cargo?: string };
  veiculo: { placa: string; modelo: string } | null;
  posto?: { nome: string; cnpj: string; endereco: string };
  agora: string;
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

const MecanicoAbastecimentoPage: React.FC = () => {
  const { tecnico, call } = useTecnicoApp();
  const [step, setStep] = useState<Step>('idle');
  const [vale, setVale] = useState<ValeData | null>(null);
  const [fotoBomba, setFotoBomba] = useState<Blob | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [valor, setValor] = useState('');
  const [litros, setLitros] = useState('');
  const [combustivel, setCombustivel] = useState('Diesel S10');
  const [postoNome, setPostoNome] = useState('');
  const [postoCnpj, setPostoCnpj] = useState('');
  const [kmAtual, setKmAtual] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ titulo: string; detalhes: { label: string; valor: string }[] } | null>(null);
  const [recentes, setRecentes] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'qr-reader-mec';

  useEffect(() => {
    refreshRecentes();
    return () => { stopScanner(); };
  }, []);

  const refreshRecentes = async () => {
    try {
      const r: any = await call('listar_abastecimentos');
      setRecentes(r.abastecimentos || []);
    } catch { /* noop */ }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch { /* noop */ }
      scannerRef.current = null;
    }
  };

  const startScan = async () => {
    setStep('scan');
    setTimeout(async () => {
      try {
        const html5 = new Html5Qrcode(scannerDivId);
        scannerRef.current = html5;
        await html5.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decoded) => {
            await stopScanner();
            await onCodeRead(decoded);
          },
          () => {/* ignore frame errors */},
        );
      } catch (e: any) {
        toast.error('Não foi possível abrir a câmera. Use entrada manual.');
        setStep('idle');
      }
    }, 100);
  };

  const onCodeRead = async (codigo: string) => {
    try {
      setLoading(true);
      // Extrai TOPAC-ABAST-NNN mesmo se o QR vier dentro de URL/JSON/texto qualquer
      const upper = codigo.trim().toUpperCase().replace(/\s+/g, '');
      const m = upper.match(/TOPAC-?ABAST-?(\d{1,6})/);
      const codigoFinal = m ? `TOPAC-ABAST-${m[1].padStart(3, '0')}` : codigo.trim();
      const isTopac = !!m;
      const r: any = await call('validar_vale', { codigo: codigoFinal });
      setVale(r);
      // Pré-preenche posto a partir do vale (TOPAC-ABAST traz posto vinculado)
      if (r?.posto?.nome) setPostoNome(r.posto.nome);
      if (r?.posto?.cnpj) setPostoCnpj(r.posto.cnpj);
      setStep('confirm');
      if (isTopac) toast.success(`Autorização TOPAC reconhecida: ${codigoFinal}`);
    } catch (e: any) {
      const map: Record<string, string> = {
        vale_invalido: 'Vale não encontrado',
        vale_indisponivel: 'Vale já utilizado ou bloqueado',
        vale_vencido: 'Vale fora da validade',
        vale_outro_veiculo: 'Vale destinado a outro veículo',
      };
      toast.error(map[e.message] || 'Erro ao validar vale');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  const manualScan = async () => {
    const codigo = window.prompt('Digite o código do vale');
    if (codigo) await onCodeRead(codigo);
  };

  const onFileSelected = async (file: File) => {
    setFotoBomba(file);
    setFotoUrl(URL.createObjectURL(file));
    setStep('fill');
  };

  const finalizar = async () => {
    if (!vale || !fotoBomba) return;
    const v = Number(valor.replace(',', '.'));
    const l = Number(litros.replace(',', '.'));
    if (!v || !l) { toast.error('Informe valor e litros'); return; }
    setLoading(true);
    try {
      const geo = await getBrowserLocation();
      const foto64 = await blobToBase64(fotoBomba);
      const r: any = await call('registrar_abastecimento', {
        vale_codigo: vale.vale.codigo,
        valor: v,
        litros: l,
        combustivel,
        km_atual: kmAtual ? Number(kmAtual) : undefined,
        posto_nome: postoNome,
        posto_cnpj: postoCnpj,
        latitude: geo.latitude,
        longitude: geo.longitude,
        foto_bomba_base64: foto64,
        preenchimento: 'manual',
      });
      setConfirm({
        titulo: 'Abastecimento registrado!',
        detalhes: [
          { label: 'Mecânico', valor: vale.mecanico.nome },
          { label: 'Veículo', valor: vale.veiculo ? `${vale.veiculo.modelo} — ${vale.veiculo.placa}` : '—' },
          { label: 'Vale', valor: vale.vale.codigo },
          { label: 'Valor', valor: `R$ ${v.toFixed(2).replace('.', ',')}` },
          { label: 'Litros', valor: `${l.toFixed(2).replace('.', ',')} L` },
          { label: 'Combustível', valor: combustivel },
          ...(geo.latitude ? [{ label: 'Localização', valor: `${geo.latitude.toFixed(5)}, ${geo.longitude!.toFixed(5)}` }] : []),
        ],
      });
      reset();
      refreshRecentes();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar abastecimento');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('idle');
    setVale(null);
    setFotoBomba(null);
    setFotoUrl('');
    setValor(''); setLitros(''); setKmAtual('');
    setPostoNome(''); setPostoCnpj('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold font-display text-white flex items-center gap-2">
          <Fuel className="w-6 h-6 text-primary" /> Abastecimento
        </h2>
        <p className="text-sm text-white/60 mt-1">QR do vale · foto da bomba · localização</p>
      </div>

      {step === 'idle' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <Button
            onClick={startScan}
            className="w-full h-20 bg-gradient-to-br from-amber-500 to-orange-600 text-white text-base font-semibold rounded-2xl shadow-lg flex items-center gap-4 px-5 border-0"
          >
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <QrCode className="w-6 h-6" />
            </div>
            <div className="text-left flex-1">
              <div className="font-bold">Iniciar abastecimento</div>
              <div className="text-xs opacity-90">Escanear QR Code do vale</div>
            </div>
          </Button>
          <Button onClick={manualScan} variant="outline" className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10">
            Digitar código manualmente
          </Button>

          {recentes.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2 px-1">Últimos abastecimentos</h3>
              <div className="space-y-2">
                {recentes.slice(0, 5).map((r) => (
                  <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                    {r.foto_bomba_url ? (
                      <img src={r.foto_bomba_url} alt="bomba" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center"><Fuel className="w-5 h-5 text-white/40" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-semibold">R$ {Number(r.valor).toFixed(2).replace('.', ',')} · {Number(r.litros).toFixed(2)} L</p>
                      <p className="text-white/50 text-[11px]">{r.placa} · {new Date(r.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                      r.status === 'conferido' ? 'bg-emerald-500/20 text-emerald-300' :
                      r.status === 'divergente' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {step === 'scan' && (
        <div className="space-y-3">
          <div id={scannerDivId} className="w-full rounded-2xl overflow-hidden bg-black aspect-square" />
          <p className="text-center text-xs text-white/60">Aponte para o QR Code do vale</p>
          <Button variant="outline" className="w-full bg-white/5 border-white/10 text-white" onClick={async () => { await stopScanner(); setStep('idle'); }}>
            <X className="w-4 h-4 mr-2" /> Cancelar
          </Button>
        </div>
      )}

      {step === 'confirm' && vale && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-bold"><Check className="w-5 h-5" /> Autorização válida</div>
              {vale.vale.codigo?.startsWith('TOPAC-ABAST') && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  TOPAC
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Mecânico" valor={vale.mecanico.nome} />
              <Info label="Cargo" valor={vale.mecanico.cargo || '—'} />
              <Info label="Autorização" valor={vale.vale.codigo} />
              <Info label="Veículo" valor={vale.veiculo ? `${vale.veiculo.modelo}` : '—'} />
              <Info label="Placa" valor={vale.veiculo?.placa || '—'} />
              {vale.posto?.nome && <Info label="Posto" valor={vale.posto.nome} />}
              {vale.vale.valor_limite > 0 && <Info label="Limite R$" valor={`R$ ${Number(vale.vale.valor_limite).toFixed(2)}`} />}
              {vale.vale.litros_limite > 0 && <Info label="Litros máx." valor={`${vale.vale.litros_limite} L`} />}
            </div>
            <p className="text-[11px] text-white/50">{new Date(vale.agora).toLocaleString('pt-BR')}</p>
          </div>
          <Button
            onClick={() => fileRef.current?.click()}
            className="w-full h-16 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl border-0"
          >
            <Camera className="w-5 h-5 mr-2" /> Confirmar e tirar foto da bomba
          </Button>
          <Button variant="outline" onClick={reset} className="w-full bg-white/5 border-white/10 text-white">Cancelar</Button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelected(f); }} />
        </motion.div>
      )}

      {step === 'fill' && vale && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {fotoUrl && (
            <img src={fotoUrl} alt="bomba" className="w-full rounded-2xl border border-white/10 max-h-64 object-cover" />
          )}
          <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-3 text-xs text-amber-200 flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Confira o valor e os litros lendo a bomba. Esta foto fica anexada à conferência.</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" value={valor} onChange={setValor} placeholder="0,00" />
            <Field label="Litros" value={litros} onChange={setLitros} placeholder="0,00" />
          </div>
          <Field label="Combustível" value={combustivel} onChange={setCombustivel} />
          <Field label="KM atual (opcional)" value={kmAtual} onChange={setKmAtual} placeholder="—" />
          <Field label="Posto" value={postoNome} onChange={setPostoNome} placeholder="Nome do posto" />
          <Field label="CNPJ posto (opcional)" value={postoCnpj} onChange={setPostoCnpj} />

          <Button onClick={finalizar} disabled={loading} className="w-full h-14 bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-2xl border-0">
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Receipt className="w-5 h-5 mr-2" />}
            Salvar abastecimento
          </Button>
          <Button variant="outline" onClick={reset} className="w-full bg-white/5 border-white/10 text-white">Cancelar</Button>
        </motion.div>
      )}

      <ConfirmacaoVisual open={!!confirm} onClose={() => setConfirm(null)} titulo={confirm?.titulo || ''} detalhes={confirm?.detalhes || []} />
    </div>
  );
};

const Info: React.FC<{ label: string; valor: string }> = ({ label, valor }) => (
  <div>
    <p className="text-[10px] text-white/50 uppercase font-semibold">{label}</p>
    <p className="text-white text-sm font-medium">{valor}</p>
  </div>
);

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <div>
    <Label className="text-white/70 text-xs">{label}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-white/5 border-white/10 text-white mt-1" />
  </div>
);

export default MecanicoAbastecimentoPage;
