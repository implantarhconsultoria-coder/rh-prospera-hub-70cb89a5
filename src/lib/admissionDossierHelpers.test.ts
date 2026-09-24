import { describe, expect, it } from 'vitest';
import { readAdmissionDossier, benefitAmount, businessDaysForAdmission } from './admissionDossierHelpers';

describe('dossiê admissional', () => {
  it('lê identificação e banco no mesmo arquivo sem confundir experiência anterior com contratação', () => {
    const sample = [
      'Nome completo ANA MARIA TESTE',
      'CPF / número da CIN 705.835.661-03',
      'Nascimento 28/05/2008 (conforme CIN)',
      'Cargo pretendido Auxiliar administrativa',
      'Celular (62) 99999-1997 (declarado)',
      'E-mail ana@example.com',
      'Banco PICPAY',
      'Agência 0001',
      'Conta 123309075-5',
      'Titular ANA MARIA TESTE',
      'CPF do titular 705.835.661-03',
      'Chave PIX 6299999-1997',
      'CTPS Digital DIG NEGOCIOS CORRETORA LTDA: admissão 09/12/2025',
      'Data de nascimento: divergência na ficha manuscrita',
    ].join('\n');
    const parsed = readAdmissionDossier(sample);
    expect(parsed.fields.nome).toBe('ANA MARIA TESTE');
    expect(parsed.fields.data_nascimento).toBe('2008-05-28');
    expect(parsed.fields.funcao).toBe('Auxiliar administrativa');
    expect(parsed.fields).not.toHaveProperty('data_admissao');
    expect(parsed.banking.banco).toBe('PicPay');
    expect(parsed.banking.agencia).toBe('0001');
    expect(parsed.banking.conta).toBe('123309075');
    expect(parsed.banking.digito).toBe('5');
    expect(parsed.warnings).toHaveLength(1);
  });

  it('não calcula benefícios antes da admissão ou sem data', () => {
    expect(businessDaysForAdmission('2026-09','',[])).toBe(0);
    expect(businessDaysForAdmission('2026-08','2026-09-24',[])).toBe(0);
  });

  it('calcula VR e VT separadamente pelos dias restantes e feriados', () => {
    const days=businessDaysForAdmission('2026-09','2026-09-24',['2026-09-25']);
    expect(days).toBe(4);
    expect(benefitAmount(31,days)).toBe(124);
    expect(benefitAmount(8.60,days)).toBe(34.4);
  });
});
