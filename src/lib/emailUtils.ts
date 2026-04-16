/**
 * Abre o cliente de e-mail padrão (Outlook, etc.) com campos pré-preenchidos.
 */
export interface EmailParams {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}

export const openEmailClient = ({ to, cc, subject, body }: EmailParams) => {
  const params = new URLSearchParams();
  if (cc?.length) params.set('cc', cc.join(','));
  params.set('subject', subject);
  params.set('body', body);
  const mailto = `mailto:${to.join(',')}?${params.toString()}`;
  window.open(mailto, '_self');
};

/** Destinatários fixos por contexto */
export const DESTINATARIOS = {
  ferias: [
    'marisa@aatconsultoria.com.br',
    'lucilene@aatconsultoria.com.br',
    'dp@aatconsultoria.com.br',
  ],
  aso: ['agendamento@ponteaereaseguranca.com.br'],
} as const;

/** Cópia obrigatória em todos os envios */
export const CC_OBRIGATORIO = ['robson@topac.com.br'];
