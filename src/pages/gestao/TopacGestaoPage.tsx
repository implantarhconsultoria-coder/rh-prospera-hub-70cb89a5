import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Box,
  Building2,
  Car,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Edit,
  FileBarChart,
  FileText,
  Filter,
  Landmark,
  Layers,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Truck,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const topModules = [
  { key: 'locacao', label: 'Locação', icon: Layers },
  { key: 'manutencao', label: 'Manutenção', icon: Wrench },
  { key: 'faturamento', label: 'Faturamento', icon: FileText },
  { key: 'vendas', label: 'Vendas', icon: BarChart3 },
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { key: 'estoque', label: 'Estoque', icon: Box },
  { key: 'compras', label: 'Compras', icon: Truck },
];

const moduleTrees = {
  locacao: [
    { label: 'Comercial', icon: BarChart3, children: ['Prospect', 'Clientes', 'Representantes', 'Alterações de Representantes em Clientes'] },
    { label: 'Operacional', icon: ClipboardList, children: ['Contratos', 'Locações', 'Medições', 'Movimentações', 'Ordem de Serviço'] },
    { label: 'Cadastros', icon: Settings, children: ['Prospect', 'Clientes', 'Representantes', 'Alterações de Representantes em Clientes', 'Tabela de Preços', 'Equipamentos', 'Veículos', 'Localizações', 'Fornecedores', 'Serviços', 'Funcionários', 'Concorrentes', 'Outros Cadastros', 'Relatórios'] },
    { label: 'Painel de Controle', icon: FileBarChart, children: ['Indicadores', 'Relatórios Gerenciais', 'Auditoria'] },
  ],
  manutencao: [
    { label: 'Operacional', icon: Wrench, children: ['Chamados', 'Ordens de Serviço', 'Técnicos', 'Veículos', 'Histórico de Manutenção'] },
    { label: 'Cadastros', icon: Settings, children: ['Equipamentos', 'Serviços', 'Funcionários', 'Fornecedores'] },
    { label: 'Relatórios', icon: FileBarChart, children: ['Manutenções em aberto', 'Custos', 'Produtividade'] },
  ],
  faturamento: [
    { label: 'Operacional', icon: FileText, children: ['Medições', 'Faturas', 'Notas', 'Conferência', 'Reajustes'] },
    { label: 'Cadastros', icon: Settings, children: ['Clientes', 'Contratos', 'Tabela de Preços', 'Serviços'] },
    { label: 'Relatórios', icon: FileBarChart, children: ['Faturamento mensal', 'Pendências', 'Resumo por cliente'] },
  ],
  vendas: [
    { label: 'Comercial', icon: BarChart3, children: ['Prospect', 'Propostas', 'Clientes', 'Representantes', 'Concorrentes'] },
    { label: 'Relatórios', icon: FileBarChart, children: ['Funil de vendas', 'Oportunidades', 'Conversão'] },
  ],
  financeiro: [
    { label: 'Contas', icon: DollarSign, children: ['Contas a Receber', 'Contas a Pagar', 'Bancos', 'Conciliação', 'Fluxo de Caixa'] },
    { label: 'Cadastros', icon: Settings, children: ['Fornecedores', 'Centros de Custo', 'Categorias', 'Contas Bancárias'] },
    { label: 'Relatórios', icon: FileBarChart, children: ['Inadimplência', 'Pagamentos', 'Recebimentos', 'Saldo previsto'] },
  ],
  estoque: [
    { label: 'Operacional', icon: Box, children: ['Itens', 'Entradas', 'Saídas', 'Transferências', 'Inventário'] },
    { label: 'Cadastros', icon: Settings, children: ['Produtos', 'Categorias', 'Localizações', 'Fornecedores'] },
  ],
  compras: [
    { label: 'Operacional', icon: Truck, children: ['Solicitações', 'Pedidos', 'Cotações', 'Recebimentos'] },
    { label: 'Cadastros', icon: Settings, children: ['Fornecedores', 'Produtos', 'Condições de pagamento'] },
    { label: 'Relatórios', icon: FileBarChart, children: ['Compras por período', 'Pendências', 'Fornecedores'] },
  ],
} as const;

const sectionIcons: Record<string, React.ElementType> = {
  Prospect: UserCog,
  Clientes: Users,
  Representantes: UserCog,
  'Alterações de Representantes em Clientes': UserCog,
  'Tabela de Preços': DollarSign,
  Equipamentos: Package,
  Veículos: Car,
  Localizações: Landmark,
  Fornecedores: Building2,
  Serviços: Wrench,
  Funcionários: Users,
  Concorrentes: Building2,
  'Outros Cadastros': Settings,
  Relatórios: FileBarChart,
  Contratos: FileText,
  Locações: Layers,
  Medições: ClipboardList,
  Chamados: Wrench,
  'Ordens de Serviço': ClipboardList,
  Técnicos: Users,
  Faturas: FileText,
  Notas: FileText,
  Conferência: ClipboardList,
  Reajustes: RefreshCw,
  Propostas: FileText,
  'Contas a Receber': DollarSign,
  'Contas a Pagar': DollarSign,
  Bancos: Landmark,
  Conciliação: Landmark,
  'Fluxo de Caixa': BarChart3,
  Itens: Box,
  Entradas: Box,
  Saídas: Box,
  Transferências: Box,
  Inventário: Box,
  Solicitações: ClipboardList,
  Pedidos: FileText,
  Cotações: FileText,
  Recebimentos: DollarSign,
};

type ModuleKey = keyof typeof moduleTrees;

type ClienteFat = {
  id: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj_cpf?: string | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
  status?: string | null;
};

type GridRow = {
  codigo: string;
  nome: string;
  documento: string;
  cidade: string;
  contato: string;
  status: string;
};

const normalizeSection = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const getSectionFromPath = (pathname: string) => {
  const last = pathname.split('/').filter(Boolean).pop() || 'clientes';
  const all = Object.values(moduleTrees).flatMap(groups => groups.flatMap(group => group.children));
  return all.find(item => normalizeSection(item) === last) || 'Clientes';
};

const statusColor = (status?: string | null) => {
  const value = String(status || '').toLowerCase();
  if (value.includes('ativo')) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (value.includes('inativo')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
};

const TopacGestaoPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState<ModuleKey>('locacao');
  const [activeGroup, setActiveGroup] = useState('Cadastros');
  const [activeSection, setActiveSection] = useState(getSectionFromPath(location.pathname));
  const [clientes, setClientes] = useState<ClienteFat[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<GridRow | null>(null);
  const [lastAction, setLastAction] = useState('Aguardando seleção operacional.');

  const activeTree = moduleTrees[activeModule];

  useEffect(() => {
    setActiveSection(getSectionFromPath(location.pathname));
  }, [location.pathname]);

  const carregarClientes = async () => {
    if (activeSection !== 'Clientes') return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('clientes_fat')
        .select('id, razao_social, nome_fantasia, cnpj_cpf, email, telefone, cidade, uf, status')
        .order('razao_social', { ascending: true })
        .limit(150);
      if (error) throw error;
      setClientes(data || []);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarClientes();
  }, [activeSection]);

  const clientesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(cliente => `${cliente.razao_social || ''} ${cliente.nome_fantasia || ''} ${cliente.cnpj_cpf || ''} ${cliente.cidade || ''} ${cliente.uf || ''}`.toLowerCase().includes(q));
  }, [clientes, busca]);

  const currentGroup = activeTree.find(group => group.label === activeGroup) || activeTree[0];
  const SectionIcon = sectionIcons[activeSection] || FileText;

  const selectModule = (moduleKey: ModuleKey) => {
    const nextTree = moduleTrees[moduleKey];
    const nextGroup = nextTree[0];
    const nextSection = nextGroup.children[0];
    setActiveModule(moduleKey);
    setActiveGroup(nextGroup.label);
    setActiveSection(nextSection);
    setSelectedRow(null);
    setLastAction(`Módulo aberto: ${topModules.find(module => module.key === moduleKey)?.label || moduleKey}`);
    navigate(`/admin/gestao/${normalizeSection(nextSection)}`);
  };

  const openSection = (groupLabel: string, section: string) => {
    setActiveGroup(groupLabel);
    setActiveSection(section);
    setSelectedRow(null);
    setLastAction(`Tela aberta: ${section}`);
    navigate(`/admin/gestao/${normalizeSection(section)}`);
  };

  const handleAction = (action: string) => {
    const message = `${action}: ${activeSection}${selectedRow ? ` - ${selectedRow.nome}` : ''}`;
    setLastAction(message);
    toast.info(message);
  };

  const gridRows = activeSection === 'Clientes'
    ? clientesFiltrados.map(cliente => ({
      codigo: cliente.id.slice(0, 8).toUpperCase(),
      nome: cliente.razao_social || cliente.nome_fantasia || 'Cliente sem nome',
      documento: cliente.cnpj_cpf || 'Sem documento',
      cidade: [cliente.cidade, cliente.uf].filter(Boolean).join('/') || '-',
      contato: cliente.email || cliente.telefone || '-',
      status: cliente.status || 'sem status',
    }))
    : [
      { codigo: '000001', nome: `${activeSection} modelo`, documento: 'Cadastro preparado', cidade: 'TOPAC', contato: 'Aguardando conexão', status: 'proposta visual' },
      { codigo: '000002', nome: `${activeSection} operacional`, documento: 'Fluxo DN4-like', cidade: 'TOPAC', contato: 'Próxima fase', status: 'visual' },
      { codigo: '000003', nome: `${activeSection} consulta`, documento: 'Filtro e grade', cidade: 'TOPAC', contato: 'Clique ativo', status: 'teste visual' },
    ];

  return (
    <div className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 text-slate-100 shadow-2xl">
      <div className="border-b border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900">
        <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-cyan-300">TOPAC Gestão Empresarial</span>
            <span className="text-slate-500">|</span>
            <span>Ambiente operacional interno</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">DN4-like funcional</Badge>
            <span>{lastAction}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-700 px-3 py-2">
          {topModules.map(module => {
            const Icon = module.icon;
            const active = activeModule === module.key;
            return (
              <button
                key={module.key}
                onClick={() => selectModule(module.key as ModuleKey)}
                className={`flex items-center gap-2 rounded-t-md border px-4 py-2 text-sm font-semibold transition ${active ? 'border-cyan-500 bg-slate-950 text-cyan-200' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
              >
                <Icon className="h-4 w-4" />
                {module.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-h-[680px] grid-cols-[270px_1fr]">
        <aside className="border-r border-slate-700 bg-slate-900/95">
          <div className="border-b border-slate-700 px-4 py-3">
            <div className="text-sm font-bold text-cyan-200">{topModules.find(module => module.key === activeModule)?.label || 'Locação'}</div>
            <div className="text-xs text-slate-400">Menu operacional em cascata</div>
          </div>

          <div className="space-y-1 p-2">
            {activeTree.map(group => {
              const Icon = group.icon;
              const open = activeGroup === group.label;
              return (
                <div key={group.label} className="rounded-lg border border-slate-800 bg-slate-950/40">
                  <button
                    onClick={() => {
                      setActiveGroup(open ? '' : group.label);
                      setLastAction(`${open ? 'Fechado' : 'Aberto'}: ${group.label}`);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold ${open ? 'text-cyan-200' : 'text-slate-300'}`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{group.label}</span>
                    <ChevronRight className={`h-4 w-4 transition ${open ? 'rotate-90' : ''}`} />
                  </button>
                  {open && (
                    <div className="border-t border-slate-800 py-1">
                      {group.children.map(child => {
                        const ChildIcon = sectionIcons[child] || FileText;
                        const active = activeSection === child;
                        return (
                          <button
                            key={child}
                            onClick={() => openSection(group.label, child)}
                            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-xs transition ${active ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-300 hover:bg-slate-800'}`}
                          >
                            <ChildIcon className="h-3.5 w-3.5" />
                            <span className="truncate">{child}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <main className="bg-slate-950">
          <div className="border-b border-slate-700 bg-slate-900 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300">
                  <SectionIcon className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">{activeSection}</h1>
                  <p className="text-xs text-slate-400">{activeModule.toUpperCase()} &gt; {currentGroup.label} &gt; {activeSection}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleAction('Novo')} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"><Plus className="mr-1 h-4 w-4" />Novo</Button>
                <Button size="sm" variant="outline" onClick={() => handleAction('Alterar')}><Edit className="mr-1 h-4 w-4" />Alterar</Button>
                <Button size="sm" variant="outline" onClick={() => handleAction('Excluir')}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>
                <Button size="sm" variant="outline" onClick={() => handleAction('Consultar')}><Search className="mr-1 h-4 w-4" />Consultar</Button>
                <Button size="sm" variant="outline" onClick={() => handleAction('Imprimir')}><Printer className="mr-1 h-4 w-4" />Imprimir</Button>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-800 bg-slate-950 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input value={busca} onChange={event => setBusca(event.target.value)} placeholder="Localizar por código, nome, documento, cidade, contato..." className="border-slate-700 bg-slate-900 pl-9 text-slate-100" />
              </div>
              <select onChange={(event) => setLastAction(`Filtro status: ${event.target.value}`)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                <option>Todos os status</option>
                <option>Ativos</option>
                <option>Inativos</option>
              </select>
              <select onChange={(event) => setLastAction(`Filtro tipo: ${event.target.value}`)} className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                <option>Todos os tipos</option>
                <option>Cliente</option>
                <option>Fornecedor</option>
              </select>
              <Button variant="outline" onClick={() => { carregarClientes(); setLastAction(`Atualizado: ${activeSection}`); }} disabled={loading}>
                <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_340px]">
            <section className="min-h-[520px] border-r border-slate-800 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Filter className="h-4 w-4 text-cyan-300" />
                  Grade de registros
                </div>
                <div className="text-xs text-slate-500">{gridRows.length} registro(s)</div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-700">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-800 text-xs uppercase text-slate-300">
                    <tr>
                      <th className="border-r border-slate-700 px-3 py-2 text-left">Código</th>
                      <th className="border-r border-slate-700 px-3 py-2 text-left">Nome / Razão</th>
                      <th className="border-r border-slate-700 px-3 py-2 text-left">Documento</th>
                      <th className="border-r border-slate-700 px-3 py-2 text-left">Cidade</th>
                      <th className="border-r border-slate-700 px-3 py-2 text-left">Contato</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((row, index) => (
                      <tr
                        key={`${row.codigo}-${index}`}
                        onClick={() => { setSelectedRow(row); setLastAction(`Registro selecionado: ${row.nome}`); }}
                        className={`cursor-pointer border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/45 hover:bg-cyan-500/10 ${selectedRow?.codigo === row.codigo ? 'bg-cyan-500/20 outline outline-1 outline-cyan-500/50' : ''}`}
                      >
                        <td className="border-r border-slate-800 px-3 py-2 font-mono text-xs text-cyan-300">{row.codigo}</td>
                        <td className="border-r border-slate-800 px-3 py-2 font-semibold text-slate-100">{row.nome}</td>
                        <td className="border-r border-slate-800 px-3 py-2 text-slate-300">{row.documento}</td>
                        <td className="border-r border-slate-800 px-3 py-2 text-slate-300">{row.cidade}</td>
                        <td className="border-r border-slate-800 px-3 py-2 text-slate-300">{row.contato}</td>
                        <td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-xs ${statusColor(row.status)}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="bg-slate-900/55 p-4">
              <div className="mb-3 text-sm font-bold text-cyan-200">Cadastro / Detalhes</div>
              <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
                <div>
                  <label className="text-xs text-slate-400">Código</label>
                  <div className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm">{selectedRow?.codigo || 'AUTO'}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Descrição / Nome</label>
                  <div className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm">{selectedRow?.nome || activeSection}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Documento</label>
                  <div className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm">{selectedRow?.documento || '-'}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">Status</label>
                  <div className="mt-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm">{selectedRow?.status || 'Ativo'}</div>
                </div>
                <div className="rounded border border-dashed border-cyan-500/40 bg-cyan-500/5 p-3 text-xs text-cyan-100">
                  Cliques ativos: módulos, menu, grade e botões já alteram o estado visual da tela. Próxima fase conecta formulário real.
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

export default TopacGestaoPage;
