import { describe, expect, it } from 'vitest';
import { buildAssistedWhatsAppUrl, normalizeAssistedWhatsAppPhone } from '@/lib/assistedWhatsApp';
import {
  buildAdmissionWelcome,
  getNextAdmissionDateSaoPaulo,
  isAdmissionWelcomeEligible,
} from '@/lib/admissionWelcome';

const eduardo = {
  preCadastroId: 'b15aefb1-bed5-4ce1-b86e-46a97a484ed3',
  candidateName: 'Eduardo de Jesus Brito',
  companyName: 'TOPAC MATRIZ',
  dataAdmissao: '2026-10-14',
  jornada: 'Seg. a Qui. 7:30 às 17:30 - Sex. 7:30 às 16:30',
  vrAtivo: true,
  vrDiario: 31,
  vtAtivo: true,
  vtDiario: 35.1,
};

describe('boas-vindas admissional TOPAC', () => {
  it('define o dia calendário seguinte no fuso de São Paulo', () => {
    expect(getNextAdmissionDateSaoPaulo('2026-10-13T15:00:00-03:00')).toBe('2026-10-14');
    expect(getNextAdmissionDateSaoPaulo('2026-10-31T22:30:00-03:00')).toBe('2026-11-01');
  });

  it('calcula Eduardo com 13 dias úteis, VR 403 e VT 456,30', () => {
    const result = buildAdmissionWelcome(eduardo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.diasUteis).toBe(13);
    expect(result.summary.vrTotal).toBe(403);
    expect(result.summary.vtTotal).toBe(456.3);
    expect(result.summary.totalBeneficios).toBe(859.3);
    expect(result.summary.message).toContain('Olá, Eduardo!');
    expect(result.summary.message).toContain('14/10/2026');
    expect(result.summary.message).toContain('R$ 403,00');
    expect(result.summary.message).toContain('R$ 456,30');
    expect(result.summary.message).toContain(eduardo.jornada);
    expect(result.summary.message).not.toContain('2026-10-14');
  });

  it('bloqueia mensagem sem jornada', () => {
    const result = buildAdmissionWelcome({ ...eduardo, jornada: '' });
    expect(result).toEqual({ ok: false, error: 'Informe a jornada antes de enviar as boas-vindas.' });
  });

  it('bloqueia VR ativo sem valor diário', () => {
    const result = buildAdmissionWelcome({ ...eduardo, vrDiario: 0 });
    expect(result).toEqual({ ok: false, error: 'O VR está ativo, mas o valor diário não está configurado.' });
  });

  it('bloqueia VT ativo sem valor diário', () => {
    const result = buildAdmissionWelcome({ ...eduardo, vtDiario: 0 });
    expect(result).toEqual({ ok: false, error: 'O VT está ativo, mas o valor diário não está configurado.' });
  });

  it('não cria cálculo de VT quando não solicitado', () => {
    const result = buildAdmissionWelcome({ ...eduardo, vtAtivo: false, vtDiario: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.vtDias).toBe(0);
    expect(result.summary.vtTotal).toBe(0);
    expect(result.summary.message).toContain('Não solicitado no cadastro atual.');
  });

  it('só habilita boas-vindas após aprovação real e vínculo ao funcionário', () => {
    expect(isAdmissionWelcomeEligible('2026-10-13T17:29:52Z', '0fccd97a-f602-4549-a4c2-718108c4c865')).toBe(true);
    expect(isAdmissionWelcomeEligible(null, '0fccd97a-f602-4549-a4c2-718108c4c865')).toBe(false);
    expect(isAdmissionWelcomeEligible('2026-10-13T17:29:52Z', null)).toBe(false);
  });

  it('reutiliza validação canônica do WhatsApp assistido', () => {
    expect(normalizeAssistedWhatsAppPhone('11 97644-4757')).toBe('5511976444757');
    expect(buildAssistedWhatsAppUrl('11 97644-4757', 'Olá')).toContain('https://wa.me/5511976444757?text=');
    expect(buildAssistedWhatsAppUrl('123', 'Olá')).toBe('');
  });

  it('recalcular a mensagem é puro e preserva a data de admissão persistida', () => {
    const first = buildAdmissionWelcome(eduardo);
    const resend = buildAdmissionWelcome(eduardo);
    expect(first).toEqual(resend);
    if (resend.ok) expect(resend.summary.dataInicio).toBe('2026-10-14');
  });
});
