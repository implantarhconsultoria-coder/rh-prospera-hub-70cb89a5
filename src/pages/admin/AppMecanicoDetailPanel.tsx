import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Fuel, Gauge, History, Loader2, LockKeyhole, MapPin, Phone, Save, UserRound, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const TZ = 'America/Sao_Paulo';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }) : '—';
const dateBr = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const money = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numberBr = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

type DetailData = {
  ok?: boolean;
  error?: string;
  mecanico?: {
    id: string;
    funcionario_id?: string | null;
    nome: string;
    empresa?: string | null;
    filial?: string | null;
    funcao?: string | null;
    telefone?: string | null;
    observacoes?: string | null;
    acesso_liberado?: boolean | null;
    status?: string | null;
    ultimo_acesso_em?: string | null;
  };
  ultima_localizacao?: {
    origem?: string | null;
    data_hora?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    endereco?: string | null;
  } | null;
  pontos?: Array<{
    id: string;
    tipo: string;
    data: string;
    hora: string;
    latitude?: number | null;
    longitude?: number | null;
    endereco_formatado?: string | null;
    selfie_url?: string | null;
  }>;
  abastecimentos?: Array<{
    id: string;
    data: string;
    hora: string;
    placa?: string | null;
    posto_nome?: string | null;
    combustivel?: string | null;
    litros?: number | null;
    valor?: number | null;
    km_atual?: number | null;
    km_rodado?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    endereco?: string | null;
    foto_bomba_url?: string | null;
    foto_painel_url?: string | null;
    recibo_pdf_url?: string | null;
  }>;
  km?: Array<{
    id: string;
    data: string;
    veiculo_placa?: string | null;
    veiculo_descricao?: string | null;
    km_saida?: number | null;
    km_chegada?: number | null;
    km_total?: number | null;
    status?: string | null;
    saida_em?: string | null;
    saida_latitude?: number | null;
    saida_longitude?: number | null;
    chegada_em?: string | null;
    chegada_latitude?: number | null;
    chegada_longitude?: number | null;
  }>;
};

type Props = {
  acessoId: string;
  onClose: () => void;
  onSaved?: () => void;
};

type HistoryTab = 'ponto' | 'abastecimento' | 'km';

function MapButton({ lat, lng, label = 'Ver localização' }: { lat?: number | null; lng?: number | null; label?: string }) {
  if (lat == null || lng == null) return <span className="text-[10px] text-zinc-600">Sem GPS</span>;
  const href = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
  return <Button size="sm" variant="outline" asChild><a href={href} target="_blank" rel="noreferrer"><MapPin className="mr-1 h-3.5 w-3.5" />{label}</a></Button>;
}

export default function AppMecanicoDetailPanel({ acessoId, onClose, onSaved }: Props) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<HistoryTab>('ponto');
  const [telefone, setTelefone] = useState('');
  const [filial, setFilial] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [liberado, setLiberado] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await (supabase as any).rpc('admin_app_mecanico_historico', { p_acesso_id: acessoId });
      const detail = result as DetailData | null;
      if (error || !detail?.ok || !detail.mecanico) throw new Error(detail?.error || error?.message || 'Falha ao carregar ficha do mecânico.');
      setData(detail);
      setTelefone(detail.mecanico.telefone || '');
      setFilial(detail.mecanico.filial || '');
      setObservacoes(detail.mecanico.observacoes || '');
      setLiberado(detail.mecanico.acesso_liberado !== false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar ficha do mecânico.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [acessoId]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: result, error } = await (supabase as any).rpc('admin_app_mecanico_atualizar_acesso', {
        p_acesso_id: acessoId,
        p_acesso_liberado: liberado,
        p_filial: filial || null,
        p_telefone: telefone || null,
        p_observacoes: observacoes || null,
      });
      if (error || !result?.ok) throw new Error(result?.error || error?.message || 'Não foi possível salvar.');
      toast.success('Acesso do mecânico atualizado.');
      await load();
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const lastLocation = data?.ultima_localizacao;
  const historyCount = useMemo(() => (data?.pontos?.length || 0) + (data?.abastecimentos?.length || 0) + (data?.km?.length || 0), [data]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/70 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-fuchsia-500/20 bg-[#08080e] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#08080e]/95 p-4 backdrop-blur">
          <div>
            <div className="flex items-center gap-2"><UserRound className="h-5 w-5 text-fuchsia-400" /><h2 className="text-lg font-black text-white">Ficha do mecânico</h2></div>
            <p className="mt-1 text-xs text-zinc-500">Edição administrativa, histórico e localização.</p>
          </div>
          <Button variant="outline" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>

        {loading && !data ? (
          <div className="grid min-h-[360px] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-400" /></div>
        ) : data?.mecanico ? (
          <div className="space-y-4 p-4">
            <section className="rounded-xl border border-fuchsia-500/15 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-black text-white">{data.mecanico.nome}</h3><p className="text-xs text-zinc-500">{data.mecanico.funcao || 'Mecânico'} · {data.mecanico.empresa || 'Sem empresa'}</p><p className="mt-1 text-[11px] text-zinc-600">Último acesso: {dateTime(data.mecanico.ultimo_acesso_em)}</p></div>
                <Badge className={liberado ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}>{liberado ? 'Acesso liberado' : 'Acesso bloqueado'}</Badge>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5"><Label>Telefone operacional</Label><div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-zinc-500" /><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="pl-9" placeholder="Telefone" /></div></div>
                <div className="space-y-1.5"><Label>Filial operacional</Label><Input value={filial} onChange={(e) => setFilial(e.target.value)} placeholder="Filial" /></div>
              </div>
              <div className="mt-3 space-y-1.5"><Label>Observações administrativas</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações internas do acesso..." /></div>
              <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3 text-sm"><input type="checkbox" checked={liberado} onChange={(e) => setLiberado(e.target.checked)} className="h-4 w-4" /><LockKeyhole className="h-4 w-4 text-amber-400" /><span><b className="text-white">Acesso ao App Mecânicos</b><span className="block text-xs text-zinc-500">Desmarque para bloquear o login deste usuário.</span></span></label>
              <Button className="mt-4" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar alterações</Button>
            </section>

            <section className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-400" /><h3 className="font-black text-white">Última localização registrada</h3></div>{lastLocation ? <><p className="mt-2 text-sm text-zinc-300">{lastLocation.endereco || `${lastLocation.latitude}, ${lastLocation.longitude}`}</p><p className="mt-1 text-[11px] text-zinc-500">{lastLocation.origem} · {dateTime(lastLocation.data_hora)}</p></> : <p className="mt-2 text-sm text-zinc-500">Nenhuma localização registrada.</p>}</div>{lastLocation && <MapButton lat={lastLocation.latitude} lng={lastLocation.longitude} label="Abrir no mapa" />}</div>
            </section>

            <section className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-fuchsia-400" /><h3 className="font-black text-white">Histórico operacional</h3></div><Badge variant="outline">{historyCount} registros</Badge></div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button size="sm" variant={tab === 'ponto' ? 'default' : 'outline'} onClick={() => setTab('ponto')}>Ponto</Button>
                <Button size="sm" variant={tab === 'abastecimento' ? 'default' : 'outline'} onClick={() => setTab('abastecimento')}>Abastecimento</Button>
                <Button size="sm" variant={tab === 'km' ? 'default' : 'outline'} onClick={() => setTab('km')}>KM</Button>
              </div>

              {tab === 'ponto' && <div className="mt-3 space-y-2">{(data.pontos || []).map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-[#07070d] p-3"><div><strong className="text-sm text-white">{row.tipo.replaceAll('_',' ')}</strong><p className="text-[11px] text-zinc-500">{dateBr(row.data)} · {String(row.hora || '').slice(0,5)}{row.endereco_formatado ? ` · ${row.endereco_formatado}` : ''}</p></div><div className="flex gap-2">{row.selfie_url && <Button size="sm" variant="outline" asChild><a href={row.selfie_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Foto</a></Button>}<MapButton lat={row.latitude} lng={row.longitude} /></div></div>)}{!(data.pontos || []).length && <p className="py-8 text-center text-sm text-zinc-500">Sem registros de ponto.</p>}</div>}

              {tab === 'abastecimento' && <div className="mt-3 space-y-2">{(data.abastecimentos || []).map((row) => <div key={row.id} className="rounded-lg border border-white/5 bg-[#07070d] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Fuel className="h-4 w-4 text-amber-400" /><strong className="text-sm text-white">{row.placa || 'Veículo'} · {row.combustivel || 'Combustível'}</strong></div><p className="mt-1 text-[11px] text-zinc-500">{dateBr(row.data)} · {String(row.hora || '').slice(0,5)} · {row.posto_nome || 'Posto'}</p><p className="mt-1 text-xs text-zinc-300">{numberBr(row.litros)} L · {money(row.valor)} · KM {row.km_atual ?? '—'}</p></div><MapButton lat={row.latitude} lng={row.longitude} /></div><div className="mt-2 flex flex-wrap gap-2">{row.foto_bomba_url && <Button size="sm" variant="outline" asChild><a href={row.foto_bomba_url} target="_blank" rel="noreferrer">Comprovante</a></Button>}{row.foto_painel_url && <Button size="sm" variant="outline" asChild><a href={row.foto_painel_url} target="_blank" rel="noreferrer">Painel/KM</a></Button>}{row.recibo_pdf_url && <Button size="sm" variant="outline" asChild><a href={row.recibo_pdf_url} target="_blank" rel="noreferrer">PDF</a></Button>}</div></div>)}{!(data.abastecimentos || []).length && <p className="py-8 text-center text-sm text-zinc-500">Sem abastecimentos.</p>}</div>}

              {tab === 'km' && <div className="mt-3 space-y-2">{(data.km || []).map((row) => <div key={row.id} className="rounded-lg border border-white/5 bg-[#07070d] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-fuchsia-400" /><strong className="text-sm text-white">{row.veiculo_placa || 'Veículo'} · {row.veiculo_descricao || ''}</strong></div><p className="mt-1 text-[11px] text-zinc-500">{dateBr(row.data)} · {row.status || '—'}</p><p className="mt-1 text-xs text-zinc-300">Saída {row.km_saida ?? '—'} · Chegada {row.km_chegada ?? '—'} · <b>{numberBr(row.km_total)} km</b></p></div><div className="flex flex-wrap gap-2">{row.chegada_latitude != null && row.chegada_longitude != null ? <MapButton lat={row.chegada_latitude} lng={row.chegada_longitude} label="Chegada" /> : <MapButton lat={row.saida_latitude} lng={row.saida_longitude} label="Saída" />}</div></div></div>)}{!(data.km || []).length && <p className="py-8 text-center text-sm text-zinc-500">Sem registros de KM.</p>}</div>}
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
