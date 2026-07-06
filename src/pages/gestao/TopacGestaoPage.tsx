import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Building2,
  ClipboardCheck,
  FileSignature,
  Landmark,
  Layers,
  PackageCheck,
  Receipt,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

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

const fichaBlocos = [
  'Dados principais',
  'Contatos',
  'Cobranca',
  'Entrega/Obra',
  'Representantes',
  'Tributacao',
  'Contratos',
  'Locacoes/Equipamentos',
  'Medicoes',
  'Faturas',
  'Financeiro',
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

const normalizePathSection = (pathname: string) => {
  const match = pathname.match(/\/admin\/gestao\/?([^/]*)/);
  return match?.[1] || '';
};

const TopacGestaoPage: React.FC = () => {
  const location = useLocation();
  const activeSlug = normalizePathSection(location.pathname);
  const activeItem = moduloItems.find(item => item.slug === activeSlug) || moduloItems[0];
  const ActiveIcon = activeItem.icon;

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
                Estrutura inicial para clientes, contratos, locacoes, medicoes, faturamento, contas a receber, contas a pagar,
                bancos, conciliacao e relatorios. O modulo nasce separado do RH, sem apagar o faturamento/financeiro atual.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="font-semibold text-white">Primeira entrega</div>
            <div>Esqueleto navegavel + ficha unica visual.</div>
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
              <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                Consulta rapida sera conectada na fase funcional
              </div>
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
                <h3 className="mb-4 text-lg font-bold">Fluxo operacional do módulo</h3>
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
            <div className="card-premium p-5">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold">Ficha unica do cliente</h3>
                  <p className="text-sm text-muted-foreground">Modelo visual para centralizar tudo em uma pagina antes da conexao funcional.</p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600">Proposta visual</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {fichaBlocos.map((bloco) => (
                  <div key={bloco} className="rounded-2xl border bg-background p-4">
                    <div className="font-semibold">{bloco}</div>
                    <div className="mt-2 h-2 w-24 rounded-full bg-muted" />
                    <div className="mt-3 space-y-2">
                      <div className="h-2 rounded-full bg-muted/70" />
                      <div className="h-2 w-2/3 rounded-full bg-muted/70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSlug !== '' && activeSlug !== 'clientes' && (
            <div className="card-premium p-5">
              <h3 className="text-lg font-bold">Base do setor: {activeItem.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Esta tela foi criada como esqueleto seguro. A proxima fase conecta tabelas, acoes, filtros, validacoes e relatorios sem mexer no RH ou ponto.
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
