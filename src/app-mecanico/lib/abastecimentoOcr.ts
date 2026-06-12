export type AbastecimentoOcrResult = {
  ok?: boolean;
  valor?: string | number;
  litros?: string | number;
  valor_por_litro?: string | number;
  km?: string | number;
  km_atual?: string | number;
};

const parseNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return NaN;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
};

const plausible = (value: number, kind: 'valor' | 'litros' | 'preco' | 'km') => {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (kind === 'valor') return value >= 5 && value <= 10000;
  if (kind === 'litros') return value >= 1 && value <= 500;
  if (kind === 'preco') return value >= 1.5 && value <= 30;
  return value >= 1000 && value <= 9999999;
};

export const normalizePumpOcrFields = (result: AbastecimentoOcrResult | null) => {
  let valor = parseNumber(result?.valor);
  let litros = parseNumber(result?.litros);
  let preco = parseNumber(result?.valor_por_litro);

  if (!plausible(preco, 'preco') && plausible(valor, 'valor') && plausible(litros, 'litros')) preco = valor / litros;
  if (!plausible(valor, 'valor') && plausible(litros, 'litros') && plausible(preco, 'preco')) valor = litros * preco;
  if (!plausible(litros, 'litros') && plausible(valor, 'valor') && plausible(preco, 'preco')) litros = valor / preco;

  return {
    valor: plausible(valor, 'valor') ? valor : null,
    litros: plausible(litros, 'litros') ? litros : null,
    precoLitro: plausible(preco, 'preco') ? preco : null,
  };
};

export const normalizeKmOcrField = (result: AbastecimentoOcrResult | null) => {
  const raw = result?.km ?? result?.km_atual;
  const km = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/\D/g, ''));
  return plausible(km, 'km') ? Math.round(km) : null;
};
