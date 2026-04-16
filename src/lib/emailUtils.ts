/**
 * Abre o cliente de e-mail padrão (Outlook etc.) com campos pré-preenchidos.
 *
 * IMPORTANTE — texto limpo:
 * O "+" no corpo do e-mail acontece quando se usa URLSearchParams (que
 * codifica espaços como "+"). O protocolo mailto: exige encodeURIComponent,
 * que converte espaço em "%20" — o Outlook decodifica para espaço real.
 *
 * IMPORTANTE — anexo:
 * O protocolo mailto: NÃO suporta anexos por restrição de segurança dos
 * navegadores. O fluxo correto é: baixar o PDF localmente antes de abrir
 * o Outlook e instruir o operador a arrastar o arquivo na janela aberta.
 */
export interface EmailParams {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  body: string;
}

export const openEmailClient = ({ to, cc, subject, body }: EmailParams) => {
  const enc = encodeURIComponent;
  const params: string[] = [];
  if (cc?.length) params.push(`cc=${cc.map(enc).join(',')}`);
  params.push(`subject=${enc(subject)}`);
  params.push(`body=${enc(body)}`);
  const mailto = `mailto:${to.map(enc).join(',')}?${params.join('&')}`;
  // _self preserva o histórico e evita popup blocker
  window.location.href = mailto;
};

/** Cópia obrigatória em todos os envios */
export const CC_OBRIGATORIO = ['adm.matriz@topac.com.br', 'robson@topac.com.br'] as const;

/** Destinatários ASO/Agendamento — únicos para todas as unidades */
export const DESTINATARIOS_ASO = ['agendamento@ponteaereaseguranca.com.br'] as const;

/** Destinatários de Férias variam por unidade */
export const getDestinatariosFerias = (unidade: string): readonly string[] => {
  const u = (unidade || '').toUpperCase();
  if (u.includes('GOIÂNIA') || u.includes('GOIANIA')) {
    return ['requisicao@incocontabilidade.com.br'];
  }
  // Praia Grande, Matriz, LMT, Alqui, demais → AAT
  return [
    'marisa@aatconsultoria.com.br',
    'lucilene@aatconsultoria.com.br',
    'dp@aatconsultoria.com.br',
  ];
};

/** Mantido para retrocompatibilidade — não usar em novo código */
export const DESTINATARIOS = {
  ferias: getDestinatariosFerias(''),
  aso: DESTINATARIOS_ASO,
} as const;
