export const ACESSO_EXTERNO_SESSAO_KEY = 'acesso_externo_sessao';
export const ACESSO_EXTERNO_ULTIMO_USUARIO_KEY = 'acesso_externo_ultimo_usuario';

export type PortalExterno = {
  acesso_id: string;
  modulo: string;
  perfil_acesso: string;
  empresa: string;
  filial: string;
  funcao: string;
};

export type SessaoAcessoExterno = {
  cpf_clean: string;
  nome: string;
  portais: PortalExterno[];
  ts: number;
  expira_em: number;
};

export type UltimoUsuarioExterno = {
  nome: string;
  cpf_clean: string;
  atualizado_em: number;
};

export const onlyDigits = (value: string) => String(value || '').replace(/\D/g, '');

export const maskEmail = (value: string) => {
  const email = String(value || '').trim().toLowerCase();
  const [name, domain] = email.split('@');
  if (!name || !domain) return '';

  const maskedName =
    name.length <= 2 ? `${name[0] || '*'}*` : `${name[0]}${'*'.repeat(Math.max(name.length - 2, 1))}${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
};

export const getGreeting = (date = new Date()) => {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
};

export const getNextLocalDayStartMs = (date = new Date()) => {
  const next = new Date(date);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
};

export const createExternalSession = (
  input: Omit<SessaoAcessoExterno, 'ts' | 'expira_em'>,
  now = new Date(),
): SessaoAcessoExterno => ({
  ...input,
  ts: now.getTime(),
  expira_em: getNextLocalDayStartMs(now),
});

export const isExternalSessionExpired = (session: SessaoAcessoExterno | null | undefined) =>
  !session || Number(session.expira_em || 0) <= Date.now();

export const saveExternalSession = (session: SessaoAcessoExterno) => {
  sessionStorage.setItem(ACESSO_EXTERNO_SESSAO_KEY, JSON.stringify(session));
};

export const readExternalSession = (): SessaoAcessoExterno | null => {
  try {
    const raw = sessionStorage.getItem(ACESSO_EXTERNO_SESSAO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessaoAcessoExterno;
    if (!parsed?.cpf_clean || !Array.isArray(parsed.portais)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearExternalSession = () => {
  sessionStorage.removeItem(ACESSO_EXTERNO_SESSAO_KEY);
  localStorage.removeItem('acesso_externo');
  localStorage.removeItem('app_mecanico_acesso_id');
};

export const saveLastExternalUser = (data: { nome: string; cpf_clean: string }) => {
  const payload: UltimoUsuarioExterno = {
    nome: data.nome,
    cpf_clean: onlyDigits(data.cpf_clean),
    atualizado_em: Date.now(),
  };
  localStorage.setItem(ACESSO_EXTERNO_ULTIMO_USUARIO_KEY, JSON.stringify(payload));
};

export const readLastExternalUser = (): UltimoUsuarioExterno | null => {
  try {
    const raw = localStorage.getItem(ACESSO_EXTERNO_ULTIMO_USUARIO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UltimoUsuarioExterno;
    if (!parsed?.nome || !parsed?.cpf_clean) return null;
    return parsed;
  } catch {
    return null;
  }
};
