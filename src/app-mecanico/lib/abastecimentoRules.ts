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
const consistentPumpReading = (valor: number, litros: number, precoLitro: number) =>
  Math.abs(valor - litros * precoLitro) <= Math.max(0.25, valor * 0.005);

const labeledNumber = (text: string, labels: RegExp, maxDecimals: number) => {
  const match = text.match(new RegExp(`(?:${labels.source})[^\\d]{0,30}(\\d{1,6}(?:[.,]\\d{1,${maxDecimals}})?)`, 'i'));
  return parseNumber(match?.[1]);
};

const displayNumbersByVerticalOrder = (text: string) => String(text || '')
  .split(/\r?\n/)
  .map((line) => {
    const trimmed = line.trim();
    const matches = [...trimmed.matchAll(/\d{1,6}(?:[.,]\d{1,3})?/g)];
    if (matches.length !== 1) return null;
    const token = matches[0][0];
    const noise = trimmed
      .replace(token, '')
      .replace(/(?:r\$|litros?|lts?|pre[cç]o|total|valor|volume|unit[aá]rio|por|\/l)/gi, '')
      .replace(/[^a-z]/gi, '');
    if (noise.length > 3) return null;
    return parseNumber(token);
  })
  .filter(Number.isFinite);

export const parsePumpOcrText = (text: string): PumpReading => {
  const source = String(text || '').replace(/\s+/g, ' ');
  let valor = labeledNumber(source, /total(?:\s+a\s+pagar)?|valor(?:\s+total)?|r\$?/, 2);
  let litros = labeledNumber(source, /litros?|volume|quantidade/, 3);
  let precoLitro = labeledNumber(source, /pre[cç]o\s*(?:por\s*)?litro|pre[cç]o\s*\/\s*l|r\$?\s*\/\s*l|unit[aá]rio/, 3);
  const vertical = displayNumbersByVerticalOrder(text);

  if (vertical.length >= 3) {
    const [top, middle, bottom] = vertical.slice(-3);
    const orderedValues = {
      valor: top,
      litros: middle,
      precoLitro: bottom,
    };
    if (
      plausible(orderedValues.valor, 5, 10000)
      && plausible(orderedValues.litros, 1, 500)
      && plausible(orderedValues.precoLitro, 1.5, 30)
      && consistentPumpReading(orderedValues.valor, orderedValues.litros, orderedValues.precoLitro)
    ) {
      valor = orderedValues.valor;
      litros = orderedValues.litros;
      precoLitro = orderedValues.precoLitro;
    }
  }

  if (plausible(valor, 5, 10000) && plausible(litros, 1, 500) && !plausible(precoLitro, 1.5, 30)) {
    precoLitro = valor / litros;
  }
  if (!plausible(valor, 5, 10000) && plausible(litros, 1, 500) && plausible(precoLitro, 1.5, 30)) {
    valor = litros * precoLitro;
  }
  if (!plausible(litros, 1, 500) && plausible(valor, 5, 10000) && plausible(precoLitro, 1.5, 30)) {
    litros = valor / precoLitro;
  }

  const complete = plausible(valor, 5, 10000)
    && plausible(litros, 1, 500)
    && plausible(precoLitro, 1.5, 30)
    && consistentPumpReading(valor, litros, precoLitro);
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
  if (textReading.complete) return textReading;
  let valor = parseNumber(result?.valor);
  let litros = parseNumber(result?.litros);
  let precoLitro = parseNumber(result?.valor_por_litro);

  if (!plausible(valor, 5, 10000)) valor = textReading.valor;
  if (!plausible(litros, 1, 500)) litros = textReading.litros;
  if (!plausible(precoLitro, 1.5, 30)) precoLitro = textReading.precoLitro;

  if (plausible(valor, 5, 10000) && plausible(litros, 1, 500) && !plausible(precoLitro, 1.5, 30)) precoLitro = valor / litros;
  if (!plausible(valor, 5, 10000) && plausible(litros, 1, 500) && plausible(precoLitro, 1.5, 30)) valor = litros * precoLitro;
  if (!plausible(litros, 1, 500) && plausible(valor, 5, 10000) && plausible(precoLitro, 1.5, 30)) litros = valor / precoLitro;

  const complete = plausible(valor, 5, 10000)
    && plausible(litros, 1, 500)
    && plausible(precoLitro, 1.5, 30)
    && consistentPumpReading(valor, litros, precoLitro);
  return {
    valor: complete ? round(valor, 2) : 0,
    litros: complete ? round(litros, 3) : 0,
    precoLitro: complete ? round(precoLitro, 3) : 0,
    complete,
  };
};

export const parseOdometerOcrText = (text: string): number | null => {
  const source = String(text || '');
  const plausibleKm = (value: number) => value >= 1000 && value <= 9_999_999 && (value < 1900 || value > 2099);
  const integerKmPattern = String.raw`(?:\d{1,3}(?:[.,]\d{3}){1,2}|\d{4,7})`;
  const numberFollowedByKm = Array.from(
    source.matchAll(new RegExp(`\\b(${integerKmPattern})\\s*km\\b`, 'gi')),
    (match) => Number(match[1].replace(/\D/g, '')),
  ).filter(plausibleKm);
  if (numberFollowedByKm.length) return numberFollowedByKm.at(-1) ?? null;

  const numberNearOdometerLabel = Array.from(
    source.matchAll(new RegExp(`(?:km|od[oô]metro|hod[oô]metro)[^\\d]{0,20}(${integerKmPattern})`, 'gi')),
    (match) => Number(match[1].replace(/\D/g, '')),
  ).filter(plausibleKm);
  if (numberNearOdometerLabel.length) return numberNearOdometerLabel.at(-1) ?? null;

  const lowerDisplayCandidates = displayNumbersByVerticalOrder(source)
    .map((candidate) => Math.round(candidate))
    .filter(plausibleKm);
  if (lowerDisplayCandidates.length) return lowerDisplayCandidates.at(-1) ?? null;

  const candidates = Array.from(
    source.matchAll(new RegExp(`\\b${integerKmPattern}\\b`, 'g')),
    (match) => Number(match[0].replace(/\D/g, '')),
  ).filter(plausibleKm);
  return candidates.length ? Math.max(...candidates) : null;
};

export const normalizeOdometerOcrResult = (result: { km?: unknown; km_atual?: unknown; ocr_texto_bruto?: string } | null): number | null => {
  const direct = parseNumber(result?.km ?? result?.km_atual);
  const fromText = parseOdometerOcrText(result?.ocr_texto_bruto || '');
  if (fromText !== null) return fromText;
  return plausible(direct, 1000, 9_999_999) ? Math.round(direct) : null;
};
