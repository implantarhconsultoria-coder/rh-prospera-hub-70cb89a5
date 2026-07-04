import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Database,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileUp,
  Layers,
  Package,
  Receipt,
  Save,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type ModuloDn4 = 'faturamento' | 'financeiro';
type EntidadeDn4 = 'cliente' | 'contrato' | 'locacao' | 'equipamento' | 'faturamento' | 'financeiro' | 'indefinido';
type EtapaDn4 = 'diagnostico' | 'mapeamento' | 'validacao' | 'pacote' | 'goLive';

type LinhaDn4 = {
  id: string;
  origem: string;
  aba: string;
  entidade: EntidadeDn4;
  confianca: number;
  destinoTopac: string;
  cliente: string;
  documento: string;
  contrato: string;
  equipamento: string;
  periodo: string;
  dataEmissao: string;
  valor: string;
  vencimento: string;
  status: string;
  nota: string;
  pendencias: string[];
  raw: Record<string, unknown>;
};

type ArquivoDn4 = {
  nome: string;
  abas: number;
  linhas: number;
  tipo: string;
};

type PacoteImplantacao = {
  id: string;
  criadoEm: string;
  modulo: ModuloDn4;
  total: number;
  validas: number;
  pendentes: number;
  cobertura: number;
  arquivos: ArquivoDn4[];
};

type ImplantacaoErro = {
  linha: string;
  tipo: string;
  mensagem: string;
};

type ResultadoImplantacao = {
  clientesCriados: number;
  contratosCriados: number;
  faturasCriadas: number;
  titulosReceberCriados: number;
  linhasIgnoradas: number;
  erros: ImplantacaoErro[];
  iniciadoEm?: string;
  finalizadoEm?: string;
};

const STORAGE_KEY = 'topac:dn4:pacotes-implantacao';

const resultadoInicial: ResultadoImplantacao = {
  clientesCriados: 0,
  contratosCriados: 0,
  faturasCriadas: 0,
  titulosReceberCriados: 0,
  linhasIgnoradas: 0,
  erros: [],
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

const destinoTopac: Record<EntidadeDn4, string> = {
  cliente: 'clientes_fat',
  contrato: 'contratos',
  locacao: 'contrato_equipamentos',
  equipamento: 'equipamentos/ativos',
  faturamento: 'faturas',
  financeiro: 'titulos_receber/titulos_pagar',
  indefinido: 'faturamento_pendencias',
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
  cliente: ['cliente', 'razao social', 'razão social', 'nome cliente', 'nome', 'sacado', 'tomador', 'locatario', 'locatário', 'empresa', 'fornecedor'],
  documento: ['cnpj', 'cpf', 'cnpj cpf', 'cpf cnpj', 'documento', 'doc cliente', 'inscricao', 'inscrição'],
  contrato: ['contrato', 'numero contrato', 'n contrato', 'nº contrato', 'pedido', 'proposta', 'os', 'locacao', 'locação'],
  equipamento: ['equipamento', 'ativo', 'patrimonio', 'patrimônio', 'serie', 'série', 'numero serie', 'modelo', 'item', 'produto', 'maquina', 'máquina'],
  periodo: ['periodo', 'período', 'competencia', 'competência', 'data inicio', 'data início', 'data fim', 'dt inicio', 'dt fim', 'referencia', 'referência'],
  dataEmissao: ['emissao', 'emissão', 'data emissao', 'data emissão', 'dt emissao', 'dt emissão', 'data documento'],
  valor: ['valor', 'total', 'valor total', 'valor locacao', 'valor locação', 'saldo', 'vlr total', 'preco', 'preço', 'liquido', 'líquido', 'bruto'],
  vencimento: ['vencimento', 'data vencimento', 'dt vencimento', 'vencto', 'vcto'],
  status: ['status', 'situacao', 'situação', 'estado'],
  nota: ['nota', 'nf', 'nfe', 'fatura', 'titulo', 'título', 'duplicata', 'boleto', 'documento financeiro'],
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
  const match = Object.entries(row).find(([key]) => wanted.some(aliasKey => normalize(key).includes(aliasKey) || aliasKey.includes(normalize(key))));
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
  const dataEmissao = findValue(row, alias.dataEmissao);
  const valor = findValue(row, alias.valor);
  const vencimento = findValue(row, alias.vencimento);
  const status = findValue(row, alias.status);
  const nota = findValue(row, alias.nota);
  const hasNota = Boolean(nota) || hasAnyHeader(headers, alias.nota);
  const hasValor = Boolean(valor) || hasAnyHeader(headers, alias.valor);
  const hasEquipamento = Boolean(equipamento) || hasAnyHeader(headers, alias.equipamento);
  const hasContrato = Boolean(contrato) || hasAnyHeader(headers, alias.contrato);
  const hasCliente = Boolean(cliente) || Boolean(documento) || hasAnyHeader(headers, alias.cliente) || hasAnyHeader(headers, alias.documento);
  const hasVencimento = Boolean(vencimento) || hasAnyHeader(headers, alias.vencimento);
  const hasFinanceiro = hasNota || hasVencimento || hasAnyHeader(headers, ['receber', 'pagar', 'baixa', 'pagamento', 'recebimento']);

  let entidade: EntidadeDn4 = 'indefinido';
  let confianca = 35;

  if (hasFinanceiro && hasValor) {
    entidade = hasContrato || hasCliente || hasNota ? 'faturamento' : 'financeiro';
    confianca = hasNota && hasValor ? 90 : 76;
  } else if (hasContrato && hasEquipamento) {
    entidade = 'locacao';
    confianca = 88;
  } else if (hasEquipamento) {
    entidade = 'equipamento';
    confianca = 80;
  } else if (hasContrato) {
    entidade = 'contrato';
    confianca = 76;
  } else if (hasCliente) {
    entidade = 'cliente';
    confianca = 92;
  }

  const pendencias: string[] = [];
  if (['contrato', 'locacao', 'faturamento'].includes(entidade) && !contrato) pendencias.push('sem número de contrato');
  if (['cliente', 'contrato', 'locacao', 'faturamento'].includes(entidade) && !cliente && !documento) pendencias.push('sem cliente/CNPJ');
  if (['locacao', 'equipamento'].includes(entidade) && !equipamento) pendencias.push('sem equipamento/ativo');
  if (['faturamento', 'financeiro'].includes(entidade) && !valor) pendencias.push('sem valor');
  if (['faturamento', 'financeiro'].includes(entidade) && !vencimento && !dataEmissao) pendencias.push('sem data financeira');
  if (documento && ![11, 14].includes(digits(documento).length)) pendencias.push('documento fora do padrão');
  if (entidade === 'indefinido') pendencias.push('tipo de linha não identificado');

  return {
    id: `${origem}-${aba}-${index}`,
    origem,
    aba,
    entidade,
    confianca,
    destinoTopac: destinoTopac[entidade],
    cliente,
    documento,
    contrato,
    equipamento,
    periodo,
    dataEmissao,
    valor,
    vencimento,
    status,
    nota,
    pendencias,
    raw: row,
  };
};

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (rows: LinhaDn4[], fileName: string) => {
  const head = ['destino_topac', 'tipo', 'confianca', 'cliente', 'documento', 'contrato', 'equipamento', 'periodo', 'emissao', 'valor', 'vencimento', 'nota_titulo', 'status', 'pendencias', 'origem', 'aba'];
  const csv = [
    head.join(';'),
    ...rows.map(row => [
      row.destinoTopac, entidadeLabel[row.entidade], row.confianca, row.cliente, row.documento, row.contrato, row.equipamento,
      row.periodo, row.dataEmissao, row.valor, row.vencimento, row.nota, row.status, row.pendencias.join(', '), row.origem, row.aba,
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

const loadPacotes = (): PacoteImplantacao[] => {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const savePacotes = (pacotes: PacoteImplantacao[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pacotes.slice(0, 20)));
};

const parseMoney = (value: unknown) => {
  const text = clean(value);
  if (!text) return 0;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: unknown) => {
  const text = clean(value);
  if (!text) return new Date().toISOString().slice(0, 10);
  const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
};

const competenciaFrom = (row: LinhaDn4) => {
  const base = parseDate(row.periodo || row.dataEmissao || row.vencimento);
  return base.slice(0, 7);
};

const numeroFatura = (row: LinhaDn4) => clean(row.nota) || `DN4-${clean(row.contrato)}-${competenciaFrom(row)}`;

const Dn4ImportPanel: React.FC<{ modulo: ModuloDn4 }> = ({ modulo }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<LinhaDn4[]>([]);
  const [arquivos, setArquivos] = useState<ArquivoDn4[]>([]);
  const [loading, setLoading] = useState(false);
  const [implantando, setImplantando] = useState(false);
  const [resultadoImplantacao, setResultadoImplantacao] = useState<ResultadoImplantacao | null>(null);
  const [selected, setSelected] = useState<EntidadeDn4 | 'todos'>('todos');
  const [etapa, setEtapa] = useState<EtapaDn4>('diagnostico');
  const [aprovado, setAprovado] = useState(false);
  const [pacotes, setPacotes] = useState<PacoteImplantacao[]>([]);

  useEffect(() => {
    setPacotes(loadPacotes().filter(pacote => pacote.modulo === modulo));
  }, [modulo]);

  const resumo = useMemo(() => rows.reduce((acc, row) => ({ ...acc, [row.entidade]: acc[row.entidade] + 1 }), resumoInicial), [rows]);
  const pendentes = rows.filter(row => row.pendencias.length > 0).length;
  const validas = rows.filter(row => row.entidade !== 'indefinido' && row.pendencias.length === 0);
  const filtradas = selected === 'todos' ? rows : rows.filter(row => row.entidade === selected);
  const cobertura = rows.length ? Math.round((validas.length / rows.length) * 100) : 0;

  const etapas = [
    { key: 'diagnostico' as const, label: 'Diagnóstico', icon: FileUp, ok: rows.length > 0 },
    { key: 'mapeamento' as const, label: 'Mapeamento', icon: Settings2, ok: validas.length > 0 },
    { key: 'validacao' as const, label: 'Validação', icon: ShieldCheck, ok: rows.length > 0 && pendentes === 0 },
    { key: 'pacote' as const, label: 'Pacote TOPAC', icon: Database, ok: aprovado || pacotes.length > 0 || Boolean(resultadoImplantacao?.finalizadoEm) },
    { key: 'goLive' as const, label: 'Go-live', icon: CheckCircle2, ok: aprovado && pendentes === 0 && !resultadoImplantacao?.erros.length },
  ];

  const ingestRows = (parsed: LinhaDn4[], nextArquivos: ArquivoDn4[]) => {
    setRows(current => [...parsed, ...current]);
    setArquivos(current => [...nextArquivos, ...current]);
    setResultadoImplantacao(null);
    setEtapa(parsed.length ? 'mapeamento' : 'diagnostico');
    if (parsed.length) toast.success(`${parsed.length} registro(s) do DN4 preparados para implantação.`);
  };

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

    ingestRows(parsed, nextArquivos);
    setLoading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (failures.length) toast.warning(failures.join('\n'));
  };

  const puxarConectorDn4 = async () => {
    const env = import.meta.env as Record<string, string | undefined>;
    const baseUrl = env.VITE_DN4_API_URL;
    const token = env.VITE_DN4_API_TOKEN;
    if (!baseUrl || !token) {
      toast.warning('Conector DN4 preparado. Configure VITE_DN4_API_URL e VITE_DN4_API_TOKEN para puxada automática; enquanto isso use os arquivos exportados do DN4.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/exportacao-topac?modulo=${modulo}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Falha no conector DN4');
      const payload = await response.json();
      const registros = Array.isArray(payload?.registros) ? payload.registros : [];
      const parsed = registros.map((row: Record<string, unknown>, index: number) => classifyRow(row, 'Conector DN4', payload?.modulo || 'API', index + 1));
      ingestRows(parsed, [{ nome: 'Conector DN4', abas: 1, linhas: parsed.length, tipo: 'API DN4' }]);
    } catch {
      toast.error('Não foi possível puxar pelo conector DN4. Confira URL, token e liberação de acesso/CORS.');
    } finally {
      setLoading(false);
    }
  };

  const limpar = () => {
    setRows([]);
    setArquivos([]);
    setSelected('todos');
    setEtapa('diagnostico');
    setAprovado(false);
    setResultadoImplantacao(null);
  };

  const buscarEmpresaPadrao = async () => {
    const { data, error } = await supabase.from('empresas').select('id').eq('status', 'ativo').limit(1).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
    const fallback = await supabase.from('empresas').select('id').limit(1).maybeSingle();
    if (fallback.error) throw fallback.error;
    if (!fallback.data?.id) throw new Error('Nenhuma empresa cadastrada para vincular contratos, faturas e títulos.');
    return fallback.data.id;
  };

  const implantarNoBanco = async () => {
    if (!rows.length) return toast.error('Suba um arquivo DN4 primeiro.');
    const resultado: ResultadoImplantacao = {
      ...resultadoInicial,
      erros: [],
      iniciadoEm: new Date().toISOString(),
    };

    if (!validas.length) {
      setResultadoImplantacao({ ...resultado, linhasIgnoradas: rows.length, finalizadoEm: new Date().toISOString() });
      return toast.warning('Nenhuma linha válida para implantar.');
    }

    setImplantando(true);
    setEtapa('pacote');

    try {
      const empresaId = await buscarEmpresaPadrao();
      const [{ data: clientesData, error: clientesError }, { data: contratosData, error: contratosError }, { data: faturasData, error: faturasError }, { data: titulosData, error: titulosError }] = await Promise.all([
        supabase.from('clientes_fat').select('id, cnpj_cpf, razao_social'),
        supabase.from('contratos').select('id, numero, cliente_id, empresa_id'),
        supabase.from('faturas').select('id, numero'),
        supabase.from('titulos_receber').select('id, numero'),
      ]);

      if (clientesError) throw clientesError;
      if (contratosError) throw contratosError;
      if (faturasError) throw faturasError;
      if (titulosError) throw titulosError;

      const clientesPorDoc = new Map((clientesData || []).filter((c: any) => digits(c.cnpj_cpf)).map((c: any) => [digits(c.cnpj_cpf), c]));
      const clientesPorNome = new Map((clientesData || []).map((c: any) => [normalize(c.razao_social), c]));
      const contratosPorNumero = new Map((contratosData || []).map((c: any) => [normalize(c.numero), c]));
      const faturasPorNumero = new Map((faturasData || []).map((f: any) => [normalize(f.numero), f]));
      const titulosPorNumero = new Map((titulosData || []).map((t: any) => [normalize(t.numero), t]));

      const garantirCliente = async (row: LinhaDn4) => {
        const documentoLimpo = digits(row.documento);
        const nome = clean(row.cliente) || `Cliente DN4 ${documentoLimpo || row.id}`;
        const existente = documentoLimpo ? clientesPorDoc.get(documentoLimpo) : clientesPorNome.get(normalize(nome));
        if (existente) return existente;

        const { data, error } = await supabase.from('clientes_fat').insert({
          razao_social: nome,
          nome_fantasia: nome,
          cnpj_cpf: documentoLimpo || null,
          status: 'ativo',
          observacoes: `Importado do DN4: ${row.origem} / ${row.aba}`,
        }).select('id, cnpj_cpf, razao_social').single();

        if (error) throw error;
        clientesPorNome.set(normalize(data.razao_social), data);
        if (digits(data.cnpj_cpf)) clientesPorDoc.set(digits(data.cnpj_cpf), data);
        resultado.clientesCriados += 1;
        return data;
      };

      const garantirContrato = async (row: LinhaDn4, clienteId: string) => {
        const numero = clean(row.contrato);
        if (!numero) throw new Error('Contrato sem número.');
        const existente = contratosPorNumero.get(normalize(numero));
        if (existente) return existente;

        const vencimento = parseDate(row.vencimento || row.dataEmissao);
        const { data, error } = await supabase.from('contratos').insert({
          numero,
          cliente_id: clienteId,
          empresa_id: empresaId,
          data_inicio: parseDate(row.periodo || row.dataEmissao),
          dia_vencimento: Number(vencimento.slice(8, 10)) || null,
          valor_mensal: parseMoney(row.valor),
          regra_faturamento: 'periodo_locacao',
          periodicidade: 'mensal',
          tipo: row.entidade === 'locacao' ? 'locacao' : 'contrato',
          status: 'ativo',
          observacoes: `Importado do DN4: ${row.origem} / ${row.aba}`,
        }).select('id, numero, cliente_id, empresa_id').single();

        if (error) throw error;
        contratosPorNumero.set(normalize(data.numero), data);
        resultado.contratosCriados += 1;
        return data;
      };

      for (const row of rows) {
        if (row.entidade === 'indefinido' || row.pendencias.length > 0 || !['cliente', 'contrato', 'locacao', 'faturamento'].includes(row.entidade)) {
          resultado.linhasIgnoradas += 1;
          continue;
        }

        try {
          const cliente = await garantirCliente(row);

          if (row.entidade === 'cliente') continue;

          const contrato = await garantirContrato(row, cliente.id);

          if (row.entidade !== 'faturamento') continue;

          const numero = numeroFatura(row);
          if (faturasPorNumero.has(normalize(numero))) {
            resultado.linhasIgnoradas += 1;
            continue;
          }

          const valor = parseMoney(row.valor);
          const dataEmissao = parseDate(row.dataEmissao || row.vencimento);
          const dataVencimento = parseDate(row.vencimento || row.dataEmissao);
          const competencia = competenciaFrom(row);

          const { data: fatura, error: faturaError } = await supabase.from('faturas').insert({
            numero,
            cliente_id: cliente.id,
            contrato_id: contrato.id,
            empresa_id: contrato.empresa_id || empresaId,
            competencia,
            data_emissao: dataEmissao,
            data_vencimento: dataVencimento,
            subtotal: valor,
            total: valor,
            status: normalize(row.status).includes('pag') ? 'paga' : 'em_aberto',
            observacoes: `Importada do DN4: ${row.origem} / ${row.aba}`,
          }).select('id, numero').single();

          if (faturaError) throw faturaError;
          faturasPorNumero.set(normalize(fatura.numero), fatura);
          resultado.faturasCriadas += 1;

          if (!titulosPorNumero.has(normalize(numero))) {
            const { data: titulo, error: tituloError } = await supabase.from('titulos_receber').insert({
              numero,
              cliente_id: cliente.id,
              contrato_id: contrato.id,
              fatura_id: fatura.id,
              empresa_id: contrato.empresa_id || empresaId,
              competencia,
              data_emissao: dataEmissao,
              data_vencimento: dataVencimento,
              valor_original: valor,
              saldo: valor,
              status: normalize(row.status).includes('pag') ? 'pago' : 'em_aberto',
              observacoes: `Gerado automaticamente pela importação DN4 da fatura ${numero}`,
            }).select('id, numero').single();

            if (tituloError) throw tituloError;
            titulosPorNumero.set(normalize(titulo.numero), titulo);
            resultado.titulosReceberCriados += 1;
          }
        } catch (error) {
          resultado.erros.push({
            linha: row.id,
            tipo: entidadeLabel[row.entidade],
            mensagem: error instanceof Error ? error.message : 'Erro não identificado na implantação.',
          });
        }
      }

      resultado.finalizadoEm = new Date().toISOString();
      setResultadoImplantacao(resultado);
      setAprovado(resultado.erros.length === 0);
      setEtapa('goLive');

      if (resultado.erros.length) {
        toast.warning(`Implantação concluída com ${resultado.erros.length} erro(s) por linha.`);
      } else {
        toast.success('Implantação DN4 concluída no banco TOPAC.');
      }
    } catch (error) {
      resultado.finalizadoEm = new Date().toISOString();
      resultado.erros.push({
        linha: 'implantacao',
        tipo: 'Geral',
        mensagem: error instanceof Error ? error.message : 'Erro geral ao implantar DN4.',
      });
      setResultadoImplantacao(resultado);
      toast.error('Falha ao iniciar implantação DN4 no banco TOPAC.');
    } finally {
      setImplantando(false);
    }
  };

  const registrarPacote = () => {
    if (!rows.length) return toast.error('Suba um arquivo DN4 primeiro.');
    if (pendentes > 0) {
      setEtapa('validacao');
      toast.warning('Ainda existem pendências. Exporte e corrija antes da implantação definitiva.');
      return;
    }

    const pacote: PacoteImplantacao = {
      id: `DN4-${Date.now()}`,
      criadoEm: new Date().toISOString(),
      modulo,
      total: rows.length,
      validas: validas.length,
      pendentes,
      cobertura,
      arquivos,
    };
    const todos = [pacote, ...loadPacotes().filter(item => item.id !== pacote.id)];
    savePacotes(todos);
    setPacotes(todos.filter(item => item.modulo === modulo));
    setAprovado(true);
    setEtapa('goLive');
    toast.success('Pacote DN4 registrado no TOPAC para implantação.');
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

  const resultadoCards = resultadoImplantacao ? [
    { label: 'Clientes criados', value: resultadoImplantacao.clientesCriados },
    { label: 'Contratos criados', value: resultadoImplantacao.contratosCriados },
    { label: 'Faturas criadas', value: resultadoImplantacao.faturasCriadas },
    { label: 'Títulos a receber criados', value: resultadoImplantacao.titulosReceberCriados },
    { label: 'Linhas ignoradas', value: resultadoImplantacao.linhasIgnoradas },
    { label: 'Erros', value: resultadoImplantacao.erros.length },
  ] : [];

  return (
    <section className="card-premium p-5 space-y-5 border-primary/20">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <FileUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold font-display">Migração completa DN4</h2>
            <span className="text-[10px] px-2 py-1 rounded-full bg-primary/15 text-primary uppercase tracking-wide">{modulo}</span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-success/15 text-success uppercase tracking-wide">TOPAC pronto</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Puxe por conector quando houver API liberada ou suba as exportações DN4. O TOPAC separa clientes, contratos, locações, equipamentos, faturas e financeiro para implantação validável.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" multiple accept=".csv,.xls,.xlsx" className="hidden" onChange={event => handleFiles(event.target.files)} />
          <button onClick={puxarConectorDn4} disabled={loading || implantando} className="btn-secondary flex items-center gap-2 disabled:opacity-60">
            <Cloud className="w-4 h-4" /> Puxar DN4
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={loading || implantando} className="btn-primary flex items-center gap-2 disabled:opacity-60">
            <FileSpreadsheet className="w-4 h-4" /> {loading ? 'Processando...' : 'Subir exportações'}
          </button>
          {rows.length > 0 && <button onClick={limpar} disabled={implantando} className="btn-secondary flex items-center gap-2 disabled:opacity-60"><X className="w-4 h-4" /> Limpar</button>}
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Válidas</p>
          <p className="text-xl font-bold font-display">{validas.length}</p>
        </div>
      </div>

      {resultadoImplantacao && (
        <div className={`rounded-xl border p-4 space-y-3 ${resultadoImplantacao.erros.length ? 'border-warning/40 bg-warning/10' : 'border-success/30 bg-success/10'}`}>
          <div className="flex items-center gap-2">
            {resultadoImplantacao.erros.length ? <AlertTriangle className="w-4 h-4 text-warning" /> : <CheckCircle2 className="w-4 h-4 text-success" />}
            <h3 className="font-semibold">Resultado da implantação no banco TOPAC</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {resultadoCards.map(item => (
              <div key={item.label} className="rounded-lg border border-border bg-background/60 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">{item.label}</p>
                <p className="text-xl font-bold font-display">{item.value}</p>
              </div>
            ))}
          </div>
          {resultadoImplantacao.erros.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border bg-background/60">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr><th className="p-2 text-left">Linha</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Erro</th></tr>
                </thead>
                <tbody>
                  {resultadoImplantacao.erros.slice(0, 80).map((erro, index) => (
                    <tr key={`${erro.linha}-${index}`} className="border-t border-border">
                      <td className="p-2 font-mono">{erro.linha}</td>
                      <td className="p-2">{erro.tipo}</td>
                      <td className="p-2">{erro.mensagem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {etapa === 'diagnostico' && (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-primary" /><h3 className="font-semibold">Diagnóstico inicial</h3></div>
          {arquivos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Suba todas as exportações do DN4: clientes, contratos, locações, equipamentos, faturamento, títulos/financeiro e recebimentos. Se a API DN4 estiver liberada, configure o conector e use Puxar DN4.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground"><tr><th className="p-3 text-left">Arquivo</th><th className="p-3 text-left">Tipo</th><th className="p-3 text-right">Abas</th><th className="p-3 text-right">Linhas</th></tr></thead>
                <tbody>{arquivos.map(file => <tr key={`${file.nome}-${file.abas}-${file.linhas}`} className="border-t border-border"><td className="p-3 font-medium">{file.nome}</td><td className="p-3 text-muted-foreground">{file.tipo}</td><td className="p-3 text-right">{file.abas}</td><td className="p-3 text-right">{file.linhas}</td></tr>)}</tbody>
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
                <p className="text-[10px] text-muted-foreground truncate">{destinoTopac[card.key]}</p>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-muted/30 p-3">
            <button onClick={() => setSelected('todos')} className={`text-xs px-3 py-1.5 rounded-full ${selected === 'todos' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>Todos ({rows.length})</button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {pendentes > 0 ? <AlertTriangle className="w-4 h-4 text-warning" /> : <CheckCircle2 className="w-4 h-4 text-success" />}
              {pendentes > 0 ? `${pendentes} linha(s) precisam de revisão antes da implantação definitiva.` : 'Pacote sem pendências críticas.'}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1120px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Destino TOPAC</th>
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
                    <td className="p-3 font-mono text-xs text-muted-foreground">{row.destinoTopac}</td>
                    <td className="p-3"><span className={`text-[10px] px-2 py-1 rounded-full ${entidadeClasses[row.entidade]}`}>{entidadeLabel[row.entidade]} · {row.confianca}%</span></td>
                    <td className="p-3"><div className="font-medium truncate max-w-[220px]">{row.cliente || '—'}</div><div className="text-xs text-muted-foreground">{row.documento || row.origem}</div></td>
                    <td className="p-3 font-mono text-xs">{row.contrato || '—'}</td>
                    <td className="p-3 truncate max-w-[180px]">{row.equipamento || '—'}</td>
                    <td className="p-3 text-muted-foreground">{row.periodo || '—'}</td>
                    <td className="p-3 text-right font-semibold">{row.valor || '—'}</td>
                    <td className="p-3 text-muted-foreground">{row.vencimento || row.dataEmissao || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{row.pendencias.length ? row.pendencias.join(', ') : <span className="text-success">ok para implantação TOPAC</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtradas.length > 120 && <div className="p-3 text-xs text-muted-foreground border-t border-border">Mostrando 120 de {filtradas.length} linhas filtradas para manter a tela leve.</div>}
          </div>
        </>
      )}

      {(etapa === 'validacao' || etapa === 'pacote' || etapa === 'goLive') && (
        <div className="grid md:grid-cols-4 gap-3">
          <button onClick={() => downloadCsv(rows, `dn4-topac-pacote-${modulo}.csv`)} disabled={!rows.length || implantando} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" /> Exportar pacote completo</button>
          <button onClick={() => downloadCsv(rows.filter(row => row.pendencias.length > 0), `dn4-topac-pendencias-${modulo}.csv`)} disabled={!pendentes || implantando} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"><AlertTriangle className="w-4 h-4" /> Exportar pendências</button>
          <button onClick={registrarPacote} disabled={!rows.length || implantando} className="btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Registrar pacote TOPAC</button>
          <button onClick={implantarNoBanco} disabled={!validas.length || implantando} className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"><Database className="w-4 h-4" /> {implantando ? 'Implantando...' : 'Implantar no banco TOPAC'}</button>
        </div>
      )}

      {(aprovado || pacotes.length > 0) && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success space-y-2">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Pacote DN4 registrado no TOPAC para implantação operacional.</div>
          {pacotes.slice(0, 3).map(pacote => (
            <div key={pacote.id} className="text-xs text-success/80">
              {pacote.id} · {pacote.total} linhas · cobertura {pacote.cobertura}% · {new Date(pacote.criadoEm).toLocaleString('pt-BR')}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default Dn4ImportPanel;
