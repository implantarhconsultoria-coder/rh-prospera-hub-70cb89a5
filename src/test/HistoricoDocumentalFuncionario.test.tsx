import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoricoDocumentalFuncionario from '@/components/HistoricoDocumentalFuncionario';
import { buscarHistoricoFuncionario, marcarComoEnviado, registrarDocumento, uploadDocumentoArquivo } from '@/lib/documentoHistorico';
import { getDocumentUrl } from '@/lib/documentUrl';

vi.mock('@/lib/documentoHistorico', () => ({
  DOCUMENTO_CATEGORIAS_PADRAO: ['OUTROS', 'ATESTADO'],
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
vi.mock('@/components/EmailPdfModal', () => ({
  default: ({ open, draft }: any) => open && draft ? (
    <div data-testid="email-draft">
      <span>{draft.to.join(', ')}</span>
      <span>{draft.cc.join(', ')}</span>
      <span>{draft.subject}</span>
      <pre>{draft.body}</pre>
      <span>{draft.attachments?.[0]?.attachmentName}</span>
      <button type="button" onClick={() => draft.afterSend?.()}>Confirmar envio teste</button>
    </div>
  ) : null,
}));

vi.mock('@/lib/emailUtils', () => ({
  CC_OBRIGATORIO: [],
  DESTINATARIOS_CONTABILIDADE: [],
}));

vi.mock('@/lib/documentUrl', () => ({
  downloadDocument: vi.fn(),
  getDocumentUrl: vi.fn().mockResolvedValue('https://documento.test/atestado.jpg'),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                email_marisa: 'contabilidade@empresa.com.br',
                email_robson: 'responsavel@empresa.com.br',
                emails_copia: 'copia@empresa.com.br',
              },
              error: null,
            }),
          })),
        })),
      })),
    })),
  },
}));

describe('HistoricoDocumentalFuncionario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buscarHistoricoFuncionario).mockResolvedValue([]);
  });
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

  it('prepara o atestado anexado para envio aos e-mails cadastrados da contabilidade', async () => {
    vi.mocked(buscarHistoricoFuncionario).mockResolvedValue([{
      id: 'documento-1',
      funcionario_id: 'funcionario-1',
      funcionario_nome: 'Ilma Mendes',
      company_id: 'empresa-1',
      empresa_nome: 'TOPAC Goiânia',
      categoria: 'ATESTADO',
      tipo_documento: 'ATESTADO',
      descricao: 'Afastamento por dois dias',
      observacao: 'Repouso conforme orientação médica',
      nome_arquivo: 'atestado-medico.jpg',
      data_documento: '2026-06-15T12:00:00.000Z',
      storage_bucket: 'documentos-funcionarios',
      storage_path: 'funcionario-1/atestado/atestado-medico.jpg',
      status_envio: 'gerado',
      created_at: '2026-06-15T12:00:00.000Z',
    }] as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(['imagem'], { type: 'image/jpeg' })),
    }));

    render(<HistoricoDocumentalFuncionario funcionarioId="funcionario-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar para contabilidade' }));

    const draft = await screen.findByTestId('email-draft');
    expect(draft).toHaveTextContent('contabilidade@empresa.com.br');
    expect(draft).toHaveTextContent('responsavel@empresa.com.br');
    expect(draft).toHaveTextContent('copia@empresa.com.br');
    expect(draft).toHaveTextContent('ATESTADO - Ilma Mendes');
    expect(draft).toHaveTextContent('Funcionario: Ilma Mendes');
    expect(draft).toHaveTextContent('Empresa: TOPAC Goiânia');
    expect(draft).toHaveTextContent('Tipo do documento: ATESTADO');
    expect(draft).toHaveTextContent('Data do documento: 15/06/2026');
    expect(draft).toHaveTextContent('Observacao/descricao: Afastamento por dois dias | Repouso conforme orientação médica');
    expect(draft).toHaveTextContent('O PDF/arquivo enviado segue em anexo.');
    expect(draft).toHaveTextContent('atestado-medico.jpg');
    expect(getDocumentUrl).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar envio teste' }));
    await waitFor(() => expect(marcarComoEnviado).toHaveBeenCalledWith(
      'documento-1',
      'usuario-1',
      'teste@topac.pro',
      'contabilidade@empresa.com.br, responsavel@empresa.com.br, copia@empresa.com.br',
    ));
  });

});
