import React, { useMemo, useState } from 'react';
import '@/styles/dn4-legacy-exact.css';

type Dn4Tab = 'produtos' | 'servicos' | 'complemento' | 'totais' | 'vencimentos' | 'nfe' | 'arquivos';
type Dn4Tela = 'recebimento' | 'equipamentos';

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
  return value || '';
};

const tabs: Array<{ id: Dn4Tab; label: string }> = [
  { id: 'produtos', label: 'Produtos' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'complemento', label: 'Complemento de Informações' },
  { id: 'totais', label: 'Totais' },
  { id: 'vencimentos', label: 'Vencimentos' },
  { id: 'nfe', label: 'NF-e' },
  { id: 'arquivos', label: 'Arquivos' },
];

const Field = ({ label, value, required, wide }: { label: string; value?: React.ReactNode; required?: boolean; wide?: boolean }) => (
  <label className={wide ? 'dn4-field dn4-field-wide' : 'dn4-field'}>
    <span>{label}{required ? ' *' : ''}</span>
    <div>{value || ''}</div>
  </label>
);

const ToolbarButton = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <button type="button" onClick={onClick}>{children}</button>
);

const Dn4OperationalFlowPanel: React.FC<Props> = ({ cliente, clientes, contratos, equipamentos, faturas, pendencias, go }) => {
  const [tab, setTab] = useState<Dn4Tab>('produtos');
  const [tela, setTela] = useState<Dn4Tela>('recebimento');

  const contratosCliente = useMemo(() => cliente ? contratos.filter(item => item.cliente_id === cliente.id) : contratos, [cliente, contratos]);
  const contratoIds = useMemo(() => new Set(contratosCliente.map(item => item.id)), [contratosCliente]);
  const equipamentosCliente = useMemo(() => cliente ? equipamentos.filter(item => item.contratos?.cliente_id === cliente.id || contratoIds.has(item.contrato_id)) : equipamentos, [cliente, contratoIds, equipamentos]);
  const faturasCliente = useMemo(() => cliente ? faturas.filter(item => item.cliente_id === cliente.id) : faturas, [cliente, faturas]);

  const contratoPrincipal = contratosCliente[0];
  const totalProdutos = equipamentosCliente.reduce((sum, item) => sum + Number(item.valor_unitario || 0), 0);
  const totalFaturas = faturasCliente.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const totalAberto = faturasCliente.filter(item => ['prevista', 'enviada', 'em_aberto', 'vencida'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const pedido = contratoPrincipal?.numero || faturasCliente[0]?.numero || '000000';

  const renderMenu = () => (
    <>
      <div className="dn4-titlebar">Gestão Empresarial.NET - [{tela === 'recebimento' ? 'Recebimento de Produtos e Serviços' : 'Equipamentos Disponíveis'}]</div>
      <div className="dn4-menubar">
        {['Configurações', 'Locação', 'Manutenção', 'Faturamento', 'Vendas', 'Financeiro', 'Estoque', 'Compras', 'Janelas', 'Ajuda'].map(item => <button key={item} type="button">{item}</button>)}
      </div>
      <div className="dn4-toolbar">
        <ToolbarButton>Dep</ToolbarButton><ToolbarButton>B</ToolbarButton><ToolbarButton>Ex</ToolbarButton>
        <span className="dn4-sep" />
        <ToolbarButton onClick={() => setTela('recebimento')}>Novo RP (01)</ToolbarButton>
        <ToolbarButton>Primeiro</ToolbarButton><ToolbarButton>Voltar</ToolbarButton><ToolbarButton>Avançar</ToolbarButton><ToolbarButton>Último</ToolbarButton>
        <span className="dn4-sep" />
        <ToolbarButton onClick={() => go('/contratos')}>Gravar</ToolbarButton>
        <ToolbarButton onClick={() => go('/faturas')}>Emitir Relatório</ToolbarButton>
        <ToolbarButton onClick={() => setTela('equipamentos')}>Equip. Disp.</ToolbarButton>
      </div>
    </>
  );

  const renderRecebimento = () => (
    <div className="dn4-body">
      <h3>Recebimento de Produtos e Serviços</h3>
      <div className="dn4-form dn4-form-main">
        <Field label="Nº do Pedido" value={pedido} />
        <Field label="Situação" required value={faturasCliente[0]?.status || 'Em Aberto'} />
        <Field label="Documento" required value={faturasCliente[0]?.numero || 'NF / RP'} />
        <Field label="Tipo de Doc." required value="NF" />
        <Field label="Cliente" required wide value={cliente?.razao_social || 'Selecione um cliente'} />
        <Field label="CNPJ / CPF" value={fmtDoc(cliente?.cnpj_cpf)} />
        <Field label="Data de Emissão" value={faturasCliente[0]?.data_vencimento || new Date().toLocaleDateString('pt-BR')} />
        <Field label="Contrato" value={contratoPrincipal?.numero || '—'} />
        <Field label="CFOP" value="Selecionar" />
        <Field label="Representante" value={cliente?.contato_responsavel || '—'} />
      </div>

      <div className="dn4-tabs">
        {tabs.map(item => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={tab === item.id ? 'active' : ''}>{item.label}</button>)}
      </div>

      {tab === 'produtos' && (
        <div className="dn4-tab-panel">
          <div className="dn4-grid-title">Itens de Produtos</div>
          <table className="dn4-table">
            <thead><tr><th>Código</th><th>Descrição do Produto</th><th>Qtd</th><th>UN</th><th>Valor Unit.</th><th>Contrato</th><th>Situação</th></tr></thead>
            <tbody>{equipamentosCliente.length ? equipamentosCliente.slice(0, 12).map((item, index) => <tr key={item.id || index} onClick={() => item.contrato_id && go(`/contratos/${item.contrato_id}`)}><td>{item.patrimonio || item.ativos?.patrimonio || String(index + 1).padStart(4, '0')}</td><td>{item.ativos?.descricao || item.descricao_livre || 'Equipamento locado'}</td><td>1,0000</td><td>UN</td><td>{fmtBRL(Number(item.valor_unitario || 0))}</td><td>{item.contratos?.numero || contratoPrincipal?.numero || '—'}</td><td>{item.status || 'ativo'}</td></tr>) : <tr><td colSpan={7}>Nenhum produto/equipamento vinculado ao cliente selecionado.</td></tr>}</tbody>
          </table>
        </div>
      )}

      {tab === 'servicos' && (
        <div className="dn4-tab-panel"><div className="dn4-grid-title">Itens de Serviços</div><table className="dn4-table"><thead><tr><th>Serviço</th><th>Competência</th><th>Contrato</th><th>Valor</th><th>Status</th></tr></thead><tbody>{faturasCliente.length ? faturasCliente.slice(0, 10).map(item => <tr key={item.id} onClick={() => go('/faturas')}><td>{item.numero || 'Faturamento de locação'}</td><td>{item.competencia || '—'}</td><td>{item.contrato_id || contratoPrincipal?.numero || '—'}</td><td>{fmtBRL(Number(item.total || 0))}</td><td>{item.status || '—'}</td></tr>) : <tr><td colSpan={5}>Nenhuma fatura lançada para este cliente.</td></tr>}</tbody></table></div>
      )}

      {tab === 'complemento' && (
        <div className="dn4-tab-panel dn4-form"><Field label="Tipo de Frete" value="Sem Frete" /><Field label="Emitente" value="TOPAC" /><Field label="Destinatário" value={cliente?.razao_social} /><Field label="Observações" wide value="Gerar informações fiscais e financeiras conforme contrato/medição." /></div>
      )}

      {tab === 'totais' && (
        <div className="dn4-tab-panel dn4-totals"><Field label="Valor Produtos" value={fmtBRL(totalProdutos)} /><Field label="Valor Serviços" value={fmtBRL(totalFaturas)} /><Field label="Desconto" value={fmtBRL(0)} /><Field label="Total do Documento" value={fmtBRL(totalProdutos + totalFaturas)} /></div>
      )}

      {tab === 'vencimentos' && (
        <div className="dn4-tab-panel"><div className="dn4-checkline"><input type="checkbox" checked readOnly /> Gerar informações financeiras deste documento por frequência / condição de pagamento</div><div className="dn4-form"><Field label="Vencimento Inicial" value={faturasCliente[0]?.data_vencimento || '—'} /><Field label="Nº Parcelas" value="1" /><Field label="Forma de Pagto" value="Boleto / Carteira" /><Field label="Total em Aberto" value={fmtBRL(totalAberto)} /></div></div>
      )}

      {tab === 'nfe' && (
        <div className="dn4-tab-panel dn4-actions"><ToolbarButton>Calcular Imp.</ToolbarButton><ToolbarButton>Saldos CFOP</ToolbarButton><ToolbarButton onClick={() => go('/faturas')}>Gerar Nota Fiscal</ToolbarButton><ToolbarButton onClick={() => go('/faturas')}>Enviar / Emitir</ToolbarButton></div>
      )}

      {tab === 'arquivos' && (
        <div className="dn4-tab-panel dn4-actions"><ToolbarButton onClick={() => go('/clientes')}>Anexos do Cliente</ToolbarButton><ToolbarButton onClick={() => go('/contratos')}>Arquivos do Contrato</ToolbarButton><ToolbarButton onClick={() => go('/faturas')}>XML / PDF da Nota</ToolbarButton></div>
      )}
    </div>
  );

  const renderEquipamentos = () => (
    <div className="dn4-body">
      <h3>Equipamentos Disponíveis</h3>
      <fieldset className="dn4-fieldset"><legend>Critérios de Consulta</legend><div className="dn4-form"><Field label="Equipamentos" value="Todos" /><Field label="Tipo do Equipamento" value="Equipamento" /><Field label="Faixa de Potência" value="Potência" /><Field label="Potência Até" value="" /><Field label="Situação da Locação" value="Todas as situações" /><Field label="Cod. Barras" value="" /></div><div className="dn4-checkline"><input type="checkbox" readOnly /> Apresentar informações dos equipamentos controlados por quantidade de todas as empresas e filiais</div></fieldset>
      <table className="dn4-table dn4-equips"><thead><tr><th>Patrimônio</th><th>Situação da Locação</th><th>Descrição do Equipamento</th><th>Marca / Modelo</th><th>Cod. Barras</th><th>Contrato</th><th>Valor</th></tr></thead><tbody>{equipamentosCliente.length ? equipamentosCliente.slice(0, 18).map((item, index) => <tr key={item.id || index} onClick={() => item.contrato_id && go(`/contratos/${item.contrato_id}`)}><td>{item.patrimonio || item.ativos?.patrimonio || String(index + 1).padStart(5, '0')}</td><td>{item.status === 'ativo' ? 'Locado' : item.status || 'Disponível'}</td><td>{item.ativos?.descricao || item.descricao_livre || 'Equipamento'}</td><td>{item.ativos?.tipo || item.placa || '—'}</td><td>{item.ativos?.placa || item.placa || '—'}</td><td>{item.contratos?.numero || '—'}</td><td>{fmtBRL(Number(item.valor_unitario || 0))}</td></tr>) : <tr><td colSpan={7}>Nenhum equipamento encontrado.</td></tr>}</tbody></table>
    </div>
  );

  return (
    <section className="dn4-legacy-shell" aria-label="Tela DN4 replicada no TOPAC">
      {renderMenu()}
      <div className="dn4-switch"><button type="button" className={tela === 'recebimento' ? 'active' : ''} onClick={() => setTela('recebimento')}>Recebimento de Produtos e Serviços</button><button type="button" className={tela === 'equipamentos' ? 'active' : ''} onClick={() => setTela('equipamentos')}>Equipamentos Disponíveis</button><span>{clientes.length} clientes · {contratosCliente.length} contratos · {pendencias} pendências</span></div>
      {tela === 'recebimento' ? renderRecebimento() : renderEquipamentos()}
    </section>
  );
};

export default Dn4OperationalFlowPanel;
