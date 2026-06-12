import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AbastecimentoPage from '@/app-mecanico/pages/AbastecimentoPage';
import { uploadFoto } from '@/app-mecanico/lib/upload';
import { gerarCupomAbastecimentoPdf } from '@/app-mecanico/lib/abastecimentoPdf';

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams('qr=POSTO-001')],
}));

vi.mock('qr-scanner', () => ({
  default: class QrScannerMock {
    static scanImage = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    destroy = vi.fn();
  },
}));

vi.mock('@/app-mecanico/MecanicoAppContext', () => ({
  useMecanicoApp: () => ({
    mecanico: {
      acesso_id: 'acesso-1',
      nome: 'Mecânico Teste',
      empresa: 'TOPAC',
      filial: 'Praia Grande',
      registro_teste: true,
    },
  }),
}));

vi.mock('@/lib/browserGeo', () => ({
  getBrowserLocation: vi.fn().mockResolvedValue({ latitude: -23.9, longitude: -46.4 }),
}));

vi.mock('@/app-mecanico/lib/upload', () => ({ uploadFoto: vi.fn() }));
vi.mock('@/app-mecanico/lib/abastecimentoPdf', () => ({ gerarCupomAbastecimentoPdf: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock('@/app-mecanico/components/CameraCapture', () => ({
  default: ({ open, title, onCapture }: { open: boolean; title: string; onCapture: (blob: Blob) => void | Promise<void> }) => open ? (
    <button type="button" onClick={async () => { await onCapture(new Blob([title], { type: 'image/jpeg' })); }}>
      Capturar {title}
    </button>
  ) : null,
}));

const rpc = vi.fn();
const invoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

describe('AbastecimentoPage — fluxo completo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('Image', class ImageMock {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:recibo') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    rpc.mockImplementation(async (name: string) => {
      if (name === 'app_mecanico_validar_qr_posto') {
        return {
          data: {
            ok: true,
            posto: { id: 'posto-1', codigo: 'POSTO-001', nome: 'Posto Teste', cnpj: '12.345.678/0001-90' },
            postos: [{ id: 'posto-1', codigo: 'POSTO-001', nome: 'Posto Teste', cnpj: '12.345.678/0001-90' }],
            mecanico: { nome: 'Mecânico Teste', empresa: 'TOPAC', filial: 'Praia Grande', placa: 'ABC1D23', veiculos: [] },
          },
          error: null,
        };
      }
      if (name === 'app_mecanico_registrar_abastecimento_posto') {
        return { data: { ok: true, id: 'abastecimento-1', preco_litro: 6.99 }, error: null };
      }
      if (name === 'app_mecanico_vincular_recibo_pdf') {
        return { data: { ok: true, recibo_pdf_url: 'https://storage.test/recibo.pdf' }, error: null };
      }
      throw new Error(`RPC inesperada: ${name}`);
    });

    invoke
      .mockResolvedValueOnce({ data: { ok: true, km: 123456, confianca: 0.95 }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, valor: 205.3, litros: 29.37, valor_por_litro: 6.99, confianca: 0.95 }, error: null });

    vi.mocked(uploadFoto)
      .mockResolvedValueOnce('https://storage.test/painel.jpg')
      .mockResolvedValueOnce('https://storage.test/bomba.jpg')
      .mockResolvedValueOnce('https://storage.test/recibo.pdf');

    vi.mocked(gerarCupomAbastecimentoPdf).mockResolvedValue({
      blob: new Blob(['pdf'], { type: 'application/pdf' }),
      fileName: 'recibo.pdf',
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('executa QR → painel → bomba → banco → PDF → vínculo → compartilhamento', async () => {
    render(<AbastecimentoPage />);

    await screen.findByText('QR validado');
    fireEvent.click(screen.getByRole('button', { name: 'Tirar foto do painel/KM' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Capturar Foto do painel/KM' }));
    });

    await screen.findByText('KM reconhecido');
    expect(screen.getByText('123456')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar foto da bomba' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Capturar Foto da bomba' }));
    });

    await screen.findByText('Leitura automática concluída');
    expect(screen.getByText('R$ 205,30')).toBeInTheDocument();
    expect(screen.getByText('29,37 L')).toBeInTheDocument();
    expect(screen.getByText('R$ 6,99')).toBeInTheDocument();
    expect(screen.queryByLabelText('Valor (R$)')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar e gerar recibo' }));
    });
    await screen.findByText('Abastecimento registrado');

    expect(rpc).toHaveBeenCalledWith('app_mecanico_registrar_abastecimento_posto', expect.objectContaining({
      p_posto_codigo: 'POSTO-001',
      p_valor: 205.3,
      p_litros: 29.37,
      p_km: 123456,
      p_placa: 'ABC1D23',
      p_foto_bomba_url: 'https://storage.test/bomba.jpg',
      p_foto_painel_url: 'https://storage.test/painel.jpg',
      p_latitude: -23.9,
      p_longitude: -46.4,
    }));
    expect(rpc).toHaveBeenCalledWith('app_mecanico_vincular_recibo_pdf', expect.objectContaining({
      p_abastecimento_id: 'abastecimento-1',
      p_recibo_pdf_url: 'https://storage.test/recibo.pdf',
    }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Compartilhar PDF' }));
    });
    await waitFor(() => expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Recibo de abastecimento TOPAC',
      files: expect.any(Array),
    })));
  });
});
