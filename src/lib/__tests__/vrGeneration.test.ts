import { describe, expect, it } from 'vitest';
import {
  buildVRReportRows,
  buildVTReportRows,
  getVRAdmissionCalculation,
  getVrGenerationDestinations,
  mergeBenefitGenerationSnapshot,
  shouldCreateVrPayrollDocument,
} from '@/lib/benefitReports';
import { getWorkingDays, getWorkingDaysBetween } from '@/lib/workingDays';

const employee = (overrides: Record<string, unknown> = {}) => ({
  id: 'emp-1',
  companyId: 'company-1',
  registro: '1',
  matriculaEsocial: '',
  name: 'Funcionário Teste',
  cpf: '00000000000',
  rg: '',
  cargo: 'Mecânico',
  categoria: 'operacional',
  salarioBase: 0,
  dataAdmissao: '2026-09-01',
  dataNascimento: '',
  dataExameMedico: '',
  setorGhe: '',
  cpfPendenteAcesso: false,
  vrAtivo: true,
  vrDiario: 31,
  vaAtivo: false,
  vaMensal: 0,
  vtAtivo: true,
  vtDiario: 10,
  insalubridadeAtiva: false,
  insalubridadeValor: 0,
  status: 'ativo',
  telefone: '',
  celular: '',
  email: '',
  endereco: '',
  pix: '',
  banco: '',
  agencia: '',
  conta: '',
  observacoes: '',
  ...overrides,
}) as any;

const entry = (employeeId: string, competencia: string, faltasDias = 0) => ({
  employeeId,
  companyId: 'company-1',
  competencia,
  faltasDias,
  atrasos: 0,
  he50: 0,
  he60: 0,
  he100: 0,
  adicionais: 0,
  descontosDiversos: 0,
  adiantamento: 0,
  vrAplicado: true,
  vrDias: 0,
  vaAplicado: false,
  vtAplicado: true,
  vtDesconto: 0,
  comissaoBase: 0,
  insalubridadeAplicada: false,
}) as any;

describe('VR proporcional por admissão', () => {
  it('A. funcionário admitido antes da competência recebe o mês normal', () => {
    const emp = employee({ dataAdmissao: '2026-09-01' });
    const rows = buildVRReportRows([emp], [], 22, '2026-10');
    expect(rows).toHaveLength(1);
    expect(rows[0].tipoCalculo).toBe('MENSAL');
    expect(rows[0].diasPrevistos).toBe(22);
    expect(rows[0].diasFinais).toBe(22);
  });

  it('B. admissão no meio do mês recebe somente dias úteis da admissão ao fim', () => {
    const emp = employee({ dataAdmissao: '2026-10-14' });
    const rows = buildVRReportRows([emp], [], 22, '2026-10');
    expect(getWorkingDaysBetween('2026-10-14', '2026-10-31')).toBe(13);
    expect(rows[0].tipoCalculo).toBe('PROPORCIONAL_ADMISSAO');
    expect(rows[0].diasPrevistos).toBe(13);
    expect(rows[0].periodoInicio).toBe('2026-10-14');
    expect(rows[0].periodoFim).toBe('2026-10-31');
  });

  it('C. admissão em sábado começa efetivamente no próximo dia útil', () => {
    const emp = employee({ dataAdmissao: '2026-10-17' });
    const rows = buildVRReportRows([emp], [], 22, '2026-10');
    expect(rows[0].diasPrevistos).toBe(10);
  });

  it('preserva exclusão opcional de feriados no intervalo proporcional', () => {
    expect(getWorkingDaysBetween('2026-10-14', '2026-10-31', ['2026-10-15'])).toBe(12);
    const emp = employee({ dataAdmissao: '2026-10-14' });
    const rows = buildVRReportRows([emp], [], 22, '2026-10', ['2026-10-15']);
    expect(rows[0].diasPrevistos).toBe(12);
  });

  it('D. admissão posterior à competência não gera recibo', () => {
    const emp = employee({ dataAdmissao: '2026-11-02' });
    expect(getVRAdmissionCalculation(emp, '2026-10').reason).toBe('ADMISSION_AFTER_COMPETENCIA');
    expect(buildVRReportRows([emp], [], 22, '2026-10')).toHaveLength(0);
  });

  it('E. recém-admitido não sofre desconto de falta da competência anterior', () => {
    const emp = employee({ dataAdmissao: '2026-10-14' });
    const rows = buildVRReportRows([emp], [entry(emp.id, '2026-09', 5)], 22, '2026-10');
    expect(rows[0].diasDescontados).toBe(0);
    expect(rows[0].diasFinais).toBe(13);
  });

  it('F. mensal e proporcional têm dias diferentes na mesma geração', () => {
    const mensal = employee({ id: 'mensal', dataAdmissao: '2026-09-01' });
    const proporcional = employee({ id: 'proporcional', dataAdmissao: '2026-10-14' });
    const rows = buildVRReportRows([mensal, proporcional], [], 22, '2026-10');
    expect(rows.map((row) => [row.emp.id, row.diasFinais])).toEqual([
      ['mensal', 22],
      ['proporcional', 13],
    ]);
  });

  it('G. emissão individual calcula somente o funcionário escolhido', () => {
    const escolhido = employee({ id: 'escolhido', dataAdmissao: '2026-10-20' });
    const rows = buildVRReportRows([escolhido], [], getWorkingDays('2026-10'), '2026-10');
    expect(rows).toHaveLength(1);
    expect(rows[0].emp.id).toBe('escolhido');
    expect(rows[0].diasFinais).toBe(9);
  });

  it('H. emissão individual atualiza/inclui sem apagar o snapshot consolidado', () => {
    const existing = [
      { employee_id: 'a', valor_total: 100 },
      { employee_id: 'b', valor_total: 200 },
    ];
    const merged = mergeBenefitGenerationSnapshot(existing, { employee_id: 'b', valor_total: 250 });
    expect(merged).toEqual([
      { employee_id: 'a', valor_total: 100 },
      { employee_id: 'b', valor_total: 250 },
    ]);
  });

  it('I. assinatura desabilitada mantém emissão de recibo e bloqueia somente assinatura', () => {
    expect(getVrGenerationDestinations(false)).toEqual({ receipt: true, digitalSignature: false });
  });

  it('J. assinatura habilitada mantém recibo e publica também para assinatura', () => {
    expect(getVrGenerationDestinations(true)).toEqual({ receipt: true, digitalSignature: true });
  });

  it('K. emissão repetida não duplica e documento assinado não é substituído', () => {
    expect(shouldCreateVrPayrollDocument({
      currentHash: 'hash-1',
      nextHash: 'hash-1',
      currentConfirmed: true,
      hasComplement: false,
      hasSignature: false,
    })).toBe(false);
    expect(shouldCreateVrPayrollDocument({
      currentHash: 'hash-1',
      nextHash: 'hash-2',
      currentConfirmed: true,
      hasComplement: false,
      hasSignature: true,
    })).toBe(false);
  });

  it('preserva a regra atual de VT sem proporcionalidade de admissão', () => {
    const emp = employee({ id: 'vt', dataAdmissao: '2026-10-14', vtDiario: 10 });
    const rows = buildVTReportRows([emp], [entry(emp.id, '2026-09', 2)], 22, '2026-10');
    expect(rows).toHaveLength(1);
    expect(rows[0].diasPrevistos).toBe(22);
    expect(rows[0].diasDescontados).toBe(2);
    expect(rows[0].diasFinais).toBe(20);
    expect(rows[0].valorTotal).toBe(200);
  });
});
