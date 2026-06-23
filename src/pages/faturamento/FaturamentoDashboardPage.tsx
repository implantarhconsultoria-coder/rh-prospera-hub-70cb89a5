import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  Landmark,
  Mail,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAcessoExternoFiltro } from '@/hooks/useAcessoExternoFiltro';
import Dn4ImportPanel from '@/components/Dn4ImportPanel';
import TopacCentralDashboard from '@/components/TopacCentralDashboard';
import '@/styles/faturamento-dn4.css';

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const onlyDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');
const normalize = (value?: string | null) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const fmtDoc = (value?: string | null) => {
  const d = onlyDigits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value || 'Sem documento';
};

const regraLabel: Record<string, string> = {
  mensal_fixo: 'Mensal fixo',
  quinzenal: 'Quinzenal',
  semanal: 'Semanal',
  diario: 'Diario',
  periodo_locacao: 'Periodo de locacao',
  medicao: 'Por medicao',
  evento_os: 'Evento/OS',
  equipamento: 'Por equipamento',
  consumo: 'Consumo/uso',
};

type Dn4WorkspaceProps = {
  clientes: any[];
  contratos: any[];
  faturas: any[];
  equipamentos: any[];
  stats: {
    previsto: number;
    emitido: number;
    pago: number;
    pendencias: number;
    reajustesProximos: number;
  };
  go: (path?: string) => void;
};

type ClienteTab = 'principal' | 'contatos' | 'cobranca' | 'entrega' | 'representantes' | 'tributacao' | 'arquivos';

type ConsultaCliente = {
  codigo: string;
  nome: string;
  documento: string;
  cidade: string;
  status: string;
};

const tabs: Array<{ id: ClienteTab; label: string }> = [
  { id: 'principal', label: 'Principal' },
  { id: 'contatos', label: 'Contatos' },
  { id: 'cobranca', label: 'Inf. de Cobranca' },
  { id: 'entrega', label: 'Inf. de Entrega' },
  { id: 'representantes', label: 'Representantes' },
  { id: 'tributacao', label: 'Tributacao' },
  { id: 'arquivos', label: 'Arquivos' },
];

const Dn4Field = ({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) => (
  <div className={wide ? 'fat-dn4-field fat-dn4-field-wide' : 'fat-dn4-field'}>
    <span>{label}</span>
    <strong>{value || '—'}</strong>
  </div>
);

const QueryInput = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <label className="fat-dn4-query-input">
    <span>{label}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
);

const Dn4FaturamentoWorkspace: React.FC<Dn4WorkspaceProps> = ({ clientes, contratos, faturas, equipamentos, stats, go }) => {
  const [activeTab, setActiveTab] = useState<ClienteTab>('principal');
  const [selectedClienteId, setSelectedClienteId] = useState<string>('');
  const [consulta, setConsulta] = useState<ConsultaCliente>({ codigo: '', nome: '', documento: '', cidade: '', status: '' });

  const clientesOrdenados = useMemo(() => (
    [...clientes].sort((a, b) => String(a.razao_social || '').localeCompare(String(b.razao_social || ''), 'pt-BR'))
  ), [clientes]);

  useEffect(() => {
    if (!clientesOrdenados.length) {
      setSelectedClienteId('');
      return;
    }
    if (!selectedClienteId || !clientesOrdenados.some(c => c.id === selectedClienteId)) {
      setSelectedClienteId((clientesOrdenados.find(c => c.status === 'ativo') || clientesOrdenados[0]).id);
    }
  }, [clientesOrdenados, selectedClienteId]);

  const clientesFiltrados = useMemo(() => {
    return clientesOrdenados.filter((cliente) => {
      const codigo = String(cliente.id || '').slice(0, 8).toUpperCase();
      if (consulta.codigo && !normalize(codigo).includes(normalize(consulta.codigo))) return false;
      if (consulta.nome && !normalize(`${cliente.razao_social || ''} ${cliente.nome_fantasia || ''}`).includes(normalize(consulta.nome))) return false;
      if (consulta.documento && !onlyDigits(cliente.cnpj_cpf).includes(onlyDigits(consulta.documento))) return false;
      if (consulta.cidade && !normalize(`${cliente.cidade || ''} ${cliente.uf || ''}`).includes(normalize(consulta.cidade))) return false;
      if (consulta.status && normalize(cliente.status) !== normalize(consulta.status)) return false;
      return true;
    });
  }, [clientesOrdenados, consulta]);

  const cliente = clientesOrdenados.find(c => c.id === selectedClienteId) || clientesFiltrados[0] || clientesOrdenados[0] || null;
  const contratosCliente = cliente
    ? contratos.filter(c => c.cliente_id === cliente.id).slice(0, 6)
    : contratos.slice(0, 6);
  const contratoIdsCliente = new Set(contratosCliente.map(c => c.id));
  const equipamentosCliente = cliente
    ? equipamentos.filter(e => e.contratos?.cliente_id === cliente.id || contratoIdsCliente.has(e.contrato_id)).slice(0, 8)
    : equipamentos.slice(0, 8);
  const faturasCliente = cliente
    ? faturas.filter(f => f.cliente_id === cliente.id).slice(0, 6)
    : faturas.slice(0, 6);
  const documento = fmtDoc(cliente?.cnpj_cpf);
  const isPessoaJuridica = onlyDigits(cliente?.cnpj_cpf).length !== 11;
  const clienteCodigo = cliente?.id ? String(cliente.id).slice(0, 8).toUpperCase() : 'CLIENTE';
  const equipamentosAtivosCliente = equipamentosCliente.filter(e => e.status === 'ativo');
  const valorEquipamentosAtivos = equipamentosAtivosCliente.reduce((sum, item) => sum + Number(item.valor_unitario || 0), 0);

  const workflow = useMemo(() => ([
    { label: 'Cliente', value: clientes.length, meta: 'cadastro fiscal' },
    { label: 'Entrega / Obra', value: contratos.filter(c => c.status === 'ativo').length, meta: 'local do servico' },
    { label: 'Equipamentos', value: equipamentos.filter(e => e.status === 'ativo').length, meta: 'itens locados' },
    { label: 'Medicao', value: stats.pendencias, meta: 'conferencia' },
    { label: 'Fatura', value: fmtBRL(stats.emitido), meta: 'emitido' },
    { label: 'Financeiro', value: fmtBRL(stats.pago), meta: 'recebido' },
  ]), [clientes.length, contratos, equipamentos, stats.emitido, stats.pago, stats.pendencias]);

  const selecionarCliente = (id?: string) => {
    if (!id) return;
    setSelectedClienteId(id);
    setActiveTab('principal');
  };

  const consultarCliente = () => selecionarCliente(clientesFiltrados[0]?.id);
  const limparConsulta = () => setConsulta({ codigo: '', nome: '', documento: '', cidade: '', status: '' });
  const rotaFluxo = (index: number) => {
    if (index === 0) return '/clientes';
    if (index === 1 || index === 2) return '/contratos';
    if (index === 3) return '/medicoes';
    return '/faturas';
  };

  const renderTabContent = () => {
    if (activeTab === 'contatos') {
      return (
        <div className="fat-dn4-split">
          <div>
            <div className="fat-dn4-section-label"><Phone /> Contato para faturamento</div>
            <div className="fat-dn4-contact-box">
              <span><Mail /> {cliente?.email || 'E-mail nao cadastrado'}</span>
              <span><Phone /> {cliente?.telefone || 'Telefone nao cadastrado'}</span>
              <span><Users /> {cliente?.contato_responsavel || 'Responsavel nao cadastrado'}</span>
            </div>
          </div>
          <div>
            <div className="fat-dn4-section-label"><Search /> Acao</div>
            <button type="button" className="fat-dn4-query-button" onClick={() => cliente && go(`/clientes/${cliente.id}`)}>Abrir cadastro completo</button>
          </div>
        </div>
      );
    }

    if (activeTab === 'cobranca') {
      return (
        <div className="fat-dn4-split">
          <div>
            <div className="fat-dn4-section-label"><FileCheck2 /> Faturas do cliente</div>
            <div className="fat-dn4-invoice-list">
              {faturasCliente.length === 0 ? <p>Nenhuma fatura recente para esse cliente.</p> : faturasCliente.map((fatura) => (
                <button key={fatura.id} type="button" onClick={() => go('/faturas')}>
                  <span>{fatura.numero || fatura.competencia || 'Fatura'}</span>
                  <strong>{fmtBRL(Number(fatura.total || 0))}</strong>
                  <small>{fatura.status}</small>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="fat-dn4-section-label"><Calculator /> Emissao</div>
            <div className="fat-dn4-contact-box">
              <span>Contratos vinculados: {contratosCliente.length}</span>
              <span>Equipamentos ativos: {equipamentosAtivosCliente.length}</span>
              <span>Total emitido: {fmtBRL(faturasCliente.reduce((sum, fatura) => sum + Number(fatura.total || 0), 0))}</span>
            </div>
            <button type="button" className="fat-dn4-query-button" onClick={() => go('/faturas')}>Gerar ou importar fatura</button>
          </div>
        </div>
      );
    }

    if (activeTab === 'tributacao') {
      return (
        <div>
          <div className="fat-dn4-section-label"><Landmark /> Informacoes fiscais / CFOP</div>
          <div className="fat-dn4-tax-grid">
            <Dn4Field label="Regime Tributario" value="Conforme cadastro fiscal" />
            <Dn4Field label="Indicador IE" value={cliente?.inscricao_estadual ? 'Contribuinte ICMS' : 'Nao informado'} />
            <Dn4Field label="Inscricao Estadual" value={cliente?.inscricao_estadual} />
            <Dn4Field label="Reter ISS" value="Conferir por cliente" />
            <Dn4Field label="CFOP Padrao" value="Validar na emissao" />
            <Dn4Field label="CFOP Interno" value="Validar na emissao" />
          </div>
        </div>
      );
    }

    if (activeTab === 'representantes') {
      return (
        <div className="fat-dn4-split">
          <div>
            <div className="fat-dn4-section-label"><Users /> Representantes / responsaveis</div>
            <div className="fat-dn4-contact-box">
              <span>{cliente?.contato_responsavel || 'Responsavel comercial nao cadastrado'}</span>
              <span>{cliente?.email || 'E-mail principal nao cadastrado'}</span>
              <span>{cliente?.telefone || 'Telefone principal nao cadastrado'}</span>
            </div>
          </div>
          <div>
            <div className="fat-dn4-section-label"><FileText /> Cadastro</div>
            <button type="button" className="fat-dn4-query-button" onClick={() => cliente && go(`/clientes/${cliente.id}`)}>Completar representantes</button>
          </div>
        </div>
      );
    }

    if (activeTab === 'arquivos') {
      return (
        <div className="fat-dn4-split">
          <div>
            <div className="fat-dn4-section-label"><Database /> Arquivos do cliente</div>
            <div className="fat-dn4-contact-box">
              <span>Use a importacao DN4 abaixo para atualizar cliente, contrato, locacao, equipamentos e faturas.</span>
              <span>Cliente selecionado: {cliente?.razao_social || 'nenhum'}</span>
            </div>
          </div>
          <div>
            <div className="fat-dn4-section-label"><Search /> Conferencia</div>
            <button type="button" className="fat-dn4-query-button" onClick={() => go('/clientes')}>Abrir importacao/cadastro</button>
          </div>
        </div>
      );
    }

    if (activeTab === 'principal') {
      return (
        <div className="fat-dn4-split">
          <div>
            <div className="fat-dn4-section-label"><MapPin /> Informacoes de Entrega / Obra</div>
            <div className="fat-dn4-form-grid compact">
              <Dn4Field label="CEP" value={cliente?.cep} />
              <Dn4Field label="Endereco" value={cliente?.endereco} wide />
              <Dn4Field label="Cidade" value={cliente?.cidade} />
              <Dn4Field label="UF" value={cliente?.uf} />
            </div>
          </div>
          <div>
            <div className="fat-dn4-section-label"><Package /> Bens locaveis</div>
            <div className="fat-dn4-contact-box">
              <span>Equipamentos vinculados: {equipamentosCliente.length}</span>
              <span>Valor de itens ativos: {fmtBRL(valorEquipamentosAtivos)}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fat-dn4-split">
        <div>
          <div className="fat-dn4-section-label"><MapPin /> Informacoes de Entrega / Obra</div>
          <div className="fat-dn4-form-grid compact">
            <Dn4Field label="CEP" value={cliente?.cep} />
            <Dn4Field label="Endereco" value={cliente?.endereco} wide />
            <Dn4Field label="Cidade" value={cliente?.cidade} />
            <Dn4Field label="UF" value={cliente?.uf} />
          </div>
        </div>
        <div>
          <div className="fat-dn4-section-label"><Phone /> Contato para faturamento</div>
          <div className="fat-dn4-contact-box">
            <span><Mail /> {cliente?.email || 'E-mail nao cadastrado'}</span>
            <span><Phone /> {cliente?.telefone || 'Telefone nao cadastrado'}</span>
            <span>{equipamentosCliente.length} equipamento(s) localizado(s)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="fat-dn4-workspace" aria-label="Operacao de faturamento no padrao DN4">
      <div className="fat-dn4-head">
        <div>
          <p>Base de faturamento</p>
          <h2>Cadastro, obra, equipamentos, tributacao e contrato no mesmo fluxo</h2>
        </div>
        <div className="fat-dn4-head-actions">
          <button type="button" onClick={() => go('/clientes')}><Users /> Clientes</button>
          <button type="button" onClick={() => go('/contratos')}><BriefcaseBusiness /> Contratos</button>
          <button type="button" onClick={() => go('/medicoes')}><Calculator /> Medicoes</button>
          <button type="button" onClick={() => go('/faturas')} className="fat-dn4-primary"><FileText /> Faturar</button>
        </div>
      </div>

      <div className="fat-dn4-flow" aria-label="Esteira de faturamento">
        {workflow.map((item, index) => (
          <React.Fragment key={item.label}>
            <button type="button" onClick={() => go(rotaFluxo(index))}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.meta}</small>
            </button>
            {index < workflow.length - 1 && <ArrowRight className="fat-dn4-flow-arrow" />}
          </React.Fragment>
        ))}
      </div>

      <div className="fat-dn4-grid">
        <div className="fat-dn4-card fat-dn4-client-card">
          <div className="fat-dn4-card-title">
            <ShieldCheck />
            <span>Informacoes do Cliente</span>
          </div>
          <div className="fat-dn4-form-grid">
            <Dn4Field label="Codigo" value={clienteCodigo} />
            <Dn4Field label="P.F. / P.J." value={isPessoaJuridica ? 'Pessoa Juridica' : 'Pessoa Fisica'} />
            <Dn4Field label="CNPJ / CPF" value={documento} />
            <Dn4Field label="Situacao" value={cliente?.status || 'Aguardando cadastro'} />
            <Dn4Field label="Nome do Cliente" value={cliente?.razao_social || 'Selecione ou importe um cliente'} wide />
            <Dn4Field label="Nome Fantasia" value={cliente?.nome_fantasia || cliente?.razao_social} />
            <Dn4Field label="Tipo de Cliente" value="Cliente" />
          </div>

          <div className="fat-dn4-tabs" aria-label="Abas do cadastro de cliente">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? 'is-active' : ''}>{tab.label}</button>
            ))}
          </div>

          {renderTabContent()}
        </div>

        <aside className="fat-dn4-card fat-dn4-query-card">
          <div className="fat-dn4-card-title">
            <Search />
            <span>Consulta de Cliente</span>
          </div>
          <div className="fat-dn4-query-grid">
            <QueryInput label="Codigo" value={consulta.codigo} onChange={(value) => setConsulta({ ...consulta, codigo: value })} />
            <QueryInput label="Nome / Razao" value={consulta.nome} onChange={(value) => setConsulta({ ...consulta, nome: value })} />
            <QueryInput label="CNPJ" value={consulta.documento} onChange={(value) => setConsulta({ ...consulta, documento: value })} />
            <QueryInput label="Cidade" value={consulta.cidade} onChange={(value) => setConsulta({ ...consulta, cidade: value })} />
          </div>
          <select value={consulta.status} onChange={(event) => setConsulta({ ...consulta, status: event.target.value })} className="fat-dn4-status-select" aria-label="Situacao do cliente">
            <option value="">Todas as situacoes</option>
            <option value="ativo">Cliente ativo</option>
            <option value="inativo">Cliente inativo</option>
          </select>
          <div className="fat-dn4-query-actions">
            <button type="button" onClick={consultarCliente} className="fat-dn4-query-button">Visualizar</button>
            <button type="button" onClick={limparConsulta} className="fat-dn4-query-button">Limpar</button>
          </div>
          <div className="fat-dn4-result-list">
            {clientesFiltrados.slice(0, 6).map((item) => (
              <button key={item.id} type="button" onClick={() => selecionarCliente(item.id)} className={item.id === cliente?.id ? 'is-selected' : ''}>
                <strong>{item.razao_social}</strong>
                <small>{fmtDoc(item.cnpj_cpf)} {item.cidade ? `- ${item.cidade}/${item.uf || ''}` : ''}</small>
              </button>
            ))}
            {clientesFiltrados.length === 0 && <p>Nenhum cliente encontrado com esses filtros.</p>}
          </div>
        </aside>
      </div>

      <div className="fat-dn4-bottom-grid">
        <div className="fat-dn4-card">
          <div className="fat-dn4-card-title">
            <Landmark />
            <span>Tributacao / CFOP</span>
          </div>
          <div className="fat-dn4-tax-grid">
            <Dn4Field label="Regime Tributario" value="Conforme cadastro fiscal" />
            <Dn4Field label="Indicador IE" value={cliente?.inscricao_estadual ? 'Contribuinte ICMS' : 'Nao informado'} />
            <Dn4Field label="Inscricao Estadual" value={cliente?.inscricao_estadual} />
            <Dn4Field label="Reter ISS" value="Conferir por cliente" />
            <Dn4Field label="CFOP Padrao" value="Validar na emissao" />
            <Dn4Field label="CFOP Interno" value="Validar na emissao" />
          </div>
        </div>

        <div className="fat-dn4-card fat-dn4-contracts-card">
          <div className="fat-dn4-card-title">
            <Database />
            <span>Projetos / contratos para faturar</span>
          </div>
          <div className="fat-dn4-table-wrap">
            <table className="fat-dn4-table">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Cliente / Obra</th>
                  <th>Regra</th>
                  <th>Venc.</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contratosCliente.length === 0 ? (
                  <tr><td colSpan={6}>Nenhum contrato vinculado ao cliente selecionado.</td></tr>
                ) : contratosCliente.map((contrato) => (
                  <tr key={contrato.id} onClick={() => go(`/contratos/${contrato.id}`)}>
                    <td>{contrato.numero || '—'}</td>
                    <td>{contrato.clientes_fat?.razao_social || cliente?.razao_social || '—'}</td>
                    <td>{regraLabel[contrato.regra_faturamento] || contrato.regra_faturamento || 'Mensal'}</td>
                    <td>{contrato.dia_vencimento ? `Dia ${contrato.dia_vencimento}` : '—'}</td>
                    <td>{fmtBRL(Number(contrato.valor_mensal || 0))}</td>
                    <td><span className={contrato.status === 'ativo' ? 'is-ok' : 'is-warn'}>{contrato.status || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fat-dn4-card fat-dn4-assets-card">
          <div className="fat-dn4-card-title">
            <Package />
            <span>Bens locaveis / equipamentos</span>
          </div>
          <div className="fat-dn4-table-wrap">
            <table className="fat-dn4-table fat-dn4-assets-table">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Patrimonio</th>
                  <th>Contrato</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {equipamentosCliente.length === 0 ? (
                  <tr><td colSpan={4}>Nenhum equipamento vinculado aos contratos deste cliente.</td></tr>
                ) : equipamentosCliente.map((item) => (
                  <tr key={item.id} onClick={() => item.contrato_id && go(`/contratos/${item.contrato_id}`)}>
                    <td>{item.ativos?.descricao || item.descricao_livre || '—'}</td>
                    <td>{item.patrimonio || item.ativos?.patrimonio || item.placa || item.ativos?.placa || '—'}</td>
                    <td>{item.contratos?.numero || '—'}</td>
                    <td>{fmtBRL(Number(item.valor_unitario || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

const FaturamentoDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const ext = useAcessoExternoFiltro();
  const [loading, setLoading] = useState(true);
  const [painelKpis, setPainelKpis] = useState<any>(null);
  const [clientesDn4, setClientesDn4] = useState<any[]>([]);
  const [contratosDn4, setContratosDn4] = useState<any[]>([]);
  const [faturasDn4, setFaturasDn4] = useState<any[]>([]);
  const [equipamentosDn4, setEquipamentosDn4] = useState<any[]>([]);
  const [stats, setStats] = useState({
    previsto: 0, emitido: 0, pago: 0, vencidos: 0, aVencer: 0,
    contratosAtivos: 0, clientesAtivos: 0, equipamentosFaturando: 0,
    pendencias: 0, reajustesProximos: 0,
  });
  const [porEmpresa, setPorEmpresa] = useState<Array<{ nome: string; total: number }>>([]);
  const [topClientes, setTopClientes] = useState<Array<{ razao_social: string; total: number }>>([]);
  const portalBase = location.pathname.match(/^\/faturamento-ext\/[^/]+/)?.[0]
    || (location.pathname.startsWith('/faturamento') ? '/faturamento' : '/admin/faturamento');
  const fatPath = (path = '') => `${portalBase}${path}`;

  const carregar = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const empIds = ext.isExterno ? (ext.empresaIds || []) : null;
    const safeIds = empIds !== null ? (empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']) : null;
    const applyEmp = (q: any) => safeIds ? q.in('empresa_id', safeIds) : q;

    if (!ext.isExterno) {
      const { data: kpiData } = await supabase.rpc('dashboard_faturamento_kpis' as any);
      setPainelKpis(kpiData || null);
    } else {
      setPainelKpis(null);
    }

    const [faturas, contratos, clientes, contratoEquip, pendencias, contratosReaj, empresas] = await Promise.all([
      applyEmp(supabase.from('faturas').select('id, numero, competencia, total, status, data_vencimento, empresa_id, cliente_id, contrato_id')),
      applyEmp(supabase.from('contratos').select('id, numero, status, empresa_id, cliente_id, data_inicio, data_fim, valor_mensal, regra_faturamento, dia_vencimento, clientes_fat(razao_social, cnpj_cpf), empresas(nome)')),
      supabase.from('clientes_fat').select('*').order('razao_social'),
      supabase.from('contrato_equipamentos').select('id, status, contrato_id, valor_unitario, descricao_livre, patrimonio, placa, data_envio, data_retorno, ativos(descricao, placa, patrimonio, tipo), contratos!inner(empresa_id, cliente_id, numero)'),
      supabase.from('faturamento_pendencias').select('id').eq('status', 'aberta'),
      applyEmp(supabase.from('contratos').select('id, proximo_reajuste, empresa_id').not('proximo_reajuste', 'is', null).lte('proximo_reajuste', em30)),
      safeIds ? supabase.from('empresas').select('id, nome').in('id', safeIds) : supabase.from('empresas').select('id, nome'),
    ]);

    const f = faturas.data || [];
    const equipamentos = (contratoEquip.data || []).filter((e: any) => !safeIds || safeIds.includes(e.contratos?.empresa_id));
    setFaturasDn4(f);
    setClientesDn4(clientes.data || []);
    setContratosDn4(contratos.data || []);
    setEquipamentosDn4(equipamentos);

    const previsto = f.filter(x => ['prevista', 'em_aberto', 'enviada'].includes(x.status)).reduce((s, x) => s + Number(x.total || 0), 0);
    const emitido = f.filter(x => ['enviada', 'em_aberto', 'vencida', 'paga', 'parcial'].includes(x.status)).reduce((s, x) => s + Number(x.total || 0), 0);
    const pago = f.filter(x => x.status === 'paga' || x.status === 'parcial').reduce((s, x) => s + Number(x.total || 0), 0);
    const vencidos = f.filter(x => x.status === 'vencida' || (['em_aberto', 'enviada'].includes(x.status) && x.data_vencimento < hoje)).reduce((s, x) => s + Number(x.total || 0), 0);
    const aVencer = f.filter(x => ['em_aberto', 'enviada'].includes(x.status) && x.data_vencimento >= hoje && x.data_vencimento <= em30).reduce((s, x) => s + Number(x.total || 0), 0);

    setStats({
      previsto, emitido, pago, vencidos, aVencer,
      contratosAtivos: (contratos.data || []).filter(c => c.status === 'ativo').length,
      clientesAtivos: (clientes.data || []).filter(c => c.status === 'ativo').length,
      equipamentosFaturando: equipamentos.filter((e: any) => e.status === 'ativo').length,
      pendencias: pendencias.data?.length || 0,
      reajustesProximos: contratosReaj.data?.length || 0,
    });

    const empMap = new Map((empresas.data || []).map(e => [e.id, e.nome]));
    const porEmp = new Map<string, number>();
    f.forEach(x => {
      const nome = empMap.get(x.empresa_id) || 'Outros';
      porEmp.set(nome, (porEmp.get(nome) || 0) + Number(x.total || 0));
    });
    setPorEmpresa(Array.from(porEmp.entries()).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total));

    const cliMap = new Map((clientes.data || []).map(c => [c.id, c.razao_social]));
    const porCli = new Map<string, number>();
    f.forEach(x => {
      const nome = cliMap.get(x.cliente_id) || 'Outros';
      porCli.set(nome, (porCli.get(nome) || 0) + Number(x.total || 0));
    });
    setTopClientes(Array.from(porCli.entries()).map(([razao_social, total]) => ({ razao_social, total })).sort((a, b) => b.total - a.total).slice(0, 5));

    setLoading(false);
  };

  useEffect(() => { if (!ext.loading) carregar(); /* eslint-disable-next-line */ }, [ext.loading, ext.isExterno, JSON.stringify(ext.empresaIds)]);

  const kpis = [
    { label: 'Faturamento Previsto', value: fmtBRL(stats.previsto), icon: TrendingUp, color: 'text-cyan-200' },
    { label: 'Total Emitido', value: fmtBRL(stats.emitido), icon: FileText, color: 'text-blue-200', onClick: () => navigate(fatPath('/faturas')) },
    { label: 'Recebido', value: fmtBRL(stats.pago), icon: CheckCircle2, color: 'text-emerald-300' },
    { label: 'Vencidos', value: fmtBRL(stats.vencidos), icon: AlertTriangle, color: stats.vencidos > 0 ? 'text-rose-300' : 'text-emerald-300', onClick: () => navigate(fatPath('/faturas?status=vencida')) },
  ];

  const actions = [
    { label: 'Faturas', icon: FileText, onClick: () => navigate(fatPath('/faturas')), tone: 'primary' as const },
    { label: 'Contratos', icon: ClipboardCheck, onClick: () => navigate(fatPath('/contratos')) },
    { label: 'Clientes', icon: Users, onClick: () => navigate(fatPath('/clientes')) },
    { label: 'Reajustes', icon: RefreshCw, onClick: () => navigate(fatPath('/reajustes')) },
    { label: 'Pendencias', icon: AlertTriangle, onClick: () => navigate(fatPath('/pendencias')) },
  ];

  const alerts = [
    stats.pendencias > 0
      ? { title: 'Pendencias', description: `${stats.pendencias} pendencias abertas no faturamento`, tone: 'danger' as const }
      : { title: 'Pendencias', description: 'Nenhuma pendencia aberta agora', tone: 'success' as const },
    stats.vencidos > 0
      ? { title: 'Faturas vencidas', description: `${fmtBRL(stats.vencidos)} precisa de tratativa`, tone: 'danger' as const }
      : { title: 'Faturas', description: 'Sem vencidos criticos no momento', tone: 'success' as const },
    { title: 'A vencer 30 dias', description: `${fmtBRL(stats.aVencer)} em acompanhamento`, tone: 'warning' as const },
    { title: 'Reajustes proximos', description: `${stats.reajustesProximos} contratos nos proximos 30 dias`, tone: stats.reajustesProximos > 0 ? 'warning' as const : 'success' as const },
  ];

  const leftPanelItems = porEmpresa.map(e => ({ title: e.nome, value: fmtBRL(e.total), meta: stats.emitido > 0 ? `${Math.round((e.total / stats.emitido) * 100)}% do emitido` : undefined }));
  const rightPanelItems = topClientes.map(c => ({ title: c.razao_social, value: fmtBRL(c.total) }));

  if (painelKpis) {
    leftPanelItems.unshift({ title: `Faturado em ${painelKpis.competencia}`, value: fmtBRL(Number(painelKpis.total_faturado_mes || 0)), meta: 'Conferencia mensal' });
    rightPanelItems.unshift({ title: 'Medicoes pendentes', value: String(painelKpis.medicoes_pendentes || 0), meta: 'Aguardando conferencia', danger: Number(painelKpis.medicoes_pendentes || 0) > 0 });
  }

  return (
    <TopacCentralDashboard
      modulo="Faturamento"
      subtitle="Painel operacional de faturamento e DN4"
      loading={loading}
      onRefresh={carregar}
      kpis={kpis}
      actions={actions}
      alerts={alerts}
      leftPanelTitle="Faturamento por Empresa"
      leftPanelItems={leftPanelItems}
      rightPanelTitle="Top Clientes"
      rightPanelItems={rightPanelItems}
      emptyLeft="Sem faturas emitidas ainda."
      emptyRight="Sem clientes faturados ainda."
      dn4Slot={(
        <div className="fat-dn4-stack">
          <Dn4FaturamentoWorkspace
            clientes={clientesDn4}
            contratos={contratosDn4}
            faturas={faturasDn4}
            equipamentos={equipamentosDn4}
            stats={stats}
            go={(path = '') => navigate(fatPath(path))}
          />
          <Dn4ImportPanel modulo="faturamento" />
        </div>
      )}
    />
  );
};

export default FaturamentoDashboardPage;
