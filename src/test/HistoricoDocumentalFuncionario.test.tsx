import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoricoDocumentalFuncionario from '@/components/HistoricoDocumentalFuncionario';
import { registrarDocumento, uploadDocumentoArquivo } from '@/lib/documentoHistorico';

vi.mock('@/lib/documentoHistorico', () => ({
  DOCUMENTO_CATEGORIAS_PADRAO: ['OUTROS'],
  DOCUMENTO_ORIGENS_PADRAO: ['upload_manual'],
  buscarHistoricoFuncionario: vi.fn().mockResolvedValue([]),
  excluirDocumentoFuncionario: vi.fn(),
  marcarComoEnviado: vi.fn(),
  registrarDocumento: vi.fn(),
  uploadDocumentoArquivo: vi.fn().mockResolvedValue('funcionario-1/outros/documento.pdf'),
}));

vi.mock('@/context/AppContext', () => ({
  useApp: () => ({
    employees: [{ id: 'funcionario-1', companyId: 'empresa-1', name: 'Ilma Mendes' }],
    companies: [{ id: 'empresa-1', name: 'TOPAC Goiânia' }],
    session: { user: { id: 'usuario-1', email: 'teste@topac.pro' } },
  }),
}));

vi.mock('@/components/PdfDocumentViewer', () => ({ default: () => null }));
vi.mock('@/components/EmailPdfModal', () => ({ default: () => null }));

vi.mock('@/lib/emailUtils', () => ({
  CC_OBRIGATORIO: [],
  DESTINATARIOS_CONTABILIDADE: [],
}));

vi.mock('@/lib/documentUrl', () => ({
  downloadDocument: vi.fn(),
  getDocumentUrl: vi.fn(),
}));

describe('HistoricoDocumentalFuncionario', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('mantém exatamente os espaços digitados na descrição', async () => {
    render(<HistoricoDocumentalFuncionario funcionarioId="funcionario-1" />);

    const descricao = await screen.findByLabelText('Descrição/nome do documento');
    const texto = 'CARTA DEMISSIONAL ILMA MENDES GOIANIA';
    fireEvent.change(descricao, { target: { value: texto } });

    expect(descricao).toHaveValue(texto);
  });

  it('mantém espaços e quebras de linha na observação durante a digitação', async () => {
    render(<HistoricoDocumentalFuncionario funcionarioId="funcionario-1" />);

    const observacao = await screen.findByLabelText('Observação do documento');
    const texto = 'Primeira linha com espaços\nSegunda linha preservada';
    fireEvent.change(observacao, { target: { value: texto } });

    expect(observacao).toHaveValue(texto);
  });

  it('salva descrição com espaços e observação com quebra de linha', async () => {
    const { container } = render(<HistoricoDocumentalFuncionario funcionarioId="funcionario-1" />);
    await screen.findByLabelText('Descrição/nome do documento');

    const arquivo = new File(['pdf'], 'carta demissional.pdf', { type: 'application/pdf' });
    const inputArquivo = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(inputArquivo, { target: { files: [arquivo] } });
    fireEvent.change(screen.getByLabelText('Descrição/nome do documento'), {
      target: { value: '  CARTA DEMISSIONAL ILMA MENDES GOIANIA  ' },
    });
    fireEvent.change(screen.getByLabelText('Observação do documento'), {
      target: { value: `  Primeira linha\nSegunda linha  ` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));

    await waitFor(() => expect(uploadDocumentoArquivo).toHaveBeenCalled());
    expect(registrarDocumento).toHaveBeenCalledWith(expect.objectContaining({
      descricao: 'CARTA DEMISSIONAL ILMA MENDES GOIANIA',
      observacao: `Primeira linha\nSegunda linha`,
    }));
  });

});
