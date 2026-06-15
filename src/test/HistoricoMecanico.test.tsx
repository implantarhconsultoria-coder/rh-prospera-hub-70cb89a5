import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HistoricoPage from '@/app-mecanico/pages/HistoricoPage';

const rpc = vi.fn();

vi.mock('@/app-mecanico/MecanicoAppContext', () => ({
  useMecanicoApp: () => ({
    mecanico: { acesso_id: 'acesso-1', nome: 'Mecânico Teste', empresa: 'TOPAC', filial: 'Praia Grande' },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('Histórico do App Mecânico', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('exibe o abastecimento salvo retornado pelo histórico real da RPC', async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        pontos: [],
        abastecimentos: [{
          id: 'abastecimento-1',
          placa: 'ABC1D23',
          posto_nome: 'Posto Teste',
          combustivel: 'Diesel S10',
          litros: 29.37,
          valor: 205.3,
          km_atual: 123456,
          empresa: 'TOPAC',
          data: '2026-06-12',
          hora: '12:00:00',
        }],
      },
      error: null,
    });

    render(<HistoricoPage />);

    expect(await screen.findByText('ABC1D23 - Posto Teste')).toBeInTheDocument();
    expect(screen.getByText(/Diesel S10 \| 29\.37 L \| R\$ 205\.30/)).toBeInTheDocument();
    expect(screen.getByText(/KM 123456 \| TOPAC/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('app_mecanico_listar_historico', { p_acesso_id: 'acesso-1' });
  });
});
