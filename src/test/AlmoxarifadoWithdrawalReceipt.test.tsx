import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AlmoxarifadoDesktopV4 from '@/components/AlmoxarifadoDesktopV4';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), print: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/lib/printInPage', () => ({ printDocumentInPage: mocks.print }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));
vi.mock('@/context/AppContext', () => ({ useApp: () => ({
  session: { user: { id: 'operator-1', email: 'entrega@topac.test', user_metadata: { full_name: 'Maria Entregadora' } } },
  employees: [{ id: 'employee-1', name: 'João Funcionário Completo', companyId: 'company-1', status: 'ativo' }],
  companies: [{ id: 'company-1', name: 'TOPAC Praia' }],
}) }));
vi.mock('@/components/almoxarifado/AlmoxarifadoFechamentoOperacional', () => ({ default: () => null }));
vi.mock('@/components/almoxarifado/RetiradaInteligentePanel', () => ({ default: () => null }));

const registered = {
  id: 'load-1', protocolo: 'RET-20261008-001', tipo: 'retirada',
  created_at: '2026-10-08T17:42:31Z', funcionario_id: 'employee-1',
  funcionario_nome: 'João Funcionário Completo', destino_company_id: 'company-1',
  user_id: 'operator-original', observacoes: 'Conferir na entrega',
};
let stock: { id: string; codigo_topac: string; nome: string; saldo: number }[];
let committed: boolean;
let timestampError: boolean;
const queries: { table: string; field: string; value: unknown }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  committed = false;
  timestampError = false;
  queries.length = 0;
  stock = [
    { id: 'item-1', codigo_topac: 'MAT-01', nome: 'Luva de proteção', saldo: 10 },
    { id: 'item-2', codigo_topac: 'MAT-02', nome: 'Óculos de segurança', saldo: 8 },
  ];
  mocks.rpc.mockImplementation(async (_rpc, params) => {
    for (const item of params.p_itens) stock.find(row => row.id === item.item_id)!.saldo -= item.quantidade;
    committed = true;
    return { data: { ok: true, id: registered.id, protocolo: registered.protocolo,
      funcionario: registered.funcionario_nome, empresa_destino: 'TOPAC Praia' }, error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    let single = false;
    const result = () => {
      if (table === 'almoxarifado_estoque_resumo') return { data: stock.map(row => ({ ...row })), error: null };
      if (table === 'almoxarifado_cargas') return single
        ? { data: timestampError ? null : registered, error: timestampError ? { message: 'Falha de leitura' } : null }
        : { data: committed ? [registered] : [], error: null };
      if (table === 'almoxarifado_carga_itens') return { data: [
        { item_id: 'item-1', quantidade_entregue: 2, almoxarifado_itens: { codigo_topac: 'MAT-01', nome: 'Luva de proteção' } },
        { item_id: 'item-2', quantidade_entregue: 3, almoxarifado_itens: { codigo_topac: 'MAT-02', nome: 'Óculos de segurança' } },
      ], error: null };
      if (table === 'almoxarifado_saidas') return { data: { responsavel_liberacao: 'original@topac.test' }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'gte', 'order', 'range', 'limit']) chain[method] = () => chain;
    chain.eq = (field: string, value: unknown) => { queries.push({ table, field, value }); return chain; };
    chain.single = () => { single = true; return Promise.resolve(result()); };
    chain.maybeSingle = () => Promise.resolve(result());
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return chain;
  });
});
afterEach(cleanup);

async function prepareWithdrawal(note = 'Conferir na entrega') {
  render(<AlmoxarifadoDesktopV4 />);
  fireEvent.click(await screen.findByRole('button', { name: /Registrar retirada/ }));
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'employee-1' } });
  for (const [id, quantity] of [['item-1', '2'], ['item-2', '3']]) {
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: id } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: quantity } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
  }
  fireEvent.change(screen.getByPlaceholderText('Observação opcional'), { target: { value: note } });
}

const previewDocument = () => {
  const frame = screen.getByTitle('Visualização da ficha de retirada');
  return new DOMParser().parseFromString(frame.getAttribute('srcdoc')!, 'text/html');
};

describe('ficha da retirada registrada no Almoxarifado V4', () => {
  it('preserva os dados, abre automaticamente e imprime somente a ficha A4 sem repetir a RPC', async () => {
    await prepareWithdrawal();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada e baixar estoque' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'IMPRIMIR FICHA' })).toBeEnabled());
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('almoxarifado_criar_carga_v2', {
      p_tipo: 'retirada', p_funcionario_id: 'employee-1', p_veiculo: null, p_placa: null,
      p_itens: [{ item_id: 'item-1', quantidade: 2 }, { item_id: 'item-2', quantidade: 3 }],
      p_observacoes: 'Conferir na entrega',
    });
    expect(stock.map(row => row.saldo)).toEqual([8, 5]);
    const document = previewDocument();
    expect(document.body.textContent).toContain('RET-20261008-001');
    expect(document.body.textContent).toContain('João Funcionário Completo');
    expect(document.body.textContent).toContain('TOPAC Praia');
    expect(document.body.textContent).toContain('08/10/2026');
    expect(document.body.textContent).toContain('14:42:31');
    expect(document.body.textContent).toContain('Maria Entregadora — entrega@topac.test');
    expect(document.body.textContent).toContain('Conferir na entrega');
    expect(Array.from(document.querySelectorAll('tbody tr'), row => row.textContent)).toEqual([
      'MAT-01Luva de proteção2', 'MAT-02Óculos de segurança3',
    ]);
    expect(document.querySelectorAll('.signature')).toHaveLength(2);
    expect(document.querySelector('.signatures')?.textContent).not.toMatch(/DATA|HORA/);
    fireEvent.click(screen.getByRole('button', { name: 'IMPRIMIR FICHA' }));
    const html = mocks.print.mock.calls[0][0];
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('background: #fff');
    expect(html).not.toContain('Confirmar retirada');
    expect(html).not.toContain('almox-v3');
    fireEvent.click(screen.getByRole('button', { name: 'FECHAR' }));
    await screen.findByRole('button', { name: /Registrar retirada/ });
    fireEvent.click(screen.getByRole('button', { name: /Registrar retirada/ }));
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('');
    expect(screen.getByPlaceholderText('Observação opcional')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirmar retirada e baixar estoque' })).toBeDisabled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('reabre pelo histórico com o responsável original e apenas consultas', async () => {
    committed = true;
    render(<AlmoxarifadoDesktopV4 isAdmin />);
    fireEvent.click(await screen.findByRole('button', { name: /^Histórico Visualizar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver / imprimir ficha' }));
    await screen.findByRole('button', { name: 'IMPRIMIR FICHA' });
    expect(previewDocument().body.textContent).toContain('original@topac.test');
    expect(previewDocument().body.textContent).not.toContain('entrega@topac.test');
    expect(previewDocument().body.textContent).toContain('RET-20261008-001');
    expect(queries).toContainEqual({ table: 'almoxarifado_carga_itens', field: 'carga_id', value: 'load-1' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(stock.map(row => row.saldo)).toEqual([10, 8]);
  });

  it('não abre ficha nem limpa o carrinho se a RPC falhar', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Item sem saldo suficiente' } });
    await prepareWithdrawal();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada e baixar estoque' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Item sem saldo suficiente'));
    expect(screen.queryByTitle('Visualização da ficha de retirada')).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('employee-1');
    expect(screen.getByText('MAT-01 — Luva de proteção')).toBeInTheDocument();
    expect(stock.map(row => row.saldo)).toEqual([10, 8]);
  });

  it('não repete a baixa se a consulta do horário falhar após confirmar a retirada', async () => {
    timestampError = true;
    await prepareWithdrawal('');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada e baixar estoque' }));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'IMPRIMIR FICHA' })).toBeDisabled();
    expect(previewDocument().body.textContent).not.toContain('OBSERVAÇÃO:');
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(stock.map(row => row.saldo)).toEqual([8, 5]);
  });

  it('bloqueia um segundo clique enquanto a retirada aguarda confirmação', async () => {
    let resolveRpc!: (value: unknown) => void;
    mocks.rpc.mockImplementation(() => new Promise(resolve => { resolveRpc = resolve; }));
    await prepareWithdrawal();
    const button = screen.getByRole('button', { name: 'Confirmar retirada e baixar estoque' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    resolveRpc({ data: { id: registered.id, protocolo: registered.protocolo }, error: null });
    await waitFor(() => expect(screen.getByRole('button', { name: 'IMPRIMIR FICHA' })).toBeEnabled());
  });
});
