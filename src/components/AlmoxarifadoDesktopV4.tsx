import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Boxes,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Package,
  Plus,
  Search,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import AlmoxarifadoFechamentoOperacional from '@/components/almoxarifado/AlmoxarifadoFechamentoOperacional';
import RetiradaInteligentePanel from '@/components/almoxarifado/RetiradaInteligentePanel';

const db = supabase as any;
const START = '2026-09-16';
const today = () => new Date().toISOString().slice(0, 10);
const br = (value: any) =>
  value ? new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

type Mode = 'home' | 'entrada' | 'retirada' | 'estoque' | 'dia' | 'relatorios' | 'historico';
type Cart = { item_id: string; quantidade: number; nome: string; codigo: string };
type Props = { isAdmin?: boolean };

type DashboardMovement = {
  id: string;
  date: string;
  type: 'Entrada' | 'Retirada';
  label: string;
  person: string;
  quantity: number | null;
  operatorId?: string | null;
};

const numberValue = (...values: any[]) => {
  const found = values.find((value) => value !== undefined && value !== null && value !== '');
  const parsed = Number(found ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const movementDate = (value: string) => {
  if (!value) return '—';
  const hasTime = value.includes('T');
  const date = new Date(hasTime ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return br(value);
  if (!hasTime) return date.toLocaleDateString('pt-BR');
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const AlmoxarifadoDesktopV4: React.FC<Props> = ({ isAdmin = false }) => {
  const { session, employees, companies } = useApp();
  const [mode, setMode] = useState<Mode>('home');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stock, setStock] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loads, setLoads] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [withdrawalSearch, setWithdrawalSearch] = useState('');
  const [personId, setPersonId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [cart, setCart] = useState<Cart[]>([]);
  const [note, setNote] = useState('');
  const [smart, setSmart] = useState('');
  const [entItem, setEntItem] = useState('');
  const [entQty, setEntQty] = useState('');
  const [entSupplier, setEntSupplier] = useState('');
  const [entNf, setEntNf] = useState('');
  const [entValue, setEntValue] = useState('');
  const [entFile, setEntFile] = useState<File | null>(null);
  const [from, setFrom] = useState(START);
  const [to, setTo] = useState(today());

  const company = (employee: any) =>
    companies.find((companyItem: any) => companyItem.id === (employee.companyId || employee.company_id || employee.empresa_id));
  const name = (employee: any) => employee.name || employee.nome || '';

  const people = useMemo(
    () =>
      employees
        .filter((employee: any) => employee.status === 'ativo' || employee.ativo === true)
        .filter((employee: any) => {
          const employeeName = name(employee).toUpperCase();
          const companyName = String(company(employee)?.name || company(employee)?.nome || '').toUpperCase();
          if (
            employeeName.includes('ANTÔNIO CARLOS') ||
            employeeName.includes('ANTONIO CARLOS') ||
            employeeName.includes('EDENILSON VICTOR')
          )
            return true;
          return (
            !companyName.includes('GOIÂNIA') &&
            !companyName.includes('GOIANIA') &&
            !companyName.includes('GOIÁS') &&
            !companyName.includes('GOIAS')
          );
        })
        .sort((a: any, b: any) => name(a).localeCompare(name(b), 'pt-BR')),
    [employees, companies]
  );

  const fetchData = async () => {
    setLoading(true);
    // A API retorna no máximo uma página por chamada (normalmente 1.000).
    // O inventário importado ultrapassa esse limite; buscar todas as páginas
    // evita que um produto existente desapareça nas telas de entrada/saída.
    const fetchAllStock = async () => {
      const all: any[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await db.from('almoxarifado_estoque_resumo')
          .select('*').eq('ativo', true)
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (page.error) throw page.error;
        const rows = page.data || [];
        all.push(...rows);
        if (rows.length < pageSize) return all;
      }
    };
    const [stockResult, entriesResult, loadsResult] = await Promise.all([
      fetchAllStock().then(data => ({ data, error: null }))
        .catch(error => ({ data: null, error })),
      db.from('almoxarifado_entradas').select('*').gte('data_entrada', START).order('data_entrada', { ascending: false }),
      db.from('almoxarifado_cargas').select('*').gte('created_at', START + 'T00:00:00').order('created_at', { ascending: false }),
    ]);

    if (stockResult.error) toast.error(stockResult.error.message);
    else
      setStock(
        (stockResult.data || []).sort((a: any, b: any) =>
          String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
        )
      );

    if (!entriesResult.error) setEntries(entriesResult.data || []);
    if (!loadsResult.error) setLoads(loadsResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const itemMap = useMemo(() => new Map(stock.map((item: any) => [item.id, item])), [stock]);
  const filtered = stock.filter(
    (item: any) =>
      !search ||
      [item.codigo_topac, item.codigo_alternativo, item.nome, item.aplicacao].some((value) =>
        String(value || '').toLowerCase().includes(search.toLowerCase())
      )
  );
  const withdrawalOptions = stock.filter((item: any) =>
    (Number(item.saldo) > 0 || item.id === itemId) &&
    (!withdrawalSearch.trim() || item.id === itemId ||
      [item.codigo_topac, item.codigo_alternativo, item.nome, item.aplicacao].some((value) =>
        String(value || '').toLocaleLowerCase('pt-BR').includes(withdrawalSearch.trim().toLocaleLowerCase('pt-BR'))
      ))
  );

  const add = () => {
    const item: any = itemMap.get(itemId);
    const quantity = Number(qty);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) return toast.error('Selecione material e quantidade.');
    if (quantity + (cart.find((row) => row.item_id === item.id)?.quantidade || 0) > Number(item.saldo || 0))
      return toast.error('Quantidade acumulada maior que o saldo.');

    setCart((current) => {
      const found = current.find((cartItem) => cartItem.item_id === item.id);
      return found
        ? current.map((cartItem) =>
            cartItem.item_id === item.id ? { ...cartItem, quantidade: cartItem.quantidade + quantity } : cartItem
          )
        : [
            ...current,
            { item_id: item.id, quantidade: quantity, nome: item.nome, codigo: item.codigo_topac },
          ];
    });
    setItemId('');
    setQty('1');
    setWithdrawalSearch('');
  };

  const saveWithdrawal = async () => {
    if (!personId || !cart.length) return toast.error('Selecione funcionário e materiais.');
    if (smart.trim()) return toast.error('Confira e adicione a descrição inteligente ou limpe o campo antes de confirmar.');
    if (cart.some((row) => !Number.isFinite(row.quantidade) || row.quantidade <= 0 || row.quantidade > Number(itemMap.get(row.item_id)?.saldo || 0)))
      return toast.error('Revise as quantidades e os saldos antes de confirmar.');
    setBusy(true);
    try {
      const observations = note.trim();
      const { data, error } = await db.rpc('almoxarifado_criar_carga_v2', {
        p_tipo: 'retirada',
        p_funcionario_id: personId,
        p_veiculo: null,
        p_placa: null,
        p_itens: cart.map((item) => ({ item_id: item.item_id, quantidade: item.quantidade })),
        p_observacoes: observations || null,
      });
      if (error) throw error;
      toast.success(`Retirada ${data?.protocolo || ''} registrada e estoque baixado.`);
      setCart([]);
      setPersonId('');
      setNote('');
      setSmart('');
      await fetchData();
      setMode(isAdmin ? 'dia' : 'home');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao registrar retirada.');
    } finally {
      setBusy(false);
    }
  };

  const saveEntry = async () => {
    const quantity = Number(entQty);
    const value = Number(entValue || 0);
    if (!entItem || quantity <= 0) return toast.error('Selecione item e quantidade.');

    setBusy(true);
    try {
      let url = '';
      if (entFile) {
        const path = `almoxarifado/nf/${Date.now()}-${entFile.name}`;
        const upload = await supabase.storage.from('documentos-ativos').upload(path, entFile);
        if (upload.error) throw upload.error;
        url = supabase.storage.from('documentos-ativos').getPublicUrl(path).data.publicUrl;
      }

      const { error } = await db.from('almoxarifado_entradas').insert({
        user_id: session?.user?.id,
        item_id: entItem,
        quantidade: quantity,
        fornecedor: entSupplier || null,
        valor_unitario: value,
        valor_total: quantity * value,
        nota_fiscal: entNf || null,
        nota_fiscal_url: url || null,
        data_entrada: today(),
        responsavel_nome: session?.user?.email || 'Almoxarifado',
        hora_informada: true,
      });
      if (error) throw error;
      toast.success('Entrada registrada e saldo atualizado.');
      setEntQty('');
      setEntSupplier('');
      setEntNf('');
      setEntValue('');
      setEntFile(null);
      await fetchData();
      setMode('home');
    } catch (error: any) {
      toast.error(error?.message || 'Erro na entrada.');
    } finally {
      setBusy(false);
    }
  };

  const periodLoads = loads.filter((row: any) => {
    const date = String(row.created_at || '').slice(0, 10);
    return date >= from && date <= to;
  });
  const dayLoads = loads.filter((row: any) => String(row.created_at || '').slice(0, 10) === today());
  const dayEntries = entries.filter((row: any) => String(row.data_entrada || row.created_at || '').slice(0, 10) === today());

  const totalUnits = useMemo(
    () => stock.reduce((total: number, item: any) => total + numberValue(item.saldo, item.quantidade), 0),
    [stock]
  );

  const lowStock = useMemo(
    () =>
      stock
        .map((item: any) => ({
          ...item,
          current: numberValue(item.saldo, item.quantidade),
          minimum: numberValue(item.estoque_minimo, item.saldo_minimo, item.quantidade_minima, item.minimo),
        }))
        .filter((item: any) => item.minimum > 0 && item.current <= item.minimum)
        .sort((a: any, b: any) => a.current - b.current),
    [stock]
  );

  const pendingWithdrawals = useMemo(
    () =>
      loads.filter((row: any) => {
        const status = String(row.status || row.situacao || '').toLowerCase();
        return ['pendente', 'aberto', 'aguardando', 'aguardando_assinatura', 'aguardando assinatura'].includes(status);
      }).length,
    [loads]
  );

  const movements = useMemo<DashboardMovement[]>(() => {
    const entryRows: DashboardMovement[] = entries.map((row: any) => {
      const item: any = itemMap.get(row.item_id);
      return {
        id: `e-${row.id}`,
        date: row.created_at || row.datahora || row.data_entrada || '',
        type: 'Entrada',
        label: item?.nome || row.item_nome || row.material_nome || 'Entrada de material',
        person: row.fornecedor || row.origem || 'Estoque',
        quantity: numberValue(row.quantidade) || null,
        operatorId: row.user_id || row.operador_id || null,
      };
    });

    const loadRows: DashboardMovement[] = loads.map((row: any) => ({
      id: `r-${row.id}`,
      date: row.created_at || row.datahora || '',
      type: 'Retirada',
      label: row.material_nome || row.item_nome || row.protocolo || 'Retirada de materiais',
      person: row.funcionario_nome || row.destinatario_nome || row.observacoes || 'Funcionário',
      quantity: numberValue(row.quantidade_total, row.total_itens, row.quantidade) || null,
      operatorId: row.user_id || row.operador_id || row.created_by || null,
    }));

    return [...entryRows, ...loadRows]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 8);
  }, [entries, loads, itemMap]);

  const userMovements = useMemo(() => {
    if (isAdmin || !session?.user?.id) return movements;
    const identifiable = movements.filter((movement) => movement.operatorId);
    if (!identifiable.length) return movements;
    return movements.filter((movement) => !movement.operatorId || movement.operatorId === session.user.id);
  }, [isAdmin, movements, session?.user?.id]);

  const printPerson = (person: any) => {
    const rows = dayLoads.filter((row: any) => row.funcionario_id === person.id);
    if (!rows.length) return;
    const popup = window.open('', '_blank');
    if (!popup) return;
    popup.document.write(`<html><head><title>Retiradas - ${name(person)}</title><style>body{font-family:Arial;padding:28px}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left}.sign{margin-top:60px;border-top:1px solid #111;padding-top:6px;width:360px}</style></head><body><h1>TOPAC — Relatório diário de retiradas</h1><p><b>Funcionário:</b> ${name(person)}<br/><b>Data:</b> ${br(today())}<br/><b>Operador:</b> ${session?.user?.email || 'Almoxarifado'}</p><table><tr><th>Hora</th><th>Protocolo</th><th>Registro</th></tr>${rows
      .map(
        (row: any) =>
          `<tr><td>${new Date(row.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}</td><td>${row.protocolo || '—'}</td><td>${row.observacoes || 'Retirada registrada no estoque'}</td></tr>`
      )
      .join('')}</table><div class='sign'>Assinatura do funcionário</div></body></html>`);
    popup.document.close();
    popup.print();
  };

  if (loading)
    return (
      <div className="almox-v3 grid min-h-[480px] place-items-center">
        <div className="flex gap-2 text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando...
        </div>
      </div>
    );

  const back = (
    <button className="almox-back" onClick={() => setMode('home')}>
      <ArrowLeft className="h-4 w-4" />
      Voltar ao painel
    </button>
  );

  const StatCard = ({ icon: Icon, label, value, note, tone }: any) => {
    const tones: Record<string, string> = {
      green: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
      purple: 'text-violet-400 border-violet-500/20 bg-violet-500/10',
      red: 'text-rose-400 border-rose-500/20 bg-rose-500/10',
      yellow: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10',
    };
    return (
      <div className="almox-panel flex min-h-[112px] items-center gap-4 p-5">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${tones[tone] || tones.purple}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-400">{label}</div>
          <div className="mt-1 text-3xl font-black tracking-tight text-white">{value}</div>
          {note && <div className="mt-1 truncate text-[11px] text-slate-500">{note}</div>}
        </div>
      </div>
    );
  };

  const ActionCard = ({ icon: Icon, title, subtitle, target }: any) => (
    <button onClick={() => setMode(target)} className="almox-hub-card tone-purple">
      <span className="almox-hub-icon">
        <Icon className="h-5 w-5" />
      </span>
      <div className="almox-hub-title">{title}</div>
      <div className="almox-hub-subtitle">{subtitle}</div>
      <ChevronRight className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" />
    </button>
  );

  const MovementTable = ({ rows, title }: { rows: DashboardMovement[]; title: string }) => (
    <div className="almox-panel overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <h3 className="text-sm font-extrabold text-white">{title}</h3>
        <button onClick={() => setMode('historico')} className="text-xs font-bold text-violet-400 hover:text-violet-300">
          Ver todas
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-xs">
          <thead className="text-slate-500">
            <tr className="border-b border-slate-800/80">
              <th className="px-5 py-3 font-semibold">Data/Hora</th>
              <th className="px-3 py-3 font-semibold">Tipo</th>
              <th className="px-3 py-3 font-semibold">Material / Registro</th>
              <th className="px-3 py-3 font-semibold">Funcionário / Destino</th>
              <th className="px-5 py-3 text-right font-semibold">Qtd.</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((movement) => (
              <tr key={movement.id} className="border-b border-slate-800/60 last:border-0">
                <td className="whitespace-nowrap px-5 py-3 text-slate-400">{movementDate(movement.date)}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold ${
                      movement.type === 'Entrada'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {movement.type === 'Entrada' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {movement.type}
                  </span>
                </td>
                <td className="max-w-[260px] truncate px-3 py-3 font-medium text-slate-200">{movement.label}</td>
                <td className="max-w-[260px] truncate px-3 py-3 text-slate-400">{movement.person}</td>
                <td className="px-5 py-3 text-right font-bold text-white">{movement.quantity ?? '—'}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                  Nenhuma movimentação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const AttentionPanel = () => (
    <div className="almox-panel overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <h3 className="text-sm font-extrabold text-white">Itens em atenção</h3>
        <button onClick={() => setMode('estoque')} className="text-xs font-bold text-violet-400 hover:text-violet-300">
          Ver todos
        </button>
      </div>
      <div className="divide-y divide-slate-800/60 px-5">
        {lowStock.slice(0, 6).map((item: any) => (
          <div key={item.id} className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-slate-200">{item.nome}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Mínimo: {item.minimum}</div>
            </div>
            <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-400">{item.current}</span>
          </div>
        ))}
        {!lowStock.length && <div className="py-8 text-center text-xs text-slate-500">Nenhum item abaixo do mínimo.</div>}
      </div>
    </div>
  );

  const renderAdminHome = () => (
    <>
      <div className="mb-5 rounded-[20px] border border-slate-800/90 bg-gradient-to-br from-slate-900/95 to-slate-950/95 px-6 py-5">
        <h1 className="text-3xl font-black tracking-tight text-white">Almoxarifado</h1>
        <p className="mt-1 text-sm text-slate-400">Controle de entrada, saída e fechamento diário de materiais.</p>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Total de itens" value={totalUnits.toLocaleString('pt-BR')} note={`${stock.length} materiais cadastrados`} tone="green" />
        <StatCard icon={History} label="Movimentações do dia" value={dayEntries.length + dayLoads.length} note="entradas e retiradas" tone="purple" />
        <StatCard icon={UserRound} label="Retiradas pendentes" value={pendingWithdrawals} note="aguardando conclusão" tone="yellow" />
        <StatCard icon={AlertTriangle} label="Itens em atenção" value={lowStock.length} note="estoque abaixo do mínimo" tone="red" />
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ActionCard icon={Plus} title="Entrada" subtitle="Registrar a entrada de materiais" target="entrada" />
        <ActionCard icon={ShoppingCart} title="Retirada por funcionário" subtitle="Vincular saída a um funcionário" target="retirada" />
        <ActionCard icon={Boxes} title="Estoque" subtitle="Consultar saldos e localização" target="estoque" />
        <ActionCard icon={ClipboardList} title="Fechamento do dia" subtitle="Conferir e finalizar movimentações" target="dia" />
        <ActionCard icon={FileText} title="Relatórios" subtitle="Emissão de relatórios e controles" target="relatorios" />
        <ActionCard icon={History} title="Histórico" subtitle="Visualizar todas as movimentações" target="historico" />
      </div>

      <AlmoxarifadoFechamentoOperacional />

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <MovementTable rows={movements} title="Últimas movimentações" />
        <AttentionPanel />
      </div>
    </>
  );

  const renderTeamHome = () => (
    <>
      <div className="mb-5 rounded-[20px] border border-slate-800/90 bg-gradient-to-br from-slate-900/95 to-slate-950/95 px-6 py-5">
        <h1 className="text-3xl font-black tracking-tight text-white">Almoxarifado</h1>
        <p className="mt-1 text-sm text-slate-400">Movimentações simples e consulta de materiais.</p>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label="Itens em estoque" value={totalUnits.toLocaleString('pt-BR')} note="materiais disponíveis" tone="green" />
        <StatCard icon={ArrowUp} label="Entradas hoje" value={dayEntries.length} note="registros de entrada" tone="green" />
        <StatCard icon={ArrowDown} label="Saídas hoje" value={dayLoads.length} note="retiradas registradas" tone="red" />
        <StatCard icon={AlertTriangle} label="Itens em atenção" value={lowStock.length} note="estoque baixo" tone="yellow" />
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard icon={Plus} title="Registrar entrada" subtitle="Dar entrada em novos materiais" target="entrada" />
        <ActionCard icon={ShoppingCart} title="Registrar retirada" subtitle="Retirar materiais do estoque" target="retirada" />
        <ActionCard icon={Search} title="Consultar estoque" subtitle="Buscar e verificar materiais" target="estoque" />
        <ActionCard icon={History} title="Minhas movimentações" subtitle="Ver os registros de uso" target="historico" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <MovementTable rows={userMovements} title="Movimentações recentes" />
        <AttentionPanel />
      </div>
    </>
  );

  const historyRows = !isAdmin && session?.user?.id
    ? loads.filter((row: any) => {
        const operator = row.user_id || row.operador_id || row.created_by;
        return operator ? operator === session.user.id : true;
      })
    : loads;

  return (
    <div className="almox-v3 p-4 md:p-6">
      {mode === 'home' && (isAdmin ? renderAdminHome() : renderTeamHome())}

      {mode === 'retirada' && (
        <>
          {back}
          <h2 className="mb-4 text-2xl font-black text-white">Retirada por funcionário</h2>
          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <div className="almox-panel p-5">
              <label className="almox-label">Funcionário</label>
              <select className="almox-control mt-2" value={personId} onChange={(event) => setPersonId(event.target.value)}>
                <option value="">Selecionar...</option>
                {people.map((person: any) => (
                  <option key={person.id} value={person.id}>
                    {name(person)}
                  </option>
                ))}
              </select>
              <RetiradaInteligentePanel
                value={smart}
                onChange={setSmart}
                stock={stock}
                cart={cart}
                onAdd={setCart}
                busy={busy}
              />
              <Textarea
                className="almox-textarea mt-3"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Observação opcional"
              />
            </div>
            <div className="almox-panel p-5">
              <div className="mb-3">
                <Input value={withdrawalSearch} onChange={(event) => setWithdrawalSearch(event.target.value)}
                  placeholder="Buscar material pelo nome ou código em todo o Almoxarifado" />
                <p className="mt-1 text-xs text-slate-400">
                  {withdrawalOptions.length} material(is) para selecionar • catálogo completo: {stock.length}.
                  Só materiais com saldo positivo podem sair.
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_110px_auto]">
                <select className="almox-control" value={itemId} onChange={(event) => setItemId(event.target.value)}>
                  <option value="">Material...</option>
                  {withdrawalOptions.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo_topac} — {item.nome} — saldo {item.saldo}
                    </option>
                  ))}
                </select>
                <Input value={qty} onChange={(event) => setQty(event.target.value)} type="number" min="1" />
                <Button onClick={add}>Adicionar</Button>
              </div>
              {withdrawalSearch.trim() && withdrawalOptions.length === 0 && (
                <p className="mt-2 text-sm text-amber-300">Nenhum material com saldo disponível corresponde à busca. Consulte o estoque geral ou registre a entrada se o material estiver fisicamente disponível.</p>
              )}
              <div className="mt-4 space-y-2">
                {cart.map((item) => (
                  <div key={item.item_id} className="flex justify-between rounded-xl border border-slate-700 p-3 text-white">
                    <span>
                      {item.codigo} — {item.nome}
                    </span>
                    <b>{item.quantidade}</b>
                  </div>
                ))}
              </div>
              <Button className="mt-5 w-full" disabled={busy || !personId || !cart.length || !!smart.trim()} onClick={saveWithdrawal}>
                {busy ? 'Registrando...' : 'Confirmar retirada e baixar estoque'}
              </Button>
            </div>
          </div>
        </>
      )}

      {mode === 'entrada' && (
        <>
          {back}
          <h2 className="mb-4 text-2xl font-black text-white">Entrada de materiais</h2>
          <div className="almox-panel grid gap-3 p-5 md:grid-cols-2">
            <select className="almox-control md:col-span-2" value={entItem} onChange={(event) => setEntItem(event.target.value)}>
              <option value="">Material...</option>
              {stock.map((item: any) => (
                <option key={item.id} value={item.id}>
                  {item.codigo_topac} — {item.nome}
                </option>
              ))}
            </select>
            <Input placeholder="Quantidade" type="number" value={entQty} onChange={(event) => setEntQty(event.target.value)} />
            <Input placeholder="Valor unitário" type="number" value={entValue} onChange={(event) => setEntValue(event.target.value)} />
            <Input placeholder="Fornecedor" value={entSupplier} onChange={(event) => setEntSupplier(event.target.value)} />
            <Input placeholder="Nota fiscal" value={entNf} onChange={(event) => setEntNf(event.target.value)} />
            <Input
              className="md:col-span-2"
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) => setEntFile(event.target.files?.[0] || null)}
            />
            <Button className="md:col-span-2" disabled={busy} onClick={saveEntry}>
              Registrar entrada
            </Button>
          </div>
        </>
      )}

      {mode === 'estoque' && (
        <>
          {back}
          <h2 className="mb-4 text-2xl font-black text-white">Estoque atual</h2>
          <div className="almox-panel p-5">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Código ou material"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              {filtered.map((item: any) => (
                <div key={item.id} className="flex justify-between rounded-xl border border-slate-700 p-3 text-white">
                  <span>
                    <b>{item.codigo_topac}</b> — {item.nome}
                  </span>
                  <b>{item.saldo}</b>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {mode === 'dia' && isAdmin && (
        <>
          {back}
          <h2 className="mb-1 text-2xl font-black text-white">Fechamento do dia</h2>
          <p className="mb-4 text-slate-300">Imprima um relatório para cada funcionário que retirou material hoje. Assinatura é manual.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {people
              .filter((person: any) => dayLoads.some((row: any) => row.funcionario_id === person.id))
              .map((person: any) => (
                <button key={person.id} onClick={() => printPerson(person)} className="almox-panel p-5 text-left text-white">
                  <b>{name(person)}</b>
                  <div className="mt-1 text-sm text-slate-300">
                    {dayLoads.filter((row: any) => row.funcionario_id === person.id).length} registro(s) • imprimir
                  </div>
                </button>
              ))}
          </div>
        </>
      )}

      {mode === 'relatorios' && isAdmin && (
        <>
          {back}
          <h2 className="mb-4 text-2xl font-black text-white">Relatórios</h2>
          <div className="almox-panel p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-white">
                De
                <Input type="date" value={from} min={START} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="text-white">
                Até
                <Input type="date" value={to} min={START} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
            <div className="mt-5 text-white">
              <b>{periodLoads.length}</b> protocolos no período. Use 1 dia, 3 dias, 7 dias ou o mês completo alterando as datas.
            </div>
          </div>
        </>
      )}

      {mode === 'historico' && (
        <>
          {back}
          <h2 className="mb-4 text-2xl font-black text-white">{isAdmin ? 'Histórico operacional' : 'Minhas movimentações'}</h2>
          <div className="almox-panel p-5 text-white">
            <p className="mb-4 text-sm text-slate-300">
              Registros anteriores a {br(START)} ficam arquivados e não aparecem na operação corrente.
            </p>
            {historyRows.map((row: any) => (
              <div key={row.id} className="border-b border-slate-700 py-3">
                <b>{row.funcionario_nome || 'Funcionário'}</b> • {br(row.created_at)} • {row.protocolo || '—'}
              </div>
            ))}
            {!historyRows.length && <div className="py-6 text-sm text-slate-500">Nenhuma movimentação encontrada.</div>}
          </div>
        </>
      )}
    </div>
  );
};

export default AlmoxarifadoDesktopV4;
