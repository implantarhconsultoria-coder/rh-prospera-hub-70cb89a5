import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowLeft, Box, Car, CheckCircle2, ClipboardList,
  FileSignature, FileText, History, Loader2, Package, Plus, Search, Settings, ShoppingCart,
  Trash2, Upload, Wrench, ChevronRight, Activity, Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import AlmoxarifadoExcelImporter from '@/components/AlmoxarifadoExcelImporter';

const db = supabase as any;
const fmt = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const date = (v: unknown) => v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';

type Mode = 'home'|'entrada'|'saida'|'carro'|'mecanico'|'estoque'|'reposicao'|'movimentacoes'|'relatorios'|'assinatura'|'config';
type CartRow = { item_id: string; quantidade: number; nome: string; codigo: string };

type HubCardProps = {
  icon: React.ComponentType<any>;
  title: string;
  subtitle: string;
  onClick: () => void;
  value?: string | number;
  badge?: string;
  tone?: 'purple'|'yellow'|'green'|'blue'|'red';
};

function HubCard({ icon: Icon, title, subtitle, onClick, value, badge, tone='purple' }: HubCardProps) {
  return (
    <button type="button" onClick={onClick} className={`almox-hub-card tone-${tone}`}>
      <div className="almox-hub-card-top">
        <span className="almox-hub-icon"><Icon className="h-6 w-6"/></span>
        <ChevronRight className="h-5 w-5 almox-chevron"/>
      </div>
      <div className="almox-hub-card-body">
        <div className="almox-hub-title">{title}</div>
        <div className="almox-hub-subtitle">{subtitle}</div>
      </div>
      {(value !== undefined || badge) && (
        <div className="almox-hub-meta">
          {value !== undefined && <strong>{value}</strong>}
          {badge && <span>{badge}</span>}
        </div>
      )}
    </button>
  );
}

const AlmoxarifadoDesktopV3: React.FC = () => {
  const { session, employees, companies } = useApp();
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [exits, setExits] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loads, setLoads] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [qty, setQty] = useState('1');
  const [cart, setCart] = useState<CartRow[]>([]);
  const [obs, setObs] = useState('');
  const [entItem, setEntItem] = useState('');
  const [entQty, setEntQty] = useState('');
  const [entSupplier, setEntSupplier] = useState('');
  const [entNf, setEntNf] = useState('');
  const [entValue, setEntValue] = useState('');
  const [entFile, setEntFile] = useState<File|null>(null);

  const activeEmployees = useMemo(
    () => [...employees]
      .filter((e: any) => e.status === 'ativo' || e.ativo === true)
      .sort((a: any, b: any) => String(a.name || a.nome).localeCompare(String(b.name || b.nome), 'pt-BR')),
    [employees]
  );
  const employeeName = (e: any) => e.name || e.nome || '';
  const employeeCompany = (e: any) => companies.find((c: any) => c.id === (e.companyId || e.company_id || e.empresa_id))?.name || 'Empresa não informada';
  const person = activeEmployees.find((e: any) => e.id === selectedPerson);
  const vehicleLink = links.find((l: any) => l.funcionario_id === selectedPerson && l.status === 'ativo');
  const vehicle = assets.find((a: any) => a.id === vehicleLink?.ativo_id);

  const fetchData = async () => {
    setLoading(true);
    const [s, e, x, a, c, l, v] = await Promise.all([
      db.from('almoxarifado_estoque_resumo').select('*').eq('ativo', true),
      db.from('almoxarifado_entradas').select('*').order('data_entrada', { ascending: false }).limit(150),
      db.from('almoxarifado_saidas').select('*').order('data_saida', { ascending: false }).limit(150),
      db.from('almoxarifado_compras_priorizadas').select('*').not('prioridade', 'is', null),
      db.from('almoxarifado_cargas').select('*').order('created_at', { ascending: false }).limit(150),
      db.from('mecanico_veiculo_vinculos').select('funcionario_id,ativo_id,status'),
      db.from('ativos').select('id,descricao,placa,marca,modelo,status').eq('status', 'ativo'),
    ]);
    if (s.error) toast.error(`Estoque: ${s.error.message}`);
    else setStock((s.data || []).sort((a: any, b: any) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')));
    if (!e.error) setEntries(e.data || []);
    if (!x.error) setExits(x.data || []);
    if (!a.error) setAlerts(a.data || []);
    if (!c.error) setLoads(c.data || []);
    if (!l.error) setLinks(l.data || []);
    if (!v.error) setAssets(v.data || []);
    setLoading(false);
  };

  useEffect(() => { void fetchData(); }, []);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stock;
    return stock.filter((i: any) => [i.codigo_topac, i.codigo_alternativo, i.nome, i.aplicacao]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }, [stock, search]);

  const itemMap = useMemo(() => new Map(stock.map((i: any) => [i.id, i])), [stock]);
  const lowStock = useMemo(
    () => alerts.filter((a: any) => a.prioridade).sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    [alerts]
  );
  const signedCount = loads.filter((x: any) => x.status_assinatura === 'assinado').length;
  const pendingCount = loads.filter((x: any) => x.status_assinatura !== 'assinado').length;

  const movements = useMemo(() => [
    ...entries.map((r: any) => ({ id: `e-${r.id}`, type: 'Entrada', when: r.data_entrada, who: r.fornecedor || r.responsavel_nome, qty: Number(r.quantidade || 0), item: itemMap.get(r.item_id) })),
    ...exits.map((r: any) => ({ id: `s-${r.id}`, type: 'Saída', when: r.data_saida, who: r.funcionario_nome || r.mecanico_nome, qty: -Number(r.quantidade || 0), item: itemMap.get(r.item_id) })),
  ].sort((a: any, b: any) => String(b.when || '').localeCompare(String(a.when || ''))), [entries, exits, itemMap]);

  const addCart = () => {
    const i: any = itemMap.get(selectedItem);
    const q = Number(qty);
    if (!i || q <= 0) return toast.error('Selecione o material e a quantidade.');
    if (q > Number(i.saldo || 0)) return toast.error('Quantidade maior que o saldo disponível.');
    setCart(v => {
      const found = v.find(x => x.item_id === i.id);
      if (found) return v.map(x => x.item_id === i.id ? { ...x, quantidade: x.quantidade + q } : x);
      return [...v, { item_id: i.id, quantidade: q, nome: i.nome, codigo: i.codigo_topac }];
    });
    setSelectedItem('');
    setQty('1');
  };

  const saveLoad = async (type: 'retirada'|'carro'|'mecanico') => {
    if (!selectedPerson) return toast.error('Selecione quem vai receber.');
    if (!cart.length) return toast.error('Adicione os materiais.');
    setBusy(true);
    try {
      const { data, error } = await db.rpc('almoxarifado_criar_carga_v2', {
        p_tipo: type,
        p_funcionario_id: selectedPerson,
        p_veiculo: type === 'carro' ? (vehicle?.descricao || [vehicle?.marca, vehicle?.modelo].filter(Boolean).join(' ')) : null,
        p_placa: type === 'carro' ? vehicle?.placa : null,
        p_itens: cart.map(x => ({ item_id: x.item_id, quantidade: x.quantidade })),
        p_observacoes: obs || null,
      });
      if (error) throw error;
      toast.success(`Protocolo ${data?.protocolo || ''} criado e estoque baixado.`);
      setCart([]);
      setObs('');
      setSelectedPerson('');
      await fetchData();
      setMode('assinatura');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível registrar a saída.');
    } finally {
      setBusy(false);
    }
  };

  const saveEntry = async () => {
    const q = Number(entQty);
    const value = Number(entValue || 0);
    if (!entItem || q <= 0) return toast.error('Selecione item e quantidade.');
    setBusy(true);
    try {
      let url = '';
      if (entFile) {
        const path = `almoxarifado/nf/${Date.now()}-${entFile.name}`;
        const up = await supabase.storage.from('documentos-ativos').upload(path, entFile);
        if (up.error) throw up.error;
        url = supabase.storage.from('documentos-ativos').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await db.from('almoxarifado_entradas').insert({
        user_id: session?.user?.id,
        item_id: entItem,
        quantidade: q,
        fornecedor: entSupplier || null,
        valor_unitario: value,
        valor_total: q * value,
        nota_fiscal: entNf || null,
        nota_fiscal_url: url || null,
        data_entrada: new Date().toISOString().slice(0, 10),
        responsavel_nome: session?.user?.email || 'Almoxarifado',
        hora_informada: true,
      });
      if (error) throw error;
      toast.success('Entrada registrada. Estoque atualizado.');
      setEntQty(''); setEntSupplier(''); setEntNf(''); setEntValue(''); setEntFile(null);
      await fetchData();
      setMode('home');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao registrar entrada.');
    } finally {
      setBusy(false);
    }
  };

  const signLoad = async (row: any) => {
    const signer = window.prompt('Nome de quem está assinando o protocolo:', row.funcionario_nome || '');
    if (!signer) return;
    const { error } = await db.rpc('almoxarifado_assinar_carga_v2', { p_carga_id: row.id, p_nome: signer });
    if (error) return toast.error(error.message);
    toast.success('Protocolo assinado e enviado ao histórico do funcionário.');
    await fetchData();
  };

  if (loading) {
    return <div className="almox-v3 grid min-h-[480px] place-items-center"><div className="flex items-center gap-2 text-white"><Loader2 className="h-5 w-5 animate-spin"/>Carregando Almoxarifado...</div></div>;
  }

  const personOptions = mode === 'carro'
    ? activeEmployees.filter((e: any) => {
        const n = employeeName(e).toUpperCase();
        return n !== 'GR' && !n.includes('LEONEL') && links.some((l: any) => l.funcionario_id === e.id && l.status === 'ativo');
      })
    : activeEmployees;

  const Back = () => mode === 'home' ? null : (
    <button type="button" onClick={() => { setMode('home'); setCart([]); setSearch(''); }} className="almox-back">
      <ArrowLeft className="h-4 w-4"/> Voltar ao painel
    </button>
  );

  const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-5">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
    </div>
  );

  const OperationPanel = ({ type, title }: { type: 'retirada'|'carro'|'mecanico'; title: string }) => (
    <div>
      <Back/>
      <SectionTitle title={title} subtitle="Selecione quem recebe, adicione os materiais e gere o protocolo."/>
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="almox-panel p-5">
          <label className="almox-label">Quem vai receber</label>
          <select value={selectedPerson} onChange={e => setSelectedPerson(e.target.value)} className="almox-control mt-2">
            <option value="">Pesquisar / selecionar...</option>
            {personOptions.map((e: any) => <option key={e.id} value={e.id}>{employeeName(e)} — {employeeCompany(e)}</option>)}
          </select>
          {type === 'carro' && person && (
            <div className="mt-3 rounded-xl border border-violet-500/40 bg-violet-500/10 p-3 text-sm text-white">
              <b>{vehicle?.descricao || [vehicle?.marca, vehicle?.modelo].filter(Boolean).join(' ') || 'Veículo não vinculado'}</b>
              <div className="mt-1 text-violet-300">{vehicle?.placa || 'Sem placa cadastrada'}</div>
            </div>
          )}
          <Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação do protocolo" className="almox-textarea mt-4"/>
        </div>
        <div className="almox-panel p-5">
          <div className="grid gap-2 md:grid-cols-[1fr_140px_auto]">
            <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)} className="almox-control">
              <option value="">Material / código...</option>
              {stock.map((i: any) => <option key={i.id} value={i.id}>{i.nome} — {i.codigo_topac} — saldo {fmt(i.saldo)}</option>)}
            </select>
            <Input type="number" min="0.01" step="any" value={qty} onChange={e => setQty(e.target.value)} className="almox-input"/>
            <Button onClick={addCart} className="almox-primary"><Plus className="mr-1 h-4 w-4"/>Adicionar</Button>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-violet-500/20">
            {cart.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Nenhum material adicionado.</div> : cart.map(x => (
              <div key={x.item_id} className="flex items-center gap-3 border-t border-violet-500/15 p-3 first:border-t-0">
                <div className="min-w-0 flex-1"><b className="block truncate text-sm text-white">{x.nome}</b><span className="text-xs text-slate-400">{x.codigo} • Qtd. {fmt(x.quantidade)}</span></div>
                <button type="button" onClick={() => setCart(v => v.filter(y => y.item_id !== x.item_id))} className="almox-danger-icon"><Trash2 className="h-4 w-4"/></button>
              </div>
            ))}
          </div>
          <Button className="almox-primary mt-4 w-full" disabled={busy || !cart.length} onClick={() => saveLoad(type)}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ClipboardList className="mr-2 h-4 w-4"/>}
            Gerar protocolo e baixar estoque
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="almox-v3 min-h-screen">
      <style>{`
        .almox-v3 { background:#08070d !important; color:#fff !important; }
        .almox-v3 .almox-hub-card { min-height:170px; display:flex; flex-direction:column; justify-content:space-between; text-align:left; border-radius:18px; padding:18px; background:#12101a !important; border:1px solid #332b45 !important; color:#fff !important; box-shadow:0 10px 30px rgba(0,0,0,.18); transition:.18s ease; opacity:1 !important; }
        .almox-v3 .almox-hub-card:hover { transform:translateY(-2px); border-color:#facc15 !important; background:#191525 !important; box-shadow:0 14px 34px rgba(0,0,0,.28); }
        .almox-v3 .almox-hub-card:focus-visible { outline:3px solid #facc15 !important; outline-offset:3px; }
        .almox-v3 .almox-hub-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .almox-v3 .almox-hub-icon { width:46px; height:46px; display:grid; place-items:center; border-radius:13px; background:#facc15 !important; color:#17120a !important; }
        .almox-v3 .almox-chevron { color:#facc15 !important; }
        .almox-v3 .almox-hub-title { margin-top:18px; color:#fff !important; font-size:15px; font-weight:900; letter-spacing:.01em; }
        .almox-v3 .almox-hub-subtitle { margin-top:5px; color:#cbd5e1 !important; font-size:12px; line-height:1.45; font-weight:600; }
        .almox-v3 .almox-hub-meta { margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .almox-v3 .almox-hub-meta strong { color:#fff !important; font-size:24px; line-height:1; font-weight:950; }
        .almox-v3 .almox-hub-meta span { border-radius:999px; padding:4px 8px; background:#211b2c !important; color:#facc15 !important; font-size:10px; font-weight:900; text-transform:uppercase; }
        .almox-v3 .tone-red { border-color:#5b2028 !important; }
        .almox-v3 .tone-red .almox-hub-icon { background:#ef4444 !important; color:#fff !important; }
        .almox-v3 .tone-red .almox-chevron { color:#ef4444 !important; }
        .almox-v3 .tone-green .almox-hub-icon { background:#22c55e !important; color:#07150c !important; }
        .almox-v3 .tone-blue .almox-hub-icon { background:#38bdf8 !important; color:#07131a !important; }
        .almox-v3 .tone-purple .almox-hub-icon { background:#8b5cf6 !important; color:#fff !important; }
        .almox-v3 .tone-yellow .almox-hub-icon { background:#facc15 !important; color:#17120a !important; }
        .almox-v3 .almox-panel { border-radius:18px; background:#12101a !important; border:1px solid #332b45 !important; color:#fff !important; box-shadow:0 10px 28px rgba(0,0,0,.16); }
        .almox-v3 .almox-back { margin-bottom:18px; display:inline-flex; align-items:center; gap:8px; border-radius:12px; background:#facc15 !important; color:#17120a !important; padding:9px 13px; font-size:13px; font-weight:900; border:1px solid #facc15 !important; opacity:1 !important; }
        .almox-v3 .almox-back:hover { background:#fde047 !important; }
        .almox-v3 .almox-primary { background:#6d28d9 !important; color:#fff !important; border:1px solid #8b5cf6 !important; font-weight:800 !important; opacity:1 !important; }
        .almox-v3 .almox-primary:hover { background:#7c3aed !important; }
        .almox-v3 .almox-primary:disabled { background:#2c2440 !important; color:#c4b5fd !important; border-color:#4c3a6a !important; opacity:1 !important; cursor:not-allowed; }
        .almox-v3 .almox-danger-icon { display:grid; place-items:center; width:34px; height:34px; border-radius:10px; background:#3a151a !important; color:#f87171 !important; border:1px solid #7f1d1d !important; opacity:1 !important; }
        .almox-v3 .almox-control, .almox-v3 .almox-input, .almox-v3 .almox-textarea { width:100%; border-radius:12px !important; border:1px solid #44375e !important; background:#0d0b13 !important; color:#fff !important; }
        .almox-v3 .almox-control { height:44px; padding:0 12px; font-size:14px; }
        .almox-v3 .almox-input { height:44px; }
        .almox-v3 .almox-textarea { min-height:92px; }
        .almox-v3 .almox-label { color:#cbd5e1 !important; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }
        .almox-v3 table { color:#fff !important; }
        .almox-v3 thead { background:#17131f !important; }
        .almox-v3 th { color:#cbd5e1 !important; border-color:#332b45 !important; }
        .almox-v3 td { border-color:#2c2439 !important; }
        .almox-v3 tbody tr:hover { background:#191525 !important; }
        .almox-v3 input::placeholder, .almox-v3 textarea::placeholder { color:#7c8597 !important; }
        .almox-v3 select option { background:#111018; color:#fff; }
      `}</style>

      <div className="mx-auto w-full max-w-[1780px] px-5 py-6 lg:px-8">
        {mode === 'home' && (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm font-black uppercase tracking-wide text-yellow-400">TOPAC RH PRO • ALMOXARIFADO</div>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Painel do Almoxarifado</h1>
                <p className="mt-1 text-sm font-medium text-slate-300">Escolha um card. Os dados só aparecem depois do clique.</p>
              </div>
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-right">
                <div className="text-[10px] font-black uppercase tracking-wide text-violet-300">Base oficial</div>
                <div className="text-sm font-black text-white">Estoque central TOPAC</div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <HubCard icon={FileText} title="Entrada por Nota" subtitle="Registrar entrada e arquivar nota fiscal" tone="green" onClick={() => setMode('entrada')}/>
              <HubCard icon={ArrowDownToLine} title="Saída / Retirada" subtitle="Baixa de materiais para consumo" tone="blue" onClick={() => setMode('saida')}/>
              <HubCard icon={Car} title="Carga para Carro" subtitle="Materiais vinculados ao motorista e veículo" tone="yellow" onClick={() => setMode('carro')}/>
              <HubCard icon={Wrench} title="Carga para Mecânicos" subtitle="Entrega para matriz, filiais e empresas do grupo" tone="purple" onClick={() => setMode('mecanico')}/>

              <HubCard icon={Warehouse} title="Estoque / Códigos" subtitle="Consultar a base completa somente quando precisar" value={stock.length} badge="itens" tone="purple" onClick={() => setMode('estoque')}/>
              <HubCard icon={AlertTriangle} title="Reposição" subtitle="Visualizar apenas os itens abaixo do ponto de compra" value={lowStock.length} badge="alertas" tone="red" onClick={() => setMode('reposicao')}/>
              <HubCard icon={Activity} title="Movimentações" subtitle="Entradas e saídas mais recentes" value={movements.length} badge="registros" tone="blue" onClick={() => setMode('movimentacoes')}/>
              <HubCard icon={FileSignature} title="Assinatura Digital" subtitle="Protocolos de entrega e aceite" value={pendingCount} badge="pendentes" tone="yellow" onClick={() => setMode('assinatura')}/>

              <HubCard icon={History} title="Relatórios" subtitle="Histórico consolidado de entradas e saídas" tone="purple" onClick={() => setMode('relatorios')}/>
              <HubCard icon={Settings} title="Configurações" subtitle="Importação e manutenção da base oficial" tone="purple" onClick={() => setMode('config')}/>
            </div>
          </>
        )}

        {mode === 'entrada' && (
          <div>
            <Back/>
            <SectionTitle title="Entrada por Nota" subtitle="A nota fica arquivada e a entrada alimenta o estoque."/>
            <div className="almox-panel p-6">
              <div className="grid gap-3 lg:grid-cols-3">
                <select value={entItem} onChange={e => setEntItem(e.target.value)} className="almox-control lg:col-span-2"><option value="">Material / código...</option>{stock.map((i: any) => <option key={i.id} value={i.id}>{i.nome} — {i.codigo_topac}</option>)}</select>
                <Input type="number" placeholder="Quantidade" value={entQty} onChange={e => setEntQty(e.target.value)} className="almox-input"/>
                <Input placeholder="Fornecedor" value={entSupplier} onChange={e => setEntSupplier(e.target.value)} className="almox-input"/>
                <Input placeholder="Número da NF" value={entNf} onChange={e => setEntNf(e.target.value)} className="almox-input"/>
                <Input type="number" step="any" placeholder="Valor unitário" value={entValue} onChange={e => setEntValue(e.target.value)} className="almox-input"/>
                <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 px-3 text-sm font-semibold text-slate-300 lg:col-span-2"><Upload className="h-4 w-4"/>{entFile?.name || 'Selecionar PDF da nota'}<input className="hidden" type="file" accept="application/pdf,image/*" onChange={e => setEntFile(e.target.files?.[0] || null)}/></label>
                <Button onClick={saveEntry} disabled={busy} className="almox-primary">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Plus className="mr-2 h-4 w-4"/>}Registrar entrada</Button>
              </div>
            </div>
            <div className="almox-panel mt-4 p-4">
              <b className="text-white">Últimas entradas</b>
              <div className="mt-3 max-h-[520px] overflow-auto">
                {entries.map((r: any) => <div key={r.id} className="grid gap-2 border-t border-violet-500/15 py-3 text-sm md:grid-cols-[120px_1fr_100px_1fr]"><span className="text-slate-300">{date(r.data_entrada)}</span><span className="font-bold text-white">{itemMap.get(r.item_id)?.nome || 'Item'}</span><b className="text-emerald-400">+ {fmt(r.quantidade)}</b><span className="text-slate-400">{r.fornecedor || r.responsavel_nome || '—'}</span></div>)}
              </div>
            </div>
          </div>
        )}

        {mode === 'saida' && <OperationPanel type="retirada" title="Saída / Retirada"/>}
        {mode === 'carro' && <OperationPanel type="carro" title="Carga para Carro"/>}
        {mode === 'mecanico' && <OperationPanel type="mecanico" title="Carga para Mecânicos"/>}

        {mode === 'estoque' && (
          <div>
            <Back/>
            <SectionTitle title="Estoque / Códigos" subtitle={`${stock.length} registros ativos. A lista só é exibida dentro deste card.`}/>
            <div className="almox-panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-violet-500/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3"><Package className="h-5 w-5 text-yellow-400"/><b className="text-white">Base completa</b></div>
                <div className="relative w-full lg:w-[500px]"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar item, código ou aplicação..." className="almox-input pl-9"/></div>
              </div>
              <div className="max-h-[75vh] overflow-auto">
                <table className="w-full min-w-[1100px] text-sm"><thead className="sticky top-0"><tr>{['Descrição','Código TOPAC','Segundo código','Aplicação','Saldo','Mínimo','Última entrada','Última saída','Status'].map(h => <th key={h} className="p-3 text-left text-xs uppercase">{h}</th>)}</tr></thead><tbody>{filteredStock.map((i: any) => <tr key={i.id} className="border-t border-violet-500/10"><td className="p-3 font-semibold">{i.nome}</td><td className="p-3 font-black text-violet-300">{i.codigo_topac}</td><td className="p-3">{i.codigo_alternativo || '—'}</td><td className="p-3 text-slate-300">{i.aplicacao || '—'}</td><td className="p-3 font-black">{fmt(i.saldo)}</td><td className="p-3">{fmt(i.estoque_minimo)}</td><td className="p-3">{date(i.ultima_entrada)}</td><td className="p-3">{date(i.ultima_saida)}</td><td className="p-3 font-bold">{i.status_atual}</td></tr>)}</tbody></table>
              </div>
            </div>
          </div>
        )}

        {mode === 'reposicao' && (
          <div>
            <Back/>
            <SectionTitle title="Itens para Reposição" subtitle="Aqui aparecem somente os materiais sinalizados para compra."/>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lowStock.map((a: any) => <div key={a.item_id || a.id} className="almox-panel p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500 text-white"><AlertTriangle className="h-5 w-5"/></span><div className="min-w-0 flex-1"><b className="block text-sm text-white">{a.nome}</b><div className="mt-1 text-xs text-slate-400">Saldo {fmt(a.saldo)} • mínimo {fmt(a.estoque_minimo)}</div><div className="mt-3 inline-flex rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase text-red-300">{a.prioridade || 'COMPRAR'}</div></div></div></div>)}
              {!lowStock.length && <div className="almox-panel p-10 text-center text-sm text-slate-300 md:col-span-2 xl:col-span-3">Nenhum item sinalizado para reposição.</div>}
            </div>
          </div>
        )}

        {mode === 'movimentacoes' && (
          <div>
            <Back/>
            <SectionTitle title="Últimas Movimentações" subtitle="Entradas e saídas organizadas da mais recente para a mais antiga."/>
            <div className="almox-panel overflow-hidden">
              <div className="divide-y divide-violet-500/15">
                {movements.slice(0, 100).map((r: any) => <div key={r.id} className="flex items-center gap-3 p-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.type === 'Entrada' ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>{r.type === 'Entrada' ? <Plus className="h-4 w-4"/> : <ArrowDownToLine className="h-4 w-4"/>}</span><div className="min-w-0 flex-1"><b className="block truncate text-sm text-white">{r.type} • {r.item?.nome || 'Item'}</b><span className="text-xs text-slate-400">{date(r.when)} • {r.who || '—'}</span></div><b className={r.qty >= 0 ? 'text-emerald-400' : 'text-red-400'}>{r.qty >= 0 ? '+' : ''}{fmt(r.qty)}</b></div>)}
              </div>
            </div>
          </div>
        )}

        {mode === 'relatorios' && (
          <div>
            <Back/>
            <SectionTitle title="Relatórios e Histórico" subtitle="Entradas e saídas ficam separadas para consulta."/>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="almox-panel p-4"><b className="text-white">Entradas</b><div className="mt-3 max-h-[650px] overflow-auto">{entries.map((r: any) => <div key={r.id} className="border-t border-violet-500/15 py-3 text-sm"><b className="text-white">{date(r.data_entrada)} • {itemMap.get(r.item_id)?.nome || 'Item'}</b><div className="mt-1 text-slate-400">Qtd. {fmt(r.quantidade)} • NF {r.nota_fiscal || '—'} • {r.fornecedor || '—'}</div></div>)}</div></div>
              <div className="almox-panel p-4"><b className="text-white">Saídas</b><div className="mt-3 max-h-[650px] overflow-auto">{exits.map((r: any) => <div key={r.id} className="border-t border-violet-500/15 py-3 text-sm"><b className="text-white">{date(r.data_saida)} • {itemMap.get(r.item_id)?.nome || 'Item'}</b><div className="mt-1 text-slate-400">Qtd. {fmt(r.quantidade)} • {r.funcionario_nome || r.mecanico_nome || '—'}</div></div>)}</div></div>
            </div>
          </div>
        )}

        {mode === 'assinatura' && (
          <div>
            <Back/>
            <SectionTitle title="Assinatura Digital • Almoxarifado" subtitle={`${signedCount} assinados • ${pendingCount} pendentes`}/>
            <div className="almox-panel overflow-auto">
              <table className="w-full min-w-[900px] text-sm"><thead><tr>{['Protocolo','Data','Tipo','Funcionário','Veículo','Status','Ação'].map(h => <th key={h} className="p-3 text-left text-xs uppercase">{h}</th>)}</tr></thead><tbody>{loads.map((r: any) => <tr key={r.id} className="border-t border-violet-500/10"><td className="p-3 font-black text-violet-300">{r.protocolo || '—'}</td><td className="p-3">{date(r.data_carga)}</td><td className="p-3 capitalize">{r.tipo || 'mecânico'}</td><td className="p-3">{r.funcionario_nome}</td><td className="p-3">{[r.veiculo, r.placa].filter(Boolean).join(' • ') || '—'}</td><td className="p-3">{r.status_assinatura === 'assinado' ? <span className="inline-flex items-center gap-1 font-bold text-emerald-400"><CheckCircle2 className="h-4 w-4"/>Assinado</span> : <span className="font-bold text-yellow-400">Pendente</span>}</td><td className="p-3">{r.status_assinatura !== 'assinado' && <Button size="sm" onClick={() => signLoad(r)} className="almox-primary">Assinar</Button>}</td></tr>)}</tbody></table>
            </div>
          </div>
        )}

        {mode === 'config' && (
          <div>
            <Back/>
            <SectionTitle title="Configurações do Almoxarifado" subtitle="Carga inicial e manutenção da base oficial."/>
            <div className="space-y-4">
              <AlmoxarifadoExcelImporter companyCode="topac-matriz" companyName="Estoque Central TOPAC"/>
              <div className="almox-panel p-5"><div className="flex gap-3"><ShoppingCart className="h-5 w-5 text-yellow-400"/><div><b className="text-white">Regra de reposição</b><p className="mt-1 text-sm text-slate-400">Os alertas são calculados pelo saldo, mínimo cadastrado e consumo histórico.</p></div></div></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlmoxarifadoDesktopV3;
