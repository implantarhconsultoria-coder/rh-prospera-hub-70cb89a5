export const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatarAgoraBrasil = (): string => {
  return dateTimeFormatter.format(new Date()).replace(',', '');
};

export const formatarDataHoraBrasil = (data?: string | null, hora?: string | null): string => {
  if (!data) return '-';

  const [ano, mes, dia] = String(data).slice(0, 10).split('-');
  if (!ano || !mes || !dia) {
    return [data, hora ? String(hora).slice(0, 5) : null].filter(Boolean).join(' ');
  }

  const horaCurta = hora ? String(hora).slice(0, 5) : '';
  return horaCurta ? `${dia}/${mes}/${ano} ${horaCurta}` : `${dia}/${mes}/${ano}`;
};
