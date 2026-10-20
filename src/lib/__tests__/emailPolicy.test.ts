import { describe, expect, it } from 'vitest';
import {
  applyTopacEmailPolicy,
  TOPAC_REPORT_CC,
  TOPAC_REPORT_SIGNATURE,
  DAPHINE_RH_SIGNATURE,
} from '@/lib/emailPolicy';

describe('applyTopacEmailPolicy', () => {
  it('padroniza assinatura e cópias de relatórios sem nome de usuário', () => {
    const result = applyTopacEmailPolicy({
      subject: 'Relatório consolidado de abastecimentos',
      body: 'Segue o relatório solicitado.\n\nAtenciosamente,\nUsuário Qualquer',
      cc: ['ROBSON@TOPAC.COM.BR'],
      attachmentNames: ['Relatorio_Consolidado_Abastecimentos_2026-08.pdf'],
      attachmentContentTypes: ['application/pdf'],
    });

    expect(result.institutional).toBe(true);
    expect(result.body).toBe(`Segue o relatório solicitado.\n\n${TOPAC_REPORT_SIGNATURE}`);
    expect(result.body).not.toContain('Usuário Qualquer');
    expect(result.cc).toEqual(expect.arrayContaining([...TOPAC_REPORT_CC]));
    expect(result.cc.filter((email) => email === 'robson@topac.com.br')).toHaveLength(1);
    expect(result.cc.filter((email) => email === 'adm.matriz@topac.com.br')).toHaveLength(1);
  });

  it('usa assinatura da Daphine e coloca Rodrigo em cópia sem perder destinatários', () => {
    const result = applyTopacEmailPolicy({
      to: ['dp@aatconsultoria.com.br'],
      cc: ['adm.matriz@topac.com.br'],
      senderEmail: 'ADM1.MATRIZ@TOPAC.COM.BR',
      subject: 'Relatório de férias',
      body: 'Encaminho relatório.\n\nAtenciosamente,\nRodrigo de Souza Sabino',
      attachmentNames: ['ferias.pdf'],
    });
    expect(result.to).toEqual(['dp@aatconsultoria.com.br']);
    expect(result.body).toBe(`Encaminho relatório.\n\n${DAPHINE_RH_SIGNATURE}`);
    expect(result.cc.filter((email) => email === 'adm.matriz@topac.com.br')).toHaveLength(1);
    expect(result.institutional).toBe(false);
  });

  it('corrige assinatura mesmo em e-mail operacional e mantém cópia do Rodrigo', () => {
    const result = applyTopacEmailPolicy({
      to: ['clinica@exemplo.com'],
      senderEmail: 'adm1.matriz@topac.com.br',
      subject: 'Solicitação de exame demissional',
      body: 'Prezados, segue solicitação.\n\nAtenciosamente,\nAdministrador Topac RH PRO Multiempresas',
    });
    expect(result.body).toBe(`Prezados, segue solicitação.\n\n${DAPHINE_RH_SIGNATURE}`);
    expect(result.cc).toContain('adm.matriz@topac.com.br');
  });

  it('não altera e-mails que não sejam de planilha ou relatório', () => {
    const result = applyTopacEmailPolicy({
      subject: 'Mensagem operacional',
      body: 'Conteúdo operacional',
      cc: ['operacao@topac.com.br'],
    });

    expect(result).toEqual({
      to: [],
      body: 'Conteúdo operacional',
      cc: ['operacao@topac.com.br'],
      institutional: false,
    });
  });
});
