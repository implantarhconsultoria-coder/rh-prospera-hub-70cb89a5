import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileUp,
  Layers,
  Package,
  Receipt,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

type ModuloDn4 = 'faturamento' | 'financeiro';
type EntidadeDn4 = 'cliente' | 'contrato' | 'locacao' | 'equipamento' | 'faturamento' | 'financeiro' | 'indefinido';
type EtapaDn4 = 'diagnostico' | 'mapeamento' | 'validacao' | 'pacote' | 'goLive';

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

type ArquivoDn4 = {
  nome: string;
  abas: number;
  linhas: number;
  tipo: string;
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

const resumoInicial = { cliente: 0, contrato: 0, locacao: 0, equipamento: 0, faturamento: 0, financeiro: 0, indefinido: 0 };

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
  if (dn4Rows.length) return { rows: dn4Rows, tipo: 'Relatório sintético DN4' };
  return { rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }), tipo: 'Tabela DN4' };
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

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (rows: LinhaDn4[], fileName: string) => {
  const head = ['tipo', 'confianca', 'cliente', 'documento', 'contrato', 'equipamento', 'periodo', 'valor', 'vencimento', 'status', 'pendencias', 'origem', 'aba'];
  const csv = [
    head.join(';'),
    ...rows.map(row => [
      entidadeLabel[row.entidade], row.confianca, row.cliente, row.documento, row.contrato, row.equipamento,
      row.periodo, row.valor, row.vencimento, row.status, row.pendencias.join(', '), row.origem, row.aba,
    ].map(csvEscape).join(';')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const Dn4ImportPanel: React.FC<{ modulo: ModuloDn4 }> = ({ modulo }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<LinhaDn4[]>([]);
  const [arquivos, setArquivos] = useState<ArquivoDn4[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<EntidadeDn4 | 'todos'>('todos');
  const [etapa, setEtapa] = useState<EtapaDn4>('diagnostico');
  const [aprovado, setAprovado] = useState(false);

  const resumo = useMemo(() => rows.reduce((acc, row) => ({ ...acc, [row.entidade]: acc[row.entidade] + 1 }), resumoInicial), [rows]);
  const pendentes = rows.filter(row => row.pendencias.length > 0).length;
  const validas = rows.filter(row => row.entidade !== 'indefinido' && row.pendencias.length === 0);
  const filtradas = selected === 'todos' ? rows : rows.filter(row => row.entidade === selected);
  const cobertura = rows.length ? Math.round((validas.length / rows.length) * 100) : 0;

  const etapas = [
    { key: 'diagnostico' as const, label: 'Diagnóstico', icon: FileUp, ok: rows.length > 0 },
    { key: 'mapeamento' as const, label: 'Mapeamento', icon: Settings2, ok: validas.length > 0 },
    { key: 'validacao' as const, label: 'Validação', icon: ShieldCheck, ok: rows.length > 0 && pendentes === 0 },
    { key: 'pacote' as const, label: 'Pacote TOPAC', icon: Database, ok: aprovado },
    { key: 'goLive' as const, label: 'Go-live', icon: CheckCircle2, ok: aprovado && pendentes === 0 },
  ];

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setLoading(true);
    setAprovado(false);
    const parsed: LinhaDn4[] = [];
    const nextArquivos: ArquivoDn4[] = [];
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
        let fileRows = 0;
        let detectedType = 'Tabela DN4';
        workbook.SheetNames.forEach(sheetName => {
          const result = sheetToRecords(XLSX, workbook.Sheets[sheetName], file.name, sheetName);
          if (result.tipo === 'Relatório sintético DN4') detectedType = result.tipo;
          fileRows += result.rows.length;
          result.rows.forEach((row, index) => parsed.push(classifyRow(row, file.name, sheetName, index + 1)));
        });
        nextArquivos.push({ nome: file.name, abas: workbook.SheetNames.length, linhas: fileRows, tipo: detectedType });
      } catch {
        failures.push(`${file.name}: não foi possível ler o arquivo.`);
      }
    }

    setRows(current => [...parsed, ...current]);
    setArquivos(current => [...nextArquivos, ...current]);
    setEtapa(parsed.length ? 'mapeamento' : 'diagnostico');
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (parsed.length) toast.success(`${parsed.length} registro(s) do DN4 preparados para implantação.`);
    if (failures.length) toast.warning(failures.join('\n'));
  };

  const limpar = () => {
    setRows([]);
    setArquivos([]);
    setSelected('todos');
    setEtapa('diagnostico');
    setAprovado(false);
  };

  const aprovarPacote = () => {
    if (!rows.length) return toast.error('Suba um arquivo DN4 primeiro.');
    if (pendentes > 0) {
      setEtapa('validacao');
      toast.warning('Ainda existem pendências. Exporte o pacote de revisão antes da importação definitiva.');
      return;
    }
    setAprovado(true);
    setEtapa('goLive');
    toast.success('Pacote DN4 liberado para go-live operacional.');
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
    <section className="card-premium p-5 space-y-5 border-primary/20">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <FileUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold font-display">Implantação DN4</h2>
            <span className="text-[10px] px-2 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-wide">{modulo}</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-success/15 text-success uppercase tracking-wide">rodando hoje</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Fluxo estruturado no padrão de implantação: diagnóstico do arquivo, mapeamento por módulo, validação de pendências, pacote TOPAC e go-live controlado.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" multiple accept=".csv,.xls,.xlsx" className="hidden" onChange={event => handleFiles(event.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={loading} className="btn-primary flex items-center gap-2 disabled:opacity-60">
            <FileSpreadsheet className="w-4 h-4" /> {loading ? 'Lendo arquivo...' : 'Subir Excel/CSV DN4'}
          </button>
          {rows.length > 0 && <button onClick={limpar} className="btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Limpar</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {etapas.map(item => (
          <button key={item.key} onClick={() => setEtapa(item.key)} className={`rounded-lg border p-3 text-left transition-colors ${etapa === item.key ? 'border-primary/50 bg-primary/10' : 'border-border bg-card/40 hover:bg-sidebar-accent/20'}`}>
            <div className="flex items-center justify-between gap-2">
              <item.icon className="w-4 h-4 text-primary" />
              {item.ok ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />}
            </div>
            <p className="text-xs font-bold mt-2">{item.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{item.ok ? 'Concluído' : 'Pendente'}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Arquivos</p>
          <p className="text-xl font-bold font-display">{arquivos.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Linhas DN4</p>
          <p className="text-xl font-bold font-display">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Cobertura</p>
          <p className="text-xl font-bold font-display text-primary">{cobertura}%</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Pendências</p>
          <p className={`text-xl font-bold font-display ${pendentes ? 'text-warning' : 'text-success'}`}>{pendentes}</p>
        </div>
      </div>

      {etapa === 'diagnostico' && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-primary" /><h3 className="font-semibold">Diagnóstico inicial</h3></div>
          {arquivos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Suba uma exportação do DN4 em Excel/CSV. O importador reconhece o relatório sintético de clientes e tabelas com Cliente, CNPJ, Contrato, Equipamento, Período, Valor, Vencimento, Nota/Fatura e Status.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="p-3 text-left">Arquivo</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-right">Abas</th><th className="p-3 text-right">Linhas</th></tr></thead>
                <tbody>{arquivos.map(file => <tr key={`${file.nome}-${file.abas}`} className="border-t border-border"><td className="p-3 font-medium">{file.nome}</td><td className="p-3 text-muted-foreground">{file.tipo}</td><td className="p-3 text-right">{file.abas}</td><td className="p-3 text-right">{file.linhas}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {etapa !== 'diagnostico' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            {cards.map(card => (
              <button key={card.key} onClick={() => { setSelected(card.key); setEtapa('mapeamento'); }} className={`rounded-lg border border-border p-3 text-left hover:bg-sidebar-accent/20 ${selected === card.key ? 'bg-primary/10 border-primary/40' : 'bg-card/40'}`}>
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
              {pendentes > 0 ? `${pendentes} linha(s) precisam de revisão antes da gravação definitiva.` : 'Pacote sem pendências críticas.'}
            </div>
          </div>

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
                {filtradas.slice(0, 120).map(row => (
                  <tr key={row.id} className="border-t border-border hover:bg-sidebar-accent/10">
                    <td className="p-3"><span className={`text-[10px] px-2 py-1 rounded-full ${entidadeClasses[row.entidade]}`}>{entidadeLabel[row.entidade]} · {row.confianca}%</span></td>
                    <td className="p-3"><div className="font-medium truncate max-w-[220px]">{row.cliente || '—'}</div><div className="text-xs text-muted-foreground">{row.documento || row.origem}</div></td>
                    <td className="p-3 font-mono text-xs">{row.contrato || '—'}</td>
                    <td className="p-3 truncate max-w-[180px]">{row.equipamento || '—'}</td>
                    <td className="p-3 text-muted-foreground">{row.periodo || '—'}</td>
                    <td className="p-3 text-right font-semibold">{row.valor || '—'}</td>
                    <td className="p-3 text-muted-foreground">{row.vencimento || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.pendencias.length ? row.pendencias.join(', ') : <span className="text-success">ok para pacote TOPAC</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtradas.length > 120 && <div className="p-3 text-xs text-muted-foreground border-t border-border">Mostrando 120 de {filtradas.length} linhas filtradas para manter a tela leve.</div>}
          </div>
        </>
      )}

      {(etapa === 'validacao' || etapa === 'pacote' || etapa === 'goLive') && (
        <div className="grid md:grid-cols-3 gap-3">
          <button onClick={() => downloadCsv(rows, `dn4-topac-pacote-${modulo}.csv`)} disabled={!rows.length} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" /> Exportar pacote completo</button>
          <button onClick={() => downloadCsv(rows.filter(row => row.pendencias.length > 0), `dn4-topac-pendencias-${modulo}.csv`)} disabled={!pendentes} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"><AlertTriangle className="w-4 h-4" /> Exportar pendências</button>
          <button onClick={aprovarPacote} disabled={!rows.length} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"><Database className="w-4 h-4" /> Liberar pacote TOPAC</button>
        </div>
      )}

      {aprovado && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Pacote DN4 aprovado para go-live operacional. Próxima etapa: gravar no banco definitivo após confirmação do modelo de dados.
        </div>
      )}
    </section>
  );
};

export default Dn4ImportPanel;
