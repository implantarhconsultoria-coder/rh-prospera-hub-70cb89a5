import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileSignature,
  Landmark,
  Layers,
  Loader2,
  PackageCheck,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const moduloItems = [
  { slug: '', title: 'Painel', description: 'Visao geral de clientes, contratos, medicoes, faturamento e financeiro.', icon: BarChart3 },
  { slug: 'clientes', title: 'Clientes', description: 'Consulta, cadastro e ficha unica operacional.', icon: Users },
  { slug: 'contratos', title: 'Contratos', description: 'Contratos ativos, regras de faturamento, reajustes e vinculos.', icon: FileSignature },
  { slug: 'locacoes', title: 'Locacoes', description: 'Controle de locacao por cliente, obra, periodo e status.', icon: Layers },
  { slug: 'equipamentos', title: 'Equipamentos', description: 'Equipamentos vinculados a contratos, obras e medicoes.', icon: PackageCheck },
  { slug: 'medicoes', title: 'Medicoes', description: 'Apuracao, validacao e liberacao para faturamento.', icon: ClipboardCheck },
  { slug: 'faturamento', title: 'Faturamento', description: 'Geracao e acompanhamento de faturas/notas.', icon: Receipt },
  { slug: 'receber', title: 'Contas a Receber', description: 'Titulos, vencimentos, baixas e inadimplencia.', icon: ArrowDownCircle },
  { slug: 'pagar', title: 'Contas a Pagar', description: 'Fornecedores, despesas, aprovacao e pagamentos.', icon: ArrowUpCircle },
  { slug: 'bancos', title: 'Bancos', description: 'Contas bancarias, saldos e movimentacoes.', icon: Landmark },
  { slug: 'conciliacao', title: 'Conciliação', description: 'Conferencia bancaria e conciliacao financeira.', icon: ShieldCheck },
  { slug: 'relatorios', title: 'Relatorios', description: 'Indicadores gerenciais e relatorios para diretoria.', icon: Building2 },
];

const fluxoOperacional = [
  'Cliente',
  'Contrato',
  'Obra/Entrega',
  'Locacao/Equipamento',
  'Medicao',
  'Fatura',
  'Titulo',
  'Baixa',
  'Banco',
];

type ClienteFat = {
  id: string;
  razao_social?: string | null;
  nome_fantasia?: string | null;
  cnpj_cpf?: string | null;
  inscricao_estadual?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  status?: string | null;
  origem?: string | null;
  observacoes?: string | null;
  responsavel_contato?: string | null;
  condicao_pagamento?: string | null;
};

type ContratoGestao = {
  id: string;
  numero?: string | null;
  status?: string | null;
  tipo?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  valor_mensal?: number | null;
};

type FaturaGestao = {
  id: string;
  numero?: string | null;
  competencia?: string | null;
  data_vencimento?: string | null;
  total?: number | null;
  status?: string | null;
};

type TituloReceberGestao = {
  id: string;
  data_vencimento?: string | null;
  valor_original?: number | null;
  saldo?: number | null;
  status?: string | null;
};

type ClienteDetalhe = {
  contratos: ContratoGestao[];
  faturas: FaturaGestao[];
  titulos: TituloReceberGestao[];
};

const normalizePathSection = (pathname: string) => {
  const match = pathname.match(/\/admin\/gestao\/?([^/]*)/);
  return match?.[1] || '';
};

const formatBRL = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const [date] = String(value).split('T');
  const parts = date.split('-');
  if (parts.length !== 3) return value;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const InfoLine = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="rounded-xl border bg-background px-3 py-2">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm font-semibold text-foreground break-words">{value || '-'}</div>
  </div>
);

const EmptyBlock = ({ text = 'Será conectado na próxima fase.' }: { text?: string }) => (
  <div className="rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">{text}</div>
);

const TopacGestaoPage: React.FC = () => {
  const location = useLocation();
  const activeSlug = normalizePathSection(location.pathname);
  const activeItem = moduloItems.find(item => item.slug === activeSlug) || moduloItems[0];
  const ActiveIcon = activeItem.icon;

  const [clientes, setClientes] = useState<ClienteFat[]>([]);
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState('');
  const [detalhe, setDetalhe] = useState<ClienteDetalhe>({ contratos: [], faturas: [], titulos: [] });
  const [busca, setBusca] = useState('');
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [erroClientes, setErroClientes] = useState('');

  const carregarClientes = async () => {
    setLoadingClientes(true);
    setErroClientes('');
    try {
      const { data, error } = await (supabase as any)
        .from('clientes_fat')
        .select('id, razao_social, nome_fantasia, cnpj_cpf, inscricao_estadual, email, telefone, endereco, cidade, uf, cep, status, origem, observacoes, responsavel_contato, condicao_pagamento')
        .order('razao_social', { ascending: true });
      if (error) throw error;
      setClientes(data || []);
      if (!clienteSelecionadoId && data?.[0]?.id) setClienteSelecionadoId(data[0].id);
    } catch (error: any) {
      const message = error?.message || 'Erro ao carregar clientes.';
      setErroClientes(message);
      toast.error(message);
    } finally {
      setLoadingClientes(false);
    }
  };

  const carregarDetalheCliente = async (clienteId: string) => {
    if (!clienteId) {
      setDetalhe({ contratos: [], faturas: [], titulos: [] });
      return;
    }

    setLoadingDetalhe(true);
    try {
      const [contratosResp, faturasResp, titulosResp] = await Promise.all([
        (supabase as any)
          .from('contratos')
          .select('id, numero, status, tipo, data_inicio, data_fim, valor_mensal')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('faturas')
          .select('id, numero, competencia, data_vencimento, total, status')
          .eq('cliente_id', clienteId)
          .order('data_vencimento', { ascending: false }),
        (supabase as any)
          .from('titulos_receber')
          .select('id, data_vencimento, valor_original, saldo, status')
          .eq('cliente_id', clienteId)
          .order('data_vencimento', { ascending: false }),
      ]);

      if (contratosResp.error) throw contratosResp.error;
      if (faturasResp.error) throw faturasResp.error;
      if (titulosResp.error) throw titulosResp.error;

      setDetalhe({
        contratos: contratosResp.data || [],
        faturas: faturasResp.data || [],
        titulos: titulosResp.data || [],
      });
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao carregar ficha unica do cliente.');
      setDetalhe({ contratos: [], faturas: [], titulos: [] });
    } finally {
      setLoadingDetalhe(false);
    }
  };

  useEffect(() => {
    if (activeSlug === 'clientes') carregarClientes();
  }, [activeSlug]);

  useEffect(() => {
    if (activeSlug === 'clientes') carregarDetalheCliente(clienteSelecionadoId);
  }, [activeSlug, clienteSelecionadoId]);

  const clientesFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(cliente => `${cliente.razao_social || ''} ${cliente.nome_fantasia || ''} ${cliente.cnpj_cpf || ''} ${cliente.cidade || ''} ${cliente.uf || ''}`.toLowerCase().includes(q));
  }, [clientes, busca]);

  const clienteSelecionado = clientes.find(cliente => cliente.id === clienteSelecionadoId) || clientesFiltrados[0] || null;
  const resumoClientes = useMemo(() => {
    const total = clientes.length;
    const ativos = clientes.filter(cliente => String(cliente.status || '').toLowerCase().includes('ativo')).length;
    const inativos = clientes.filter(cliente => String(cliente.status || '').toLowerCase().includes('inativo')).length;
    const semDocumento = clientes.filter(cliente => !String(cliente.cnpj_cpf || '').trim()).length;
    return { total, ativos, inativos, semDocumento };
  }, [clientes]);

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="rounded-3xl border border-primary/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white shadow-2xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Modulo interno separado do RH
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">TOPAC Gestão</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                Estrutura para clientes, contratos, locacoes, medicoes, faturamento, contas a receber, contas a pagar,
                bancos, conciliacao e relatorios. O modulo fica separado do RH e preserva o faturamento/financeiro antigo.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="font-semibold text-white">Entrega atual</div>
            <div>Menu + Clientes com ficha unica funcional.</div>
            <div className="mt-2 text-xs text-slate-400">Sem migracao de dados nesta fase.</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <aside className="card-premium p-4">
          <div className="mb-3 text-sm font-bold text-foreground">Menu TOPAC Gestão</div>
          <nav className="space-y-1">
            {moduloItems.map(item => {
              const Icon = item.icon;
              const to = item.slug ? `/admin/gestao/${item.slug}` : '/admin/gestao';
              const active = item.slug === activeSlug;
              return (
                <Link
                  key={item.slug || 'painel'}
                  to={to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="space-y-5">
          <div className="card-premium p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{activeItem.title}</h2>
                    <p className="text-sm text-muted-foreground">{activeItem.description}</p>
                  </div>
                </div>
              </div>
              {activeSlug === 'clientes' ? (
                <Button variant="outline" onClick={carregarClientes} disabled={loadingClientes}>
                  {loadingClientes ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Atualizar clientes
                </Button>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground">
                  <Search className="h-4 w-4" />
                  Consulta rapida sera conectada na fase funcional
                </div>
              )}
            </div>
          </div>

          {activeSlug === '' && (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {moduloItems.filter(item => item.slug).slice(0, 8).map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.slug} to={`/admin/gestao/${item.slug}`} className="card-premium group p-4 transition hover:-translate-y-0.5 hover:border-primary/30">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="font-semibold">{item.title}</div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </Link>
                  );
                })}
              </div>

              <div className="card-premium p-5">
                <h3 className="mb-4 text-lg font-bold">Fluxo operacional do modulo</h3>
                <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
                  {fluxoOperacional.map((etapa, index) => (
                    <div key={etapa} className="rounded-2xl border bg-muted/30 p-3 text-center">
                      <div className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</div>
                      <div className="text-xs font-semibold">{etapa}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeSlug === 'clientes' && (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="card-premium p-4"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{resumoClientes.total}</div></div>
                <div className="card-premium p-4"><div className="text-xs text-muted-foreground">Ativos</div><div className="text-2xl font-bold text-emerald-600">{resumoClientes.ativos}</div></div>
                <div className="card-premium p-4"><div className="text-xs text-muted-foreground">Inativos</div><div className="text-2xl font-bold text-amber-600">{resumoClientes.inativos}</div></div>
                <div className="card-premium p-4"><div className="text-xs text-muted-foreground">Sem documento</div><div className="text-2xl font-bold text-destructive">{resumoClientes.semDocumento}</div></div>
              </div>

              <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
                <div className="card-premium p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar razao, fantasia, CNPJ, cidade ou UF..." />
                  </div>
                  {erroClientes && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mr-2 inline h-4 w-4" />{erroClientes}</div>}
                  <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                    {loadingClientes && <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando clientes...</div>}
                    {!loadingClientes && clientesFiltrados.map(cliente => (
                      <button
                        key={cliente.id}
                        onClick={() => setClienteSelecionadoId(cliente.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition hover:bg-muted/40 ${clienteSelecionado?.id === cliente.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">{cliente.razao_social || cliente.nome_fantasia || 'Cliente sem nome'}</div>
                            <div className="text-xs text-muted-foreground">{cliente.cnpj_cpf || 'Sem CNPJ/CPF'} - {[cliente.cidade, cliente.uf].filter(Boolean).join('/') || 'Cidade pendente'}</div>
                          </div>
                          <Badge variant="outline">{cliente.status || 'sem status'}</Badge>
                        </div>
                      </button>
                    ))}
                    {!loadingClientes && clientesFiltrados.length === 0 && <EmptyBlock text="Nenhum cliente encontrado para esta busca." />}
                  </div>
                </div>

                <div className="card-premium p-5 space-y-5">
                  {!clienteSelecionado ? (
                    <EmptyBlock text="Selecione um cliente para abrir a ficha unica." />
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-xl font-bold">{clienteSelecionado.razao_social || clienteSelecionado.nome_fantasia}</h3>
                          <p className="text-sm text-muted-foreground">Ficha unica operacional do cliente.</p>
                        </div>
                        <Badge>{clienteSelecionado.status || 'sem status'}</Badge>
                      </div>

                      {loadingDetalhe && <div className="flex items-center gap-2 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando vinculos do cliente...</div>}

                      <section className="space-y-3">
                        <h4 className="font-bold">1. Dados principais</h4>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <InfoLine label="Razao social" value={clienteSelecionado.razao_social} />
                          <InfoLine label="Nome fantasia" value={clienteSelecionado.nome_fantasia} />
                          <InfoLine label="CNPJ/CPF" value={clienteSelecionado.cnpj_cpf} />
                          <InfoLine label="Inscricao estadual" value={clienteSelecionado.inscricao_estadual} />
                          <InfoLine label="Origem" value={clienteSelecionado.origem} />
                          <InfoLine label="Observacoes" value={clienteSelecionado.observacoes} />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">2. Contatos</h4>
                        <div className="grid gap-3 md:grid-cols-3">
                          <InfoLine label="E-mail" value={clienteSelecionado.email} />
                          <InfoLine label="Telefone" value={clienteSelecionado.telefone} />
                          <InfoLine label="Responsavel/contato" value={clienteSelecionado.responsavel_contato} />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">3. Cobranca</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                          <InfoLine label="Condicao/observacao" value={clienteSelecionado.condicao_pagamento || clienteSelecionado.observacoes} />
                          <InfoLine label="Status financeiro" value={detalhe.titulos.some(titulo => Number(titulo.saldo || 0) > 0) ? 'Possui titulos em aberto' : 'Sem saldo aberto carregado'} />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">4. Entrega/Obra</h4>
                        <div className="grid gap-3 md:grid-cols-4">
                          <InfoLine label="Endereco" value={clienteSelecionado.endereco} />
                          <InfoLine label="Cidade" value={clienteSelecionado.cidade} />
                          <InfoLine label="UF" value={clienteSelecionado.uf} />
                          <InfoLine label="CEP" value={clienteSelecionado.cep} />
                        </div>
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">5. Contratos</h4>
                        {detalhe.contratos.length ? <div className="space-y-2">{detalhe.contratos.map(contrato => <div key={contrato.id} className="rounded-2xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">Contrato {contrato.numero || '-'}</div><Badge variant="outline">{contrato.status || 'sem status'}</Badge></div><div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-4"><span>Tipo: {contrato.tipo || '-'}</span><span>Inicio: {formatDate(contrato.data_inicio)}</span><span>Fim: {formatDate(contrato.data_fim)}</span><span>Valor: {formatBRL(contrato.valor_mensal)}</span></div></div>)}</div> : <EmptyBlock text="Nenhum contrato vinculado encontrado." />}
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">6. Locacoes/Equipamentos</h4>
                        <EmptyBlock text="Bloco preparado. Sera conectado na proxima fase quando a relacao de locacoes/equipamentos for validada." />
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">7. Medicoes</h4>
                        <EmptyBlock text="Bloco preparado. A conexao segura por contratos sera feita na proxima fase." />
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">8. Faturas</h4>
                        {detalhe.faturas.length ? <div className="space-y-2">{detalhe.faturas.map(fatura => <div key={fatura.id} className="rounded-2xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">Fatura {fatura.numero || '-'}</div><Badge variant="outline">{fatura.status || 'sem status'}</Badge></div><div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-3"><span>Competencia: {fatura.competencia || '-'}</span><span>Vencimento: {formatDate(fatura.data_vencimento)}</span><span>Total: {formatBRL(fatura.total)}</span></div></div>)}</div> : <EmptyBlock text="Nenhuma fatura vinculada encontrada." />}
                      </section>

                      <section className="space-y-3">
                        <h4 className="font-bold">9. Financeiro</h4>
                        {detalhe.titulos.length ? <div className="space-y-2">{detalhe.titulos.map(titulo => <div key={titulo.id} className="rounded-2xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-semibold">Vencimento {formatDate(titulo.data_vencimento)}</div><Badge variant="outline">{titulo.status || 'sem status'}</Badge></div><div className="mt-2 grid gap-2 text-sm text-muted-foreground md:grid-cols-2"><span>Valor original: {formatBRL(titulo.valor_original)}</span><span>Saldo: {formatBRL(titulo.saldo)}</span></div></div>)}</div> : <EmptyBlock text="Nenhum titulo a receber vinculado encontrado." />}
                      </section>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSlug !== '' && activeSlug !== 'clientes' && (
            <div className="card-premium p-5">
              <h3 className="text-lg font-bold">Base do setor: {activeItem.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Esta tela permanece como esqueleto seguro. A proxima fase conecta tabelas, acoes, filtros, validacoes e relatorios sem mexer no RH ou ponto.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Consulta</div>
                  <div className="mt-1 font-semibold">Lista e filtros</div>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Operacao</div>
                  <div className="mt-1 font-semibold">Cadastro/edicao</div>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-4">
                  <div className="text-xs text-muted-foreground">Controle</div>
                  <div className="mt-1 font-semibold">Status e historico</div>
                </div>
              </div>
            </div>
          )}
        </main>
      </section>
    </div>
  );
};

export default TopacGestaoPage;
