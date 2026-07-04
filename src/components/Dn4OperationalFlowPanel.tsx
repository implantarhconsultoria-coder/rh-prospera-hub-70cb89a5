import React, { useMemo, useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Calculator, FileText, Landmark, MapPin, Package, ShieldCheck, Users } from 'lucide-react';

type Dn4Tab = 'cliente' | 'contatos' | 'cobranca' | 'entrega' | 'representantes' | 'tributacao' | 'arquivos' | 'contratos' | 'equipamentos' | 'medicoes' | 'faturas' | 'financeiro';

type Props = {
  cliente: any;
  clientes: any[];
  contratos: any[];
  equipamentos: any[];
  faturas: any[];
  pendencias: number;
  go: (path?: string) => void;
};

const fmtBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const onlyDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');
const fmtDoc = (value?: string | null) => {
  const d = onlyDigits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value || 'Sem documento';
};

const tabs: Array<{ id: Dn4Tab; label: string }> = [
  { id: 'cliente', label: 'Dados do cliente' },
  { id: 'contatos', label: 'Contatos' },
  { id: 'cobranca', label: 'Cobranca' },
  { id: 'entrega', label: 'Entrega / Obra' },
  { id: 'representantes', label: 'Representantes' },
  { id: 'tributacao', label: 'Tributacao' },
  { id: 'arquivos', label: 'Arquivos' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'equipamentos', label: 'Equipamentos' },
  { id: 'medicoes', label: 'Medicoes' },
  { id: 'faturas', label: 'Faturas' },
  { id: 'financeiro', label: 'Financeiro' },
];

const Field = ({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) => (
  <div className={wide ? 'fat-dn4-field fat-dn4-field-wide' : 'fat-dn4-field'}>
    <span>{label}</span>
    <strong>{value || '—'}</strong>
  </div>
);

const Dn4OperationalFlowPanel: React.FC<Props> = ({ cliente, clientes, contratos, equipamentos, faturas, pendencias, go }) => {
  const [tab, setTab] = useState<Dn4Tab>('cliente');
  const contratosCliente = useMemo(() => cliente ? contratos.filter(item => item.cliente_id === cliente.id) : contratos, [cliente, contratos]);
  const contratoIds = useMemo(() => new Set(contratosCliente.map(item => item.id)), [contratosCliente]);
  const equipamentosCliente = useMemo(() => cliente ? equipamentos.filter(item => item.contratos?.cliente_id === cliente.id || contratoIds.has(item.contrato_id)) : equipamentos, [cliente, contratoIds, equipamentos]);
  const faturasCliente = useMemo(() => cliente ? faturas.filter(item => item.cliente_id === cliente.id) : faturas, [cliente, faturas]);
  const equipamentosAtivos = equipamentosCliente.filter(item => item.status === 'ativo');
  const totalEmitido = faturasCliente.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const totalAberto = faturasCliente.filter(item => ['prevista', 'enviada', 'em_aberto', 'vencida'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const clienteCodigo = cliente?.id ? String(cliente.id).slice(0, 8).toUpperCase() : 'CLIENTE';

  const steps = [
    { label: 'Cliente', value: clientes.length, meta: 'cadastro', tab: 'cliente' as Dn4Tab },
    { label: 'Contrato', value: contratosCliente.length, meta: 'criar / abrir', tab: 'contratos' as Dn4Tab },
    { label: 'Equipamentos', value: equipamentosAtivos.length, meta: 'locacao', tab: 'equipamentos' as Dn4Tab },
    { label: 'Medicao', value: pendencias, meta: 'conferir', tab: 'medicoes' as Dn4Tab },
    { label: 'Fatura', value: fmtBRL(totalEmitido), meta: 'emitir', tab: 'faturas' as Dn4Tab },
    { label: 'Financeiro', value: fmtBRL(totalAberto), meta: 'receber', tab: 'financeiro' as Dn4Tab },
  ];

  const abrirCliente = () => cliente && go(`/clientes/${cliente.id}`);
  const abrirContrato = (id?: string) => go(id ? `/contratos/${id}` : '/contratos');
  const abrirMedicoes = () => go('/medicoes');
  const abrirFaturas = () => go('/faturas');
  const abrirFinanceiro = () => go('/faturas?status=em_aberto');

  const tabelaContratos = (
    <div className="fat-dn4-table-wrap"><table className="fat-dn4-table"><thead><tr><th>Contrato</th><th>Cliente / Obra</th><th>Regra</th><th>Venc.</th><th>Valor</th><th>Status</th></tr></thead><tbody>{contratosCliente.length === 0 ? <tr><td colSpan={6}>Nenhum contrato vinculado ao cliente selecionado.</td></tr> : contratosCliente.slice(0, 12).map(contrato => <tr key={contrato.id} onClick={() => abrirContrato(contrato.id)}><td>{contrato.numero || '—'}</td><td>{contrato.clientes_fat?.razao_social || cliente?.razao_social || '—'}</td><td>{contrato.regra_faturamento || 'Mensal'}</td><td>{contrato.dia_vencimento ? `Dia ${contrato.dia_vencimento}` : '—'}</td><td>{fmtBRL(Number(contrato.valor_mensal || 0))}</td><td><span className={contrato.status === 'ativo' ? 'is-ok' : 'is-warn'}>{contrato.status || '—'}</span></td></tr>)}</tbody></table></div>
  );

  const tabelaEquipamentos = (
    <div className="fat-dn4-table-wrap"><table className="fat-dn4-table fat-dn4-assets-table"><thead><tr><th>Equipamento</th><th>Patrimonio</th><th>Contrato</th><th>Valor</th></tr></thead><tbody>{equipamentosCliente.length === 0 ? <tr><td colSpan={4}>Nenhum equipamento vinculado aos contratos deste cliente.</td></tr> : equipamentosCliente.slice(0, 12).map(item => <tr key={item.id} onClick={() => item.contrato_id && abrirContrato(item.contrato_id)}><td>{item.ativos?.descricao || item.descricao_livre || '—'}</td><td>{item.patrimonio || item.ativos?.patrimonio || item.placa || item.ativos?.placa || '—'}</td><td>{item.contratos?.numero || '—'}</td><td>{fmtBRL(Number(item.valor_unitario || 0))}</td></tr>)}</tbody></table></div>
  );

  const listaFaturas = (
    <div className="fat-dn4-invoice-list">{faturasCliente.length === 0 ? <p>Nenhuma fatura recente para esse cliente.</p> : faturasCliente.slice(0, 12).map(fatura => <button key={fatura.id} type="button" onClick={abrirFaturas}><span>{fatura.numero || fatura.competencia || 'Fatura'}</span><strong>{fmtBRL(Number(fatura.total || 0))}</strong><small>{fatura.status} · venc. {fatura.data_vencimento || '—'}</small></button>)}</div>
  );

  const content: Record<Dn4Tab, React.ReactNode> = {
    cliente: <div className="fat-dn4-form-grid"><Field label="Codigo" value={clienteCodigo} /><Field label="P.F. / P.J." value={onlyDigits(cliente?.cnpj_cpf).length === 11 ? 'Pessoa Fisica' : 'Pessoa Juridica'} /><Field label="CNPJ / CPF" value={fmtDoc(cliente?.cnpj_cpf)} /><Field label="Situacao" value={cliente?.status || 'Aguardando cadastro'} /><Field label="Nome do Cliente" value={cliente?.razao_social || 'Selecione ou importe um cliente'} wide /><Field label="Nome Fantasia" value={cliente?.nome_fantasia || cliente?.razao_social} /></div>,
    contatos: <div className="fat-dn4-contact-box"><span>{cliente?.email || 'E-mail nao cadastrado'}</span><span>{cliente?.telefone || 'Telefone nao cadastrado'}</span><span>{cliente?.contato_responsavel || 'Responsavel nao cadastrado'}</span></div>,
    cobranca: <div className="fat-dn4-contact-box"><span>Total emitido: {fmtBRL(totalEmitido)}</span><span>Total em aberto: {fmtBRL(totalAberto)}</span><button type="button" className="fat-dn4-query-button" onClick={abrirFinanceiro}>Abrir financeiro / cobranca</button></div>,
    entrega: <div className="fat-dn4-form-grid"><Field label="CEP" value={cliente?.cep} /><Field label="Endereco" value={cliente?.endereco} wide /><Field label="Cidade" value={cliente?.cidade} /><Field label="UF" value={cliente?.uf} /></div>,
    representantes: <div className="fat-dn4-contact-box"><span>{cliente?.contato_responsavel || 'Responsavel comercial nao cadastrado'}</span><button type="button" className="fat-dn4-query-button" onClick={abrirCliente}>Completar representantes</button></div>,
    tributacao: <div className="fat-dn4-tax-grid"><Field label="Regime Tributario" value="Conforme cadastro fiscal" /><Field label="Indicador IE" value={cliente?.inscricao_estadual ? 'Contribuinte ICMS' : 'Nao informado'} /><Field label="Inscricao Estadual" value={cliente?.inscricao_estadual} /><Field label="Reter ISS" value="Conferir por cliente" /><Field label="CFOP Padrao" value="Validar na emissao" /><Field label="CFOP Interno" value="Validar na emissao" /></div>,
    arquivos: <div className="fat-dn4-contact-box"><span>Arquivos e importacoes ficam vinculados ao cliente, contrato, fatura e financeiro.</span><button type="button" className="fat-dn4-query-button" onClick={abrirCliente}>Abrir cadastro / anexos</button></div>,
    contratos: <div className="space-y-3"><div className="fat-dn4-contact-box"><span>Fluxo: localizar cliente, criar/abrir contrato, informar regra, obra e vencimento.</span><button type="button" className="fat-dn4-query-button" onClick={() => abrirContrato(contratosCliente[0]?.id)}>Abrir contrato</button><button type="button" className="fat-dn4-query-button" onClick={() => abrirContrato()}>Novo contrato</button></div>{tabelaContratos}</div>,
    equipamentos: <div className="space-y-3"><div className="fat-dn4-contact-box"><span>Fluxo: selecionar contrato, incluir equipamento, conferir patrimonio e valor.</span><button type="button" className="fat-dn4-query-button" onClick={() => abrirContrato(contratosCliente[0]?.id)}>Adicionar equipamento no contrato</button></div>{tabelaEquipamentos}</div>,
    medicoes: <div className="fat-dn4-contact-box"><span>Fluxo: abrir contrato, conferir periodo, aprovar medicao e liberar faturamento.</span><span>Pendencias abertas: {pendencias}</span><button type="button" className="fat-dn4-query-button" onClick={abrirMedicoes}>Abrir medicoes</button><button type="button" className="fat-dn4-query-button" onClick={abrirFaturas}>Liberar para faturar</button></div>,
    faturas: <div className="fat-dn4-split"><div>{listaFaturas}</div><div><button type="button" className="fat-dn4-query-button" onClick={abrirFaturas}>Gerar fatura</button><button type="button" className="fat-dn4-query-button" onClick={abrirFaturas}>Emitir / enviar fatura</button></div></div>,
    financeiro: <div className="fat-dn4-contact-box"><span>Fluxo: fatura emitida gera titulo, acompanha vencimento e recebimento.</span><span>Total em aberto: {fmtBRL(totalAberto)}</span><button type="button" className="fat-dn4-query-button" onClick={abrirFinanceiro}>Abrir titulos a receber</button></div>,
  };

  return (
    <section className="fat-dn4-workspace" aria-label="Fluxo operacional DN4 no TOPAC">
      <div className="fat-dn4-head"><div><p>Base de faturamento</p><h2>Fluxo DN4 no TOPAC: cliente, contrato, locacao, medicao, fatura e financeiro</h2></div><div className="fat-dn4-head-actions"><button type="button" onClick={() => setTab('cliente')}><Users /> Cliente</button><button type="button" onClick={() => setTab('contratos')}><BriefcaseBusiness /> Contrato</button><button type="button" onClick={() => setTab('medicoes')}><Calculator /> Medicao</button><button type="button" onClick={() => setTab('faturas')} className="fat-dn4-primary"><FileText /> Faturar</button></div></div>
      <div className="fat-dn4-flow" aria-label="Esteira DN4">{steps.map((item, index) => <React.Fragment key={item.label}><button type="button" onClick={() => setTab(item.tab)}><span>{item.label}</span><strong>{item.value}</strong><small>{item.meta}</small></button>{index < steps.length - 1 && <ArrowRight className="fat-dn4-flow-arrow" />}</React.Fragment>)}</div>
      <div className="fat-dn4-card fat-dn4-client-card"><div className="fat-dn4-card-title"><ShieldCheck /><span>Ficha DN4 unificada</span></div><div className="fat-dn4-tabs" aria-label="Abas DN4">{tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={tab === item.id ? 'is-active' : ''}>{item.label}</button>)}</div>{content[tab]}</div>
      <div className="fat-dn4-bottom-grid"><div className="fat-dn4-card"><div className="fat-dn4-card-title"><Landmark /><span>Tributacao / CFOP</span></div>{content.tributacao}</div><div className="fat-dn4-card fat-dn4-contracts-card"><div className="fat-dn4-card-title"><BriefcaseBusiness /><span>Contratos</span></div>{tabelaContratos}</div><div className="fat-dn4-card fat-dn4-assets-card"><div className="fat-dn4-card-title"><Package /><span>Equipamentos</span></div>{tabelaEquipamentos}</div></div>
    </section>
  );
};

export default Dn4OperationalFlowPanel;
