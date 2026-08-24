import type { PayrollEmployeeMatch } from './payrollDocumentsV2';

const STOP_WORDS = new Set(['DE','DA','DO','DAS','DOS','E','DEL']);
const OCR_CHAR_MAP: Record<string,string> = { '0':'O', '1':'I', '5':'S', '8':'B' };

export const normalizePersonName = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[0158]/g, char => OCR_CHAR_MAP[char] || char)
  .replace(/[^A-Z ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const personNameTokens = (value: unknown) => normalizePersonName(value)
  .split(' ')
  .filter(token => token.length > 1 && !STOP_WORDS.has(token));

const levenshtein = (a: string, b: string) => {
  const rows = b.length + 1;
  const cols = a.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[rows - 1][cols - 1];
};

const tokenCompatible = (a: string, b: string) => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  const maxLen = Math.max(a.length, b.length);
  return maxLen >= 5 && levenshtein(a, b) <= (maxLen >= 9 ? 2 : 1);
};

export type NameMatchResult = {
  employee: PayrollEmployeeMatch | null;
  detectedName: string | null;
  candidates: Array<{ id: string; name: string; matchedTokens: number; totalTokens: number; exact: boolean }>;
  decision: 'AUTO_MATCH' | 'NAME_NOT_FOUND' | 'AMBIGUOUS_EMPLOYEE_MATCH';
  reason: string;
  nameScore: number;
};

const evaluateCandidate = (detectedName: string, employee: PayrollEmployeeMatch) => {
  const detected = normalizePersonName(detectedName);
  const target = normalizePersonName(employee.name);
  if (!detected || !target) return { employee, matchedTokens: 0, totalTokens: 0, exact: false, valid: false, score: 0 };
  if (detected === target) return { employee, matchedTokens: personNameTokens(target).length, totalTokens: personNameTokens(target).length, exact: true, valid: true, score: 1 };

  const sourceTokens = personNameTokens(detected);
  const targetTokens = personNameTokens(target);
  if (sourceTokens.length < 2 || targetTokens.length < 2) return { employee, matchedTokens: 0, totalTokens: targetTokens.length, exact: false, valid: false, score: 0 };

  let matched = 0;
  const used = new Set<number>();
  for (const token of sourceTokens) {
    const index = targetTokens.findIndex((targetToken, idx) => !used.has(idx) && tokenCompatible(token, targetToken));
    if (index >= 0) { used.add(index); matched += 1; }
  }

  const firstMatches = tokenCompatible(sourceTokens[0], targetTokens[0]);
  const lastMatches = tokenCompatible(sourceTokens[sourceTokens.length - 1], targetTokens[targetTokens.length - 1]);
  const required = Math.max(2, targetTokens.length - 1);
  const valid = firstMatches && lastMatches && matched >= required;
  const score = targetTokens.length ? matched / targetTokens.length : 0;
  return { employee, matchedTokens: matched, totalTokens: targetTokens.length, exact: false, valid, score };
};

export const matchEmployeeName = (detectedName: string | null | undefined, employees: PayrollEmployeeMatch[]): NameMatchResult => {
  const clean = normalizePersonName(detectedName);
  if (!clean) return { employee: null, detectedName: null, candidates: [], decision: 'NAME_NOT_FOUND', reason: 'Nenhum nome utilizável foi extraído.', nameScore: 0 };

  const evaluated = employees.map(employee => evaluateCandidate(clean, employee));
  const candidates = evaluated
    .filter(item => item.valid)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || b.matchedTokens - a.matchedTokens);

  const logCandidates = candidates.map(item => ({ id: item.employee.id, name: item.employee.name, matchedTokens: item.matchedTokens, totalTokens: item.totalTokens, exact: item.exact }));
  if (!candidates.length) return { employee: null, detectedName: clean, candidates: [], decision: 'NAME_NOT_FOUND', reason: 'Nenhum funcionário compatível dentro da empresa selecionada.', nameScore: 0 };

  const exact = candidates.filter(item => item.exact);
  if (exact.length === 1) return { employee: exact[0].employee, detectedName: clean, candidates: logCandidates, decision: 'AUTO_MATCH', reason: 'Nome completo normalizado é único na empresa selecionada.', nameScore: 1 };
  if (exact.length > 1) return { employee: null, detectedName: clean, candidates: logCandidates, decision: 'AMBIGUOUS_EMPLOYEE_MATCH', reason: 'Mais de um cadastro possui o mesmo nome normalizado.', nameScore: 1 };

  if (candidates.length === 1) return { employee: candidates[0].employee, detectedName: clean, candidates: logCandidates, decision: 'AUTO_MATCH', reason: 'Tokens principais, primeiro e último nome são compatíveis e há um único candidato na empresa.', nameScore: candidates[0].score };

  const first = candidates[0];
  const second = candidates[1];
  if (first.matchedTokens > second.matchedTokens || first.score > second.score) {
    return { employee: first.employee, detectedName: clean, candidates: logCandidates, decision: 'AUTO_MATCH', reason: 'Há um único melhor candidato contextual na empresa selecionada.', nameScore: first.score };
  }
  return { employee: null, detectedName: clean, candidates: logCandidates, decision: 'AMBIGUOUS_EMPLOYEE_MATCH', reason: 'Mais de um funcionário permanece compatível; revisão manual necessária.', nameScore: first.score };
};

export const extractReceiptNameCandidates = (text: string) => {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  const lines = source.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const labels = [
    'NOME\\s+DO\\s+RECEBEDOR', 'FAVORECIDO', 'BENEFICI[ÁA]RIO', 'PAGO\\s+PARA', 'TRANSFERIDO\\s+PARA',
    'DESTINAT[ÁA]RIO', 'RECEBEDOR', 'PIX\\s+PARA', 'NOME'
  ];
  const stop = /\b(?:CPF|CNPJ|CHAVE|INSTITUI[CÇ][AÃ]O|AG[ÊE]NCIA|CONTA|BANCO|VALOR|DATA|DOCUMENTO|AUTENTICA[CÇ][AÃ]O|FINALIDADE|TIPO\s+DE\s+CONTA)\b/i;
  const out: string[] = [];
  const push = (value?: string | null) => {
    const clean = String(value || '').replace(/^[:.\-\s]+/, '').replace(/\s+/g, ' ').trim();
    if (normalizePersonName(clean).length >= 5) out.push(clean);
  };

  for (let i = 0; i < lines.length; i += 1) {
    for (const label of labels) {
      const match = lines[i].match(new RegExp(`${label}\\.?\\s*[:\\-]?\\s*(.*)$`, 'i'));
      if (!match) continue;
      if (match[1]?.trim()) push(match[1].split(stop)[0]);
      else if (lines[i + 1]) push(lines[i + 1].split(stop)[0]);
    }
  }

  const flat = source.replace(/\s+/g, ' ');
  for (const label of labels) {
    const match = flat.match(new RegExp(`${label}\\.?\\s*[:\\-]?\\s*(.+?)(?=\\s+(?:CPF|CNPJ|CHAVE|INSTITUI[CÇ][AÃ]O|AG[ÊE]NCIA|CONTA|BANCO|VALOR|DATA|DOCUMENTO|AUTENTICA[CÇ][AÃ]O|FINALIDADE|TIPO\\s+DE\\s+CONTA|$))`, 'i'));
    if (match?.[1]) push(match[1]);
  }

  return Array.from(new Map(out.map(value => [normalizePersonName(value), value])).values());
};

const moneyNumber = (raw: string) => {
  const value = Number(String(raw || '').replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
};

export const extractSalaryAdvancePayableAmount = (text: string) => {
  const source = String(text || '').replace(/\u00a0/g, ' ');
  if (!/\bADTO\b|ADIANTAMENTO\s+CR[EÉ]DITO/i.test(source)) return null;
  const totalIndex = source.search(/TOTAL\s+VENCIMENTOS/i);
  const beforeTotal = totalIndex >= 0 ? source.slice(Math.max(0, totalIndex - 450), totalIndex) : source;
  const values = Array.from(beforeTotal.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g))
    .map(match => moneyNumber(match[1]))
    .filter((value): value is number => value != null && value > 100);
  return values.length ? Math.max(...values) : null;
};

export const amountCompatible = (a: unknown, b: unknown, tolerance = 0.05) => {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
};