import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSpreadsheet, FileUp, Layers, Package, Receipt, Users, X } from 'lucide-react';
import { toast } from 'sonner';

type ModuloDn4 = 'faturamento' | 'financeiro';
type EntidadeDn4 = 'cliente' | 'contrato' | 'locacao' | 'equipamento' | 'faturamento' | 'financeiro' | 'indefinido';

type LinhaDn4 = {
  id: string;
  origem: string;
  aba: string;
  entidade: EntidadeDn4;
  confianca: number;
  cliente: string;
  documento: string;
  contrato: string;
  equipamento: string;
  periodo: string;
  valor: string;
  vencimento: string;
  status: string;
  pendencias: string[];
  raw: Record<string, unknown>;
};

const entidadeLabel: Record<EntidadeDn4, string> = {
  cliente: 'Cliente',
  contrato: 'Contrato',
  locacao: 'Locação',
  equipamento: 'Equipamento',
  faturamento: 'Faturamento',
  financeiro: 'Financeiro',
  indefinido: 'Revisar',
};

const entidadeClasses: Record<EntidadeDn4, string> = {
  cliente: 'bg-sky-500/15 text-sky-500',
  contrato: 'bg-indigo-500/15 text-indigo-500',
  locacao: 'bg-emerald-500/15 text-emerald-500',
  equipamento: 'bg-amber-500/15 text-amber-500',
  faturamento: 'bg-primary/15 text-primary',
  financeiro: 'bg-cyan-500/15 text-cyan-500',
  indefinido: 'bg-destructive/15 text-destructive',
};

const alias: Record<string, string[]> = {
  cliente: ['cliente', 'razao social', 'razão social', 'nome cliente', 'nome', 'sacado', 'tomador', 'locatario', 'locatário'],
  documento: ['cnpj', 'cpf', 'cnpj cpf', 'cpf cnpj', 'documento', 'doc cliente'],
  contrato: ['contrato', 'numero contrato', 'n contrato', 'nº contrato', 'pedido', 'proposta', 'os'],
  equipamento: ['equipamento', 'ativo', 'patrimonio', 'patrimônio', 'serie', 'série', 'numero serie', 'modelo', 'item'],
  periodo: ['periodo', 'período', 'competencia', 'competência', 'data inicio', 'data início', 'data fim', 'dt inicio', 'dt fim'],
  valor: ['valor', 'total', 'valor total', 'valor locacao', 'valor locação', 'saldo', 'vlr total', 'preco', 'preço'],
  vencimento: ['vencimento', 'data vencimento', 'dt vencimento', 'vencto'],
  status: ['status', 'situacao', 'situação'],
  nota: ['nota', 'nf', 'nfe', 'fatura', 'titulo', 'título', 'duplicata', 'boleto'],
};

const normalize = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_./-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const isCode = (value: unknown) => /^\d+$/.test(digits(value)) && digits(value).length <= 8;

const documentRegex = /(?:\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/;

const splitNameAndDocument = (value: unknown) => {
  const text = clean(value).replace(/\n/g, ' ');
  const match = text.match(documentRegex);
  const documento = match ? match[0].trim() : '';
  const nome = documento ? text.replace(documento, '').replace(/\s*,\s*$/g, '').trim() : text;
  return { nome: nome.replace(/\s+/g, ' ').trim(), documento };
};

const findValue = (row: Record<string, unknown>, keys: string[]) => {
  const wanted = keys.map(normalize);
  const match = Object.entries(row).find(([key]) => wanted.includes(normalize(key)));
  return clean(match?.[1]);
};

const hasAnyHeader = (headers: string[], keys: string[]) => {
  const normalizedHeaders = headers.map(normalize);
  return keys.map(normalize).some(key => normalizedHeaders.some(header => header.includes(key) || key.includes(header)));
};

const isUsefulClientName = (value: string) => {
  const name = clean(value);
  if (!name || name === '.' || name === '-' || name === ', -') return false;
  if (/^dn4 tecnologia/i.test(name)) return false;
  return /[A-Za-zÀ-ÿ]{2}/.test(name);
};

const matrixToReportRows = (matrix: unknown[][], fileName: string, sheetName: string) => {
  const headerIndex = matrix.findIndex(row => {
    const first = normalize(row?.[0]);
    const second = normalize(row?.[1]);
    return first === 'codigo' && second === 'nome';
  });

  if (headerIndex < 0) return [] as Record<string, unknown>[];

  const records: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] || [];
    const codigo = clean(row[0]);
    const nomeRaw = clean(row[1]);

    if (!codigo && !nomeRaw) continue;
    if (/^dn4 tecnologia/i.test(codigo) || /^pagina/i.test(nomeRaw)) continue;

    if (isCode(codigo) && nomeRaw) {
      const { nome, documento } = splitNameAndDocument(nomeRaw);
      if (!isUsefulClientName(nome)) {
        current = null;
        continue;
      }
      current = {
        Código: digits(codigo),
        Nome: nome,
        Documento: documento,
        'Origem DN4': fileName,
        'Aba DN4': sheetName,
      };
      records.push(current);
      continue;
    }

    if (!codigo && nomeRaw && current) {
      const { nome, documento } = splitNameAndDocument(nomeRaw);
      if (isUsefulClientName(nome)) current.Nome = clean(`${current.Nome || ''} ${nome}`);
      if (documento && !current.Documento) current.Documento = documento;
    }
  }

  return records;
};

const sheetToRecords = (XLSX: any, sheet: any, fileName: string, sheetName: string) => {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  const dn4Rows = matrixToReportRows(matrix, fileName, sheetName);
  if (dn4Rows.length) return dn4Rows;
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
};

const classifyRow = (row: Record<string, unknown>, origem: string, aba: string, index: number): LinhaDn4 => {
  const headers = Object.keys(row);
  const cliente = findValue(row, alias.cliente);
  const documento = findValue(row, alias.documento);
  const contrato = findValue(row, alias.contrato);
  const equipamento = findValue(row, alias.equipamento);
  const periodo = findValue(row, alias.periodo);
  const valor = findValue(row, alias.valor);
  const vencimento = findValue(row, alias.vencimento);
  const status = findValue(row, alias.status);
  const hasNota = hasAnyHeader(headers, alias.nota);
  const hasValor = Boolean(valor) || hasAnyHeader(headers, alias.valor);
  const hasEquipamento = Boolean(equipamento) || hasAnyHeader(headers, alias.equipamento);
  const hasContrato = Boolean(contrato) || hasAnyHeader(headers, alias.contrato);
  const hasCliente = Boolean(cliente) || Boolean(documento) || hasAnyHeader(headers, alias.cliente) || hasAnyHeader(headers, alias.documento);
  const hasVencimento = Boolean(vencimento) || hasAnyHeader(headers, alias.vencimento);

  let entidade: EntidadeDn4 = 'indefinido';
  let confianca = 35;

  if (hasNota || (hasValor && hasVencimento)) {
    entidade = hasContrato || hasCliente ? 'faturamento' : 'financeiro';
    confianca = hasNota && hasValor ? 88 : 72;
  } else if (hasContrato && hasEquipamento) {
    entidade = 'locacao';
    confianca = 86;
  } else if (hasEquipamento) {
    entidade = 'equipamento';
    confianca = 78;
  } else if (hasContrato) {
    entidade = 'contrato';
    confianca = 74;
  } else if (hasCliente) {
    entidade = 'cliente';
    confianca = 92;
  }

  const pendencias: string[] = [];
  if (['contrato', 'locacao', 'faturamento'].includes(entidade) && !contrato) pendencias.push('sem número de contrato');
  if (['cliente', 'contrato', 'locacao', 'faturamento'].includes(entidade) && !cliente && !documento) pendencias.push('sem cliente/CNPJ');
  if (['locacao', 'equipamento'].includes(entidade) && !equipamento) pendencias.push('sem equipamento/ativo');
  if (['faturamento', 'financeiro'].includes(entidade) && !valor) pendencias.push('sem valor');
  if (documento && ![11, 14].includes(digits(documento).length)) pendencias.push('documento fora do padrão');
  if (entidade === 'indefinido') pendencias.push('tipo de linha não identificado');

  return {
    id: `${origem}-${aba}-${index}`,
    origem,
    aba,
    entidade,
    confianca,
    cliente,
    documento,
    contrato,
    equipamento,
    periodo,
    valor,
    vencimento,
    status,
    pendencias,
    raw: row,
  };
};

const resumoInicial = { cliente: 0, contrato: 0, locacao: 0, equipamento: 0, faturamento: 0, financeiro: 0, indefinido: 0 };

const Dn4ImportPanel: React.FC<{ modulo: ModuloDn4 }> = ({ modulo }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<LinhaDn4[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EntidadeDn4 | 'todos'>('todos');

  const resumo = useMemo(() => rows.reduce((acc, row) => ({ ...acc, [row.entidade]: acc[row.entidade] + 1 }), resumoInicial), [rows]);
  const pendentes = rows.filter(row => row.pendencias.length > 0).length;
  const filtradas = selected === 'todos' ? rows : rows.filter(row => row.entidade === selected);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    const parsed: LinhaDn4[] = [];
    const failures: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const ext = file.name.toLowerCase().split('.').pop();
        if (!['csv', 'xls', 'xlsx'].includes(ext || '')) {
          failures.push(`${file.name}: use Excel ou CSV para separação automática; PDF entra como revisão manual.`);
          continue;
        }
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        workbook.SheetNames.forEach(sheetName => {
          const sheetRows = sheetToRecords(XLSX, workbook.Sheets[sheetName], file.name, sheetName);
          sheetRows.forEach((row, index) => parsed.push(classifyRow(row, file.name, sheetName, index + 1)));
        });
      } catch {
        failures.push(`${file.name}: não foi possível ler o arquivo.`);
      }
    }

    setRows(current => [...parsed, ...current]);
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (parsed.length) toast.success(`${parsed.length} registro(s) do DN4 preparados para conferência.`);
    if (failures.length) toast.warning(failures.join('\n'));
  };

  const cards = [
    { key: 'cliente' as const, label: 'Clientes', icon: Users },
    { key: 'contrato' as const, label: 'Contratos', icon: ClipboardCheck },
    { key: 'locacao' as const, label: 'Locações', icon: Layers },
    { key: 'equipamento' as const, label: 'Equipamentos', icon: Package },
    { key: 'faturamento' as const, label: 'Faturamento', icon: Receipt },
    { key: 'financeiro' as const, label: 'Financeiro', icon: FileSpreadsheet },
    { key: 'indefinido' as const, label: 'Revisar', icon: AlertTriangle },
  ];

  return (
    <section className="card-premium p-5 space-y-4 border-primary/20">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold font-display">Central DN4</h2>
            <span className="text-[10px] px-2 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-wide">{modulo}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Importe planilhas/CSV do DN4 e confira como a TOPAC separa cada linha entre cliente, contrato, locação, equipamento, faturamento e financeiro antes de gravar dados definitivos.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" multiple accept=".csv,.xls,.xlsx" className="hidden" onChange={event => handleFiles(event.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={loading} className="btn-primary flex items-center gap-2 disabled:opacity-60">
            <FileSpreadsheet className="w-4 h-4" /> {loading ? 'Lendo arquivo...' : 'Selecionar Excel/CSV'}
          </button>
          {rows.length > 0 && <button onClick={() => setRows([])} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Limpar prévia</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        {cards.map(card => (
          <button key={card.key} onClick={() => setSelected(card.key)} className={`rounded-lg border border-border p-3 text-left hover:bg-sidebar-accent/20 ${selected === card.key ? 'bg-primary/10 border-primary/40' : 'bg-card/40'}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{card.label}</span>
              <card.icon className="w-4 h-4 text-primary opacity-60" />
            </div>
            <p className="text-xl font-bold font-display mt-1">{resumo[card.key]}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-muted/30 p-3">
        <button onClick={() => setSelected('todos')} className={`text-xs px-3 py-1.5 rounded-full ${selected === 'todos' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>Todos ({rows.length})</button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {pendentes > 0 ? <AlertTriangle className="w-4 h-4 text-warning" /> : <CheckCircle2 className="w-4 h-4 text-success" />}
          {rows.length === 0 ? 'Aguardando arquivo do DN4.' : `${pendentes} linha(s) precisam de revisão antes da gravação.`}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Envie uma exportação do DN4. O ideal é Excel/CSV com colunas como Cliente, CNPJ, Contrato, Equipamento, Período, Valor, Vencimento, Nota/Fatura e Status.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Tipo</th>
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-left">Contrato</th>
                <th className="p-3 text-left">Equipamento</th>
                <th className="p-3 text-left">Período</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-left">Vencimento</th>
                <th className="p-3 text-left">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 80).map(row => (
                <tr key={row.id} className="border-t border-border hover:bg-sidebar-accent/10">
                  <td className="p-3"><span className={`text-[10px] px-2 py-1 rounded-full ${entidadeClasses[row.entidade]}`}>{entidadeLabel[row.entidade]} · {row.confianca}%</span></td>
                  <td className="p-3"><div className="font-medium truncate max-w-[220px]">{row.cliente || '—'}</div><div className="text-xs text-muted-foreground">{row.documento || row.origem}</div></td>
                  <td className="p-3 font-mono text-xs">{row.contrato || '—'}</td>
                  <td className="p-3 truncate max-w-[180px]">{row.equipamento || '—'}</td>
                  <td className="p-3 text-muted-foreground">{row.periodo || '—'}</td>
                  <td className="p-3 text-right font-semibold">{row.valor || '—'}</td>
                  <td className="p-3 text-muted-foreground">{row.vencimento || '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{row.pendencias.length ? row.pendencias.join(', ') : <span className="text-success">ok para pré-mapeamento</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length > 80 && <div className="p-3 text-xs text-muted-foreground border-t border-border">Mostrando 80 de {filtradas.length} linhas filtradas para manter a tela leve.</div>}
        </div>
      )}
    </section>
  );
};

export default Dn4ImportPanel;
