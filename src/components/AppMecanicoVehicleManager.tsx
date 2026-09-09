import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Car, Loader2, Pencil, RefreshCw, Save, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type MechanicVehicle = {
  acesso_id: string;
  funcionario_id?: string | null;
  nome: string;
  empresa?: string | null;
  filial?: string | null;
  funcao?: string | null;
  ativo_id?: string | null;
  placa?: string | null;
  veiculo_descricao?: string | null;
};

type VehicleOption = {
  id: string;
  placa: string;
  descricao?: string | null;
  empresa?: string | null;
};

type VehicleResponse = {
  ok?: boolean;
  error?: string;
  mecanicos?: MechanicVehicle[];
  veiculos?: VehicleOption[];
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

export default function AppMecanicoVehicleManager() {
  const location = useLocation();
  const enabled = location.pathname === '/admin/app-mecanico';
  const [mechanics, setMechanics] = useState<MechanicVehicle[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<MechanicVehicle | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_app_mecanicos_veiculos');
      const result = data as VehicleResponse | null;
      if (error || !result?.ok) throw new Error(result?.error || error?.message || 'Falha ao carregar os veículos dos mecânicos.');
      setMechanics(result.mecanicos || []);
      setVehicles(result.veiculos || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar os veículos dos mecânicos.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const onRefresh = () => void load();
    window.addEventListener('topac:refresh-current', onRefresh);
    return () => window.removeEventListener('topac:refresh-current', onRefresh);
  }, [enabled, load]);

  const filteredVehicles = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return vehicles;
    return vehicles.filter((vehicle) => `${vehicle.placa} ${vehicle.descricao || ''} ${vehicle.empresa || ''}`.toLowerCase().includes(term));
  }, [vehicles, query]);

  const openEdit = (mechanic: MechanicVehicle) => {
    setEditing(mechanic);
    setSelectedVehicle(mechanic.ativo_id || '');
    setQuery('');
  };

  const saveVehicle = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc('admin_app_mecanico_trocar_veiculo', {
        p_acesso_id: editing.acesso_id,
        p_ativo_id: selectedVehicle || null,
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Não foi possível trocar o veículo.');
      toast.success(selectedVehicle ? 'Veículo do mecânico atualizado.' : 'Veículo fixo removido do mecânico.');
      setEditing(null);
      await load();
      window.dispatchEvent(new CustomEvent('topac:refresh-current', { detail: { path: '/admin/app-mecanico' } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível trocar o veículo.');
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) return null;

  return (
    <>
      <section className="mb-4 overflow-hidden rounded-xl border border-amber-400/20 bg-[#07070d] shadow-[inset_0_0_36px_rgba(251,191,36,.025)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-amber-400/25 bg-amber-400/10 text-amber-400"><Car className="h-5 w-5" /></span>
            <div>
              <div className="flex items-center gap-2"><h2 className="text-sm font-black text-white">Veículos cadastrados por mecânico</h2><Badge variant="outline" className="border-amber-400/20 text-amber-300">{mechanics.filter((item) => item.placa).length} vinculados</Badge></div>
              <p className="mt-0.5 text-[11px] text-zinc-500">O carro fixo aparece novamente com cada mecânico. Use “Trocar veículo” quando houver mudança.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar veículos</Button>
        </div>

        <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {mechanics.map((mechanic) => (
            <article key={mechanic.acesso_id} className="flex min-w-0 items-center gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 text-[10px] font-black text-fuchsia-300">{initials(mechanic.nome)}</span>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs text-white">{mechanic.nome}</strong>
                {mechanic.placa ? (
                  <div className="mt-1 flex min-w-0 items-center gap-2"><Badge className="shrink-0 border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/10">{mechanic.placa}</Badge><span className="truncate text-[10px] text-zinc-500">{mechanic.veiculo_descricao || 'Veículo cadastrado'}</span></div>
                ) : (
                  <span className="mt-1 block text-[10px] font-semibold text-zinc-600">Sem veículo fixo cadastrado</span>
                )}
              </div>
              <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-[10px]" onClick={() => openEdit(mechanic)}><Pencil className="mr-1 h-3.5 w-3.5" />Trocar veículo</Button>
            </article>
          ))}
          {!mechanics.length && !loading && <div className="col-span-full py-6 text-center text-sm text-zinc-500">Nenhum mecânico encontrado.</div>}
        </div>
      </section>

      {editing && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null); }}>
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-fuchsia-500/25 bg-[#08080e] shadow-[0_25px_100px_rgba(0,0,0,.75)]">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
              <div><div className="flex items-center gap-2"><Car className="h-5 w-5 text-amber-400" /><h3 className="font-black text-white">Editar veículo do perfil</h3></div><p className="mt-1 text-xs text-zinc-500">{editing.nome} · atual: {editing.placa || 'sem veículo fixo'}</p></div>
              <Button size="icon" variant="outline" onClick={() => setEditing(null)} disabled={saving}><X className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-3 p-4">
              <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por placa, descrição ou empresa..." /></div>
              <button type="button" onClick={() => setSelectedVehicle('')} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${selectedVehicle === '' ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}><span><strong className="block text-sm text-white">Sem veículo fixo</strong><span className="text-[11px] text-zinc-500">Remove apenas o vínculo atual; o histórico permanece.</span></span>{selectedVehicle === '' && <Badge className="bg-amber-400 text-black">Selecionado</Badge>}</button>

              <div className="max-h-[330px] space-y-1.5 overflow-y-auto pr-1">
                {filteredVehicles.map((vehicle) => {
                  const selected = selectedVehicle === vehicle.id;
                  return <button key={vehicle.id} type="button" onClick={() => setSelectedVehicle(vehicle.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${selected ? 'border-fuchsia-400/50 bg-fuchsia-500/10' : 'border-white/5 bg-black/20 hover:border-fuchsia-500/25'}`}><span className="min-w-0"><strong className="block text-sm text-white">{vehicle.placa}</strong><span className="block truncate text-[11px] text-zinc-500">{vehicle.descricao || 'Veículo'}{vehicle.empresa ? ` · ${vehicle.empresa}` : ''}</span></span>{selected && <Badge className="shrink-0 border-fuchsia-400/25 bg-fuchsia-500/15 text-fuchsia-200">Selecionado</Badge>}</button>;
                })}
                {!filteredVehicles.length && <p className="py-8 text-center text-sm text-zinc-500">Nenhum veículo encontrado.</p>}
              </div>

              <div className="flex justify-end gap-2 border-t border-white/10 pt-3"><Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button><Button onClick={() => void saveVehicle()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar veículo</Button></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
