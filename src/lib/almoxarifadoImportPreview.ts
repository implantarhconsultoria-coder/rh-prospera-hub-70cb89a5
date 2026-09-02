import * as XLSX from 'xlsx';

export const ALMOXARIFADO_ABAS_OFICIAIS = [
  'Entrada', 'Saídas', 'Estoque', 'Codigos', 'Comprar', 'Consultar',
  'Ferramentas', 'Compras', 'Mecânicos Externo', 'Memorial de Cálculo',
] as const;

export type DivergenciaEstoque = {
  codigo: string;
  saldoInformado: number;
  saldoCalculado: number;
  divergencia: number;
};

export type ImportPreview = {
  arquivo: string;
  abasEncontradas: string[];
  abasAusentes: string[];
  produtos: number;
  entradas: number;
  saidas: number;
  codigosDuplicados: string[];
  registrosSemCodigo: number;
  formulasIgnoradas: number;
  errosRefIgnorados: number;
  divergencias: DivergenciaEstoque[];
  prontoParaConfirmacao: boolean;
};

const norm = (v: unknown) => String(v ?? '').trim();
const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = norm(v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const pick = (row: Record<string, unknown>, names: string[]) => {
  const entries = Object.entries(row);
  for (const wanted of names) {
    const found = entries.find(([k]) => k.trim().toLowerCase() === wanted.toLowerCase());
    if (found) return found[1];
  }
  return undefined;
};

const rows = (wb: XLSX.WorkBook, name: string) => {
  const ws = wb.Sheets[name];
  return ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true }) : [];
};

const countFormulaProblems = (wb: XLSX.WorkBook) => {
  let formulas = 0;
  let refs = 0;
  for (const ws of Object.values(wb.Sheets)) {
    for (const cell of Object.values(ws)) {
      if (!cell || typeof cell !== 'object') continue;
      const c = cell as XLSX.CellObject;
      if (c.f) formulas++;
      if (String(c.v ?? '').includes('#REF!') || String(c.f ?? '').includes('#REF!')) refs++;
    }
  }
  return { formulas, refs };
};

export async function analisarPlanilhaAlmoxarifado(file: File): Promise<ImportPreview> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array', cellFormula: true, cellDates: true });
  const abasEncontradas = wb.SheetNames.filter(n => ALMOXARIFADO_ABAS_OFICIAIS.includes(n as any));
  const abasAusentes = ALMOXARIFADO_ABAS_OFICIAIS.filter(n => !wb.SheetNames.includes(n));

  const estoqueRows = rows(wb, 'Estoque');
  const entradaRows = rows(wb, 'Entrada');
  const saidaRows = rows(wb, 'Saídas');

  const codigoDoEstoque = (r: Record<string, unknown>) => norm(pick(r, ['Cód. Topac', 'Cod. Topac', 'Código Topac', 'Codigo Topac', 'Código', 'Codigo']));
  const codigoMov = (r: Record<string, unknown>) => norm(pick(r, ['Cód. Topac', 'Cod. Topac', 'Código Topac', 'Codigo Topac', 'Código', 'Codigo']));

  const codigos = estoqueRows.map(codigoDoEstoque).filter(Boolean);
  const counts = new Map<string, number>();
  codigos.forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
  const codigosDuplicados = [...counts.entries()].filter(([, q]) => q > 1).map(([c]) => c).sort();
  const registrosSemCodigo = estoqueRows.filter(r => !codigoDoEstoque(r)).length;

  const ent = new Map<string, number>();
  for (const r of entradaRows) {
    const c = codigoMov(r); if (!c) continue;
    const q = num(pick(r, ['Quantidade', 'Qtd', 'Qnt']));
    ent.set(c, (ent.get(c) || 0) + q);
  }
  const sai = new Map<string, number>();
  for (const r of saidaRows) {
    const c = codigoMov(r); if (!c) continue;
    const q = num(pick(r, ['Quantidade', 'Qtd', 'Qnt']));
    sai.set(c, (sai.get(c) || 0) + q);
  }

  const divergencias: DivergenciaEstoque[] = [];
  for (const r of estoqueRows) {
    const codigo = codigoDoEstoque(r); if (!codigo) continue;
    const saldoInformado = num(pick(r, ['Saldo', 'Estoque', 'Quantidade', 'Qtd.']));
    const aumentar = num(pick(r, ['Auemntar', 'Aumentar']));
    const diminuir = num(pick(r, ['Diminuir']));
    const saldoCalculado = (ent.get(codigo) || 0) + aumentar - (sai.get(codigo) || 0) - diminuir;
    const diferenca = Number((saldoInformado - saldoCalculado).toFixed(6));
    if (Math.abs(diferenca) > 0.000001) divergencias.push({ codigo, saldoInformado, saldoCalculado, divergencia: diferenca });
  }

  const { formulas, refs } = countFormulaProblems(wb);
  const produtos = estoqueRows.filter(r => codigoDoEstoque(r) || norm(pick(r, ['Descrição', 'Descricao']))).length;
  const entradas = entradaRows.filter(r => codigoMov(r)).length;
  const saidas = saidaRows.filter(r => codigoMov(r)).length;

  return {
    arquivo: file.name,
    abasEncontradas,
    abasAusentes,
    produtos,
    entradas,
    saidas,
    codigosDuplicados,
    registrosSemCodigo,
    formulasIgnoradas: formulas,
    errosRefIgnorados: refs,
    divergencias,
    prontoParaConfirmacao: abasAusentes.length === 0 && codigosDuplicados.length === 0 && registrosSemCodigo === 0 && divergencias.length === 0,
  };
}

export function horarioAlmoxarifadoFechado(date: Date, hora = 17, minuto = 30): boolean {
  return date.getHours() * 60 + date.getMinutes() >= hora * 60 + minuto;
}
