import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmployeeDetailPage from '@/pages/EmployeeDetailPage';
import { useApp } from '@/context/AppContext';

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'funcionario-1' }),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/admin/funcionarios/funcionario-1' }),
}));

vi.mock('@/context/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/components/HistoricoDocumentalFuncionario', () => ({ default: () => <div>Histórico de documentos</div> }));
vi.mock('@/components/EmailPdfModal', () => ({ default: () => null }));
vi.mock('@/lib/calculations', () => ({
  formatCurrency: () => 'R$ 0,00',
  formatDate: () => '-',
  feriasStatus: () => ({ status: 'em dia', periodoAtual: 0, mesesNoPeriodo: 0 }),
  asoStatus: () => ({ status: 'ok', proximoASO: new Date(), diasRestantes: 365 }),
}));
vi.mock('@/lib/employeeRoleRules', () => ({
  employeeHasInsalubridade: () => false,
  getPericulosidadeAplicavel: () => 0,
}));
vi.mock('@/lib/pdfGenerator', () => ({ gerarAutorizacaoExameAdmissionalPdf: vi.fn() }));
vi.mock('@/lib/emailUtils', () => ({ CC_OBRIGATORIO: [], DESTINATARIOS_ASO: [] }));
vi.mock('@/lib/documentoHistorico', () => ({
  arquivarDocumentoFuncionario: vi.fn(),
  marcarComoEnviado: vi.fn(),
}));

const employee = {
  id: 'funcionario-1', companyId: 'empresa-1', name: 'Ilma Mendes', cargo: 'Auxiliar', status: 'ativo',
  observacoes: '', dataAdmissao: '2024-01-01', dataExameMedico: '2026-01-01', salarioBase: 0,
  vrAtivo: false, vrDiario: 0, vaAtivo: false, vaMensal: 0, vtAtivo: false, vtDiario: 0,
};

describe('observações gerais do Histórico Documental', () => {
  afterEach(cleanup);

  it('não salva nem remove espaços durante a digitação e envia o texto somente ao salvar', async () => {
    const updateEmployee = vi.fn().mockResolvedValue({ ok: true });
    vi.mocked(useApp).mockReturnValue({
      employees: [employee],
      companies: [{ id: 'empresa-1', name: 'TOPAC Goiânia' }],
      updateEmployee,
      session: null,
    } as ReturnType<typeof useApp>);

    render(<EmployeeDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Histórico Documental' }));

    const observacoes = screen.getByPlaceholderText('Observações adicionais do funcionário...');
    const texto = 'CARTA DEMISSIONAL ILMA MENDES GOIANIA\nSegunda linha preservada';
    fireEvent.change(observacoes, { target: { value: texto } });

    expect(observacoes).toHaveValue(texto);
    expect(updateEmployee).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar observações' }));
    await waitFor(() => expect(updateEmployee).toHaveBeenCalledWith('funcionario-1', { observacoes: texto }));
  });
});
