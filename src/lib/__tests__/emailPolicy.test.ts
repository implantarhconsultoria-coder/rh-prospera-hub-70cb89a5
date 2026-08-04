import { describe, expect, it } from 'vitest';
import {
  applyTopacEmailPolicy,
  TOPAC_REPORT_CC,
  TOPAC_REPORT_SIGNATURE,
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

  it('não altera e-mails que não sejam de planilha ou relatório', () => {
    const result = applyTopacEmailPolicy({
      subject: 'Mensagem operacional',
      body: 'Conteúdo operacional',
      cc: ['operacao@topac.com.br'],
    });

    expect(result).toEqual({
      body: 'Conteúdo operacional',
      cc: ['operacao@topac.com.br'],
      institutional: false,
    });
  });
});
