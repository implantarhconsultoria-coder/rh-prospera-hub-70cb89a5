export type PumpReading = {
  valor: number;
  litros: number;
  precoLitro: number;
  complete: boolean;
};

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!raw) return NaN;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const plausible = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
const round = (value: number, digits: number) => Number(value.toFixed(digits));

const labeledNumber = (text: string, labels: RegExp, maxDecimals: number) => {
  const match = text.match(new RegExp(`(?:${labels.source})[^\\d]{0,30}(\\d{1,6}(?:[.,]\\d{1,${maxDecimals}})?)`, 'i'));
  return parseNumber(match?.[1]);
};

export const parsePumpOcrText = (text: string): PumpReading => {
  const source = String(text || '').replace(/\s+/g, ' ');
  let valor = labeledNumber(source, /total(?:\s+a\s+pagar)?|valor(?:\s+total)?|r\$?/, 2);
  let litros = labeledNumber(source, /litros?|volume|quantidade/, 3);
  let precoLitro = labeledNumber(source, /pre[cç]o\s*(?:por\s*)?litro|pre[cç]o\s*\/\s*l|r\$?\s*\/\s*l|unit[aá]rio/, 3);

  if (plausible(valor, 5, 10000) && plausible(litros, 1, 500) && !plausible(precoLitro, 1.5, 30)) {
    precoLitro = valor / litros;
  }
  if (!plausible(valor, 5, 10000) && plausible(litros, 1, 500) && plausible(precoLitro, 1.5, 30)) {
    valor = litros * precoLitro;
  }
  if (!plausible(litros, 1, 500) && plausible(valor, 5, 10000) && plausible(precoLitro, 1.5, 30)) {
    litros = valor / precoLitro;
  }

  const complete = plausible(valor, 5, 10000) && plausible(litros, 1, 500) && plausible(precoLitro, 1.5, 30);
  return {
    valor: complete ? round(valor, 2) : 0,
    litros: complete ? round(litros, 3) : 0,
    precoLitro: complete ? round(precoLitro, 3) : 0,
    complete,
  };
};

export const normalizePumpOcrResult = (result: {
  valor?: unknown;
  litros?: unknown;
  valor_por_litro?: unknown;
  ocr_texto_bruto?: string;
} | null): PumpReading => {
  const textReading = parsePumpOcrText(result?.ocr_texto_bruto || '');
  let valor = parseNumber(result?.valor);
  let litros = parseNumber(result?.litros);
  let precoLitro = parseNumber(result?.valor_por_litro);

  if (!plausible(valor, 5, 10000)) valor = textReading.valor;
  if (!plausible(litros, 1, 500)) litros = textReading.litros;
  if (!plausible(precoLitro, 1.5, 30)) precoLitro = textReading.precoLitro;

  if (plausible(valor, 5, 10000) && plausible(litros, 1, 500) && !plausible(precoLitro, 1.5, 30)) precoLitro = valor / litros;
  if (!plausible(valor, 5, 10000) && plausible(litros, 1, 500) && plausible(precoLitro, 1.5, 30)) valor = litros * precoLitro;
  if (!plausible(litros, 1, 500) && plausible(valor, 5, 10000) && plausible(precoLitro, 1.5, 30)) litros = valor / precoLitro;

  const complete = plausible(valor, 5, 10000) && plausible(litros, 1, 500) && plausible(precoLitro, 1.5, 30);
  return {
    valor: complete ? round(valor, 2) : 0,
    litros: complete ? round(litros, 3) : 0,
    precoLitro: complete ? round(precoLitro, 3) : 0,
    complete,
  };
};

export const parseOdometerOcrText = (text: string): number | null => {
  const source = String(text || '');
  const candidates = [
    ...Array.from(source.matchAll(/(?:km|od[oô]metro|hod[oô]metro)[^\d]{0,20}(\d{1,3}(?:[.,]\d{3}){1,2}|\d{4,7})/gi), (match) => Number(match[1].replace(/\D/g, ''))),
    ...Array.from(source.matchAll(/\b\d{1,3}(?:[.,]\d{3}){1,2}\b|\b\d{4,7}\b/g), (match) => Number(match[0].replace(/\D/g, ''))),
  ].filter((value) => value >= 1000 && value <= 9_999_999 && (value < 1900 || value > 2099));
  return candidates.length ? Math.max(...candidates) : null;
};

export const normalizeOdometerOcrResult = (result: { km?: unknown; km_atual?: unknown; ocr_texto_bruto?: string } | null): number | null => {
  const direct = parseNumber(result?.km ?? result?.km_atual);
  const fromText = parseOdometerOcrText(result?.ocr_texto_bruto || '');
  const candidates = [direct, fromText].filter((value): value is number => plausible(Number(value), 1000, 9_999_999));
  return candidates.length ? Math.round(Math.max(...candidates)) : null;
};
