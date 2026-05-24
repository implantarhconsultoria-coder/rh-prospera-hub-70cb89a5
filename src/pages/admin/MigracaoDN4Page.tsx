import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  CANONICAL_FIELDS,
  DN4_MODULE_LABELS,
  DN4_STATUS_LABELS,
  Dn4MigrationModule,
  Dn4MigrationStatus,
  detectDn4Module,
  normalizeKeyValue,
  parseCsv,
  suggestDn4Mapping,
} from '@/lib/dn4Migration';
import { parseDn4ClientesPdf } from '@/lib/dn4PdfClientes';

type MigrationBatch = {
  id: string;
  nome: string;
  status: string;
  criado_em: string;
  confirmado_em?: string | null;
  resumo?: Record<string, unknown> | null;
};

type MigrationFile = {
  id: string;
  lote_id: string;
  nome_arquivo: string;
  storage_path?: string | null;
  tipo_detectado: Dn4MigrationModule;
  status: string;
  cabecalhos: string[];
  mapeamento: Record<string, string>;
  total_lidos: number;
  total_validos: number;
  total_erros: number;
};

type MigrationRecord = {
  id: string;
  lote_id: string;
  arquivo_id: string;
  modulo: Dn4MigrationModule;
  status: Dn4MigrationStatus;
  linha: number;
  chave_principal?: string | null;
  dados_raw: Record<string, unknown>;
  dados_mapeados: Record<string, unknown>;
  erros: string[];
};

type ClientUpsertReport = {
  criados: number;
  atualizados: number;
  ignorados: number;
  erros: number;
  motivos: string[];
};

const MODULES: Dn4MigrationModule[] = [
  'empresas',
  'clientes',
  'fornecedores',
  'financeiro',
  'contas_pagar',
  'contas_receber',
  'faturamento',
  'notas_fiscais',
  'frota',
  'ativos',
  'manutencoes',
  'os_chamados',
  'almoxarifado',
  'abastecimentos',
  'pecas_insumos',
  'contratos_locacoes',
  'historico_operacional',
  'nao_identificado',
];

const REQUIRED_FIELDS: Partial<Record<Dn4MigrationModule, string[]>> = {
  empresas: ['cnpj', 'razao_social'],
  clientes: ['razao_social'],
  fornecedores: ['razao_social'],
  contas_pagar: ['fornecedor', 'valor'],
  contas_receber: ['cliente', 'valor'],
  faturamento: ['cliente', 'valor'],
  notas_fiscais: ['numero_nf'],
  frota: ['placa'],
  ativos: ['patrimonio'],
  manutencoes: ['placa', 'descricao'],
  os_chamados: ['numero_os'],
  abastecimentos: ['placa', 'data'],
  almoxarifado: ['descricao'],
};

const STATUS_CLASS: Record<Dn4MigrationStatus, string> = {
  pronto_para_migrar: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  duplicado: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  pendente_vinculo: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  campo_obrigatorio_ausente: 'bg-red-500/15 text-red-300 border-red-500/30',
  erro_formato: 'bg-red-500/15 text-red-300 border-red-500/30',
  ignorado: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  migrado_sucesso: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
};

const downloadText = (filename: string, content: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const normalizeDoc = (value: unknown) => String(value || '').replace(/\D/g, '');
const digitsOnly = (value: unknown) => String(value || '').replace(/\D/g, '');
const cleanText = (value: unknown) => String(value || '').trim();

const isRepeatedDigits = (value: string) => /^(\d)\1+$/.test(value);

const isValidCpf = (cpfRaw: string) => {
  const cpf = digitsOnly(cpfRaw);
  if (cpf.length !== 11 || isRepeatedDigits(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
};

const isValidCnpj = (cnpjRaw: string) => {
  const cnpj = digitsOnly(cnpjRaw);
  if (cnpj.length !== 14 || isRepeatedDigits(cnpj)) return false;

  const calcDigit = (base: string, factors: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * factors[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (firstDigit !== Number(cnpj[12])) return false;
  const secondDigit = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return secondDigit === Number(cnpj[13]);
};

const isValidCpfCnpj = (document: string) => {
  const clean = normalizeDoc(document);
  if (!clean) return false;
  if (clean.length === 11) return isValidCpf(clean);
  if (clean.length === 14) return isValidCnpj(clean);
  return false;
};

const buildMapped = (row: Record<string, string>, mapping: Record<string, string>) =>
  Object.entries(mapping).reduce<Record<string, string>>((acc, [field, header]) => {
    if (header && row[header] !== undefined) acc[field] = row[header];
    return acc;
  }, {});

const buildKey = (mapped: Record<string, string>) => {
  const document = normalizeDoc(
    mapped.cnpj || mapped.cpf || mapped.cnpj_cpf || mapped.numero_documento,
  );
  if (document) return document;

  const cod = normalizeKeyValue(mapped.codigo_dn4);
  if (cod) return `COD-${cod}`;

  const named = normalizeKeyValue(
    [mapped.razao_social || mapped.nome || mapped.cliente, mapped.cidade, mapped.uf]
      .filter(Boolean)
      .join('-'),
  );
  if (named) return `NOME-${named}`;

  return normalizeKeyValue(
    mapped.placa ||
      mapped.numero_os ||
      mapped.numero_nf ||
      [mapped.data, mapped.valor, mapped.centro_custo].filter(Boolean).join('-'),
  );
};

const validateRecord = (
  modulo: Dn4MigrationModule,
  mapped: Record<string, string>,
  seenKeys: Set<string>,
) => {
  const required = REQUIRED_FIELDS[modulo] || [];
  const errors = required
    .filter((field) => !cleanText(mapped[field]))
    .map((field) => `Campo obrigatorio ausente: ${field}`);

  if (modulo === 'nao_identificado') {
    errors.push('Tipo de arquivo nao identificado pelo cabecalho.');
  }

  if (modulo === 'clientes') {
    const doc = normalizeDoc(mapped.cnpj || mapped.cpf || mapped.cnpj_cpf || mapped.numero_documento);
    if (doc && !isValidCpfCnpj(doc)) {
      errors.push('CPF/CNPJ invalido.');
    }
  }

  const key = buildKey(mapped);
  if (!key) errors.push('Nenhuma chave principal encontrada.');

  if (key && seenKeys.has(`${modulo}:${key}`)) {
    if (modulo === 'clientes') {
      // Clientes DN4 podem repetir entre arquivos/lotes; o upsert trata deduplicacao real.
      return { status: 'pronto_para_migrar' as Dn4MigrationStatus, errors, key };
    }
    return {
      status: 'duplicado' as Dn4MigrationStatus,
      errors: ['Duplicidade dentro do lote.'],
      key,
    };
  }
  if (key) seenKeys.add(`${modulo}:${key}`);

  if (errors.length) {
    const hasRequired = errors.some((item) => item.startsWith('Campo obrigatorio ausente:'));
    const hasFormat = errors.some((item) => item.toLowerCase().includes('invalido'));
    const status = hasRequired
      ? ('campo_obrigatorio_ausente' as Dn4MigrationStatus)
      : hasFormat
        ? ('erro_formato' as Dn4MigrationStatus)
        : ('pendente_vinculo' as Dn4MigrationStatus);
    return { status, errors, key };
  }

  return { status: 'pronto_para_migrar' as Dn4MigrationStatus, errors: [], key };
};

const toChunk = <T,>(items: T[], size = 200) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const toClientPayload = (mapped: Record<string, string>) => {
  const razao = cleanText(mapped.razao_social || mapped.nome || mapped.cliente);
  return {
    razao_social: razao,
    nome_fantasia: cleanText(mapped.nome_fantasia || mapped.razao_social || ''),
    cnpj_cpf: normalizeDoc(mapped.cnpj || mapped.cpf || mapped.cnpj_cpf || mapped.numero_documento) || null,
    inscricao_estadual: cleanText(mapped.inscricao_estadual || '') || null,
    endereco: cleanText(mapped.endereco || '') || null,
    cidade: cleanText(mapped.cidade || '') || null,
    uf: cleanText(mapped.uf || '').toUpperCase().slice(0, 2) || null,
    cep: digitsOnly(mapped.cep || '') || null,
    status: cleanText(mapped.status || 'ativo') || 'ativo',
    observacoes: cleanText(mapped.observacoes || '') || null,
  };
};

const toClienteDn4Payload = (mapped: Record<string, string>) => ({
  nome: cleanText(mapped.razao_social || mapped.nome || mapped.cliente),
  cnpj_cpf: normalizeDoc(mapped.cnpj || mapped.cpf || mapped.cnpj_cpf || mapped.numero_documento) || null,
  endereco: cleanText(mapped.endereco || '') || null,
  empresa_vinculada: cleanText(mapped.empresa || mapped.filial || '') || null,
  observacoes: cleanText(mapped.observacoes || '') || null,
});

const toClienteFaturamentoPayload = (mapped: Record<string, string>) => ({
  codigo_dn4: cleanText(mapped.codigo_dn4 || '') || null,
  nome_razao_social: cleanText(mapped.razao_social || mapped.nome || mapped.cliente),
  cpf_cnpj: normalizeDoc(mapped.cnpj || mapped.cpf || mapped.cnpj_cpf || mapped.numero_documento) || null,
  inscricao_estadual: cleanText(mapped.inscricao_estadual || '') || null,
  endereco: cleanText(mapped.endereco || '') || null,
  bairro: cleanText(mapped.bairro || '') || null,
  cidade: cleanText(mapped.cidade || '') || null,
  uf: cleanText(mapped.uf || '').toUpperCase().slice(0, 2) || null,
  cep: digitsOnly(mapped.cep || '') || null,
  empresa_origem: cleanText(mapped.empresa || '') || null,
  filial_origem: cleanText(mapped.filial || '') || null,
  status: cleanText(mapped.status || 'ativo') || 'ativo',
});

const mapPdfRowsToGenericRows = (rows: Awaited<ReturnType<typeof parseDn4ClientesPdf>>['rows']) =>
  rows.map((row) => ({
    codigo_dn4: row.codigo_dn4 || '',
    razao_social: row.razao_social || '',
    nome: row.razao_social || '',
    cnpj: row.cnpj || '',
    cpf: row.cpf || '',
    cnpj_cpf: row.cnpj || row.cpf || '',
    inscricao_estadual: row.inscricao_estadual || '',
    endereco: row.endereco || '',
    cidade: row.cidade || '',
    uf: row.uf || '',
    cep: row.cep || '',
    origem_pdf: row.origem || '',
    linha_original: row.linha_original || '',
  }));

const scoreSpreadsheetHeaderRow = (row: unknown[]) => {
  const signals = [
    'codigo',
    'cliente',
    'razao',
    'cnpj',
    'cpf',
    'empresa',
    'fornecedor',
    'placa',
    'patrimonio',
    'os',
    'nf',
    'valor',
    'data',
    'cidade',
    'uf',
  ];
  const normalized = row
    .map((cell) => cleanText(cell))
    .filter(Boolean)
    .map((cell) => cell.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  return signals.reduce(
    (score, signal) =>
      score + (normalized.some((cell) => cell === signal || cell.includes(signal)) ? 1 : 0),
    0,
  );
};

const parseSpreadsheetFile = async (file: File) => {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false, cellDates: false });
  if (!workbook.SheetNames.length) return { headers: [], rows: [] as Record<string, string>[] };

  let matrix: unknown[][] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const current = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
    const dataRows = current.filter((row) =>
      Array.isArray(row) && row.some((cell) => cleanText(cell)),
    );
    if (dataRows.length > matrix.length) matrix = dataRows;
  }

  if (!matrix.length) return { headers: [], rows: [] as Record<string, string>[] };

  let headerIndex = 0;
  let bestScore = -1;
  const sampleLimit = Math.min(matrix.length, 25);
  for (let index = 0; index < sampleLimit; index += 1) {
    const row = matrix[index] || [];
    const score = scoreSpreadsheetHeaderRow(Array.isArray(row) ? row : []);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }

  const headerRow = matrix[headerIndex] || [];
  const headers = headerRow.map((value, index) => cleanText(value) || `coluna_${index + 1}`);
  const rows = matrix
    .slice(headerIndex + 1)
    .map((values) =>
      headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = cleanText((values || [])[index]);
        return acc;
      }, {}),
    )
    .filter((row) => Object.values(row).some((value) => cleanText(value)));

  return { headers, rows };
};

const MigracaoDN4Page: React.FC = () => {
  const { userRoles, session } = useApp();
  const isAdmin = userRoles.includes('admin');
  const isDirector = userRoles.includes('diretor_geral');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState<MigrationBatch | null>(null);
  const [files, setFiles] = useState<MigrationFile[]>([]);
  const [records, setRecords] = useState<MigrationRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState('todos');
  const [selectedModule, setSelectedModule] = useState<Dn4MigrationModule | 'todos'>('todos');
  const [log, setLog] = useState<string[]>([]);
  const [lastReport, setLastReport] = useState<ClientUpsertReport | null>(null);

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    const { data: batches, error } = await supabase
      .from('dn4_migracao_lotes' as any)
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(1);

    if (error) {
      setLoading(false);
      toast.error(
        error.message.includes('schema cache')
          ? 'A migration da tela Migracao DN4 ainda precisa ser aplicada.'
          : error.message,
      );
      return;
    }

    const current = ((batches as any[]) || [])[0] || null;
    setBatch(current);
    const reportFromDb = (current?.resumo as any)?.ultimo_relatorio;
    if (reportFromDb && typeof reportFromDb === 'object') {
      setLastReport({
        criados: Number(reportFromDb.criados || 0),
        atualizados: Number(reportFromDb.atualizados || 0),
        ignorados: Number(reportFromDb.ignorados || 0),
        erros: Number(reportFromDb.erros || 0),
        motivos: Array.isArray(reportFromDb.motivos)
          ? reportFromDb.motivos.map((item: unknown) => String(item))
          : [],
      });
    } else {
      setLastReport(null);
    }

    if (current) {
      const [{ data: fileData }, { data: recordData }, { data: logData }] = await Promise.all([
        supabase
          .from('dn4_migracao_arquivos' as any)
          .select('*')
          .eq('lote_id', current.id)
          .order('criado_em'),
        supabase
          .from('dn4_migracao_registros' as any)
          .select('*')
          .eq('lote_id', current.id)
          .order('criado_em')
          .limit(5000),
        supabase
          .from('dn4_migracao_logs' as any)
          .select('acao,detalhe,criado_em')
          .eq('lote_id', current.id)
          .order('criado_em', { ascending: false })
          .limit(50),
      ]);

      setFiles(
        ((fileData as any[]) || []).map((item) => ({
          ...item,
          cabecalhos: item.cabecalhos || [],
          mapeamento: item.mapeamento || {},
        })),
      );
      setRecords(
        ((recordData as any[]) || []).map((item) => ({
          ...item,
          erros: item.erros || [],
          dados_raw: item.dados_raw || {},
          dados_mapeados: item.dados_mapeados || {},
        })),
      );
      setLog(
        ((logData as any[]) || []).map(
          (item) =>
            `${new Date(item.criado_em).toLocaleString('pt-BR')} - ${item.acao}: ${item.detalhe || ''}`,
        ),
      );
    } else {
      setFiles([]);
      setRecords([]);
      setLog([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  const ensureBatch = async () => {
    if (batch && batch.status !== 'cancelado' && batch.status !== 'concluido') return batch;
    const { data, error } = await supabase
      .from('dn4_migracao_lotes' as any)
      .insert({
        nome: `Migracao DN4 -> TOPAC RH PRO ${new Date().toLocaleDateString('pt-BR')}`,
        status: 'pre_migracao',
        criado_por: session?.user?.id,
      } as any)
      .select()
      .single();

    if (error) throw error;
    setBatch(data as any);
    return data as unknown as MigrationBatch;
  };

  const insertLog = async (
    loteId: string,
    acao: string,
    detalhe: string,
    payload?: Record<string, unknown>,
  ) =>
    supabase.from('dn4_migracao_logs' as any).insert({
      lote_id: loteId,
      acao,
      detalhe,
      payload: payload || {},
      criado_por: session?.user?.id,
    } as any);

  const upsertClientsFromRecords = useCallback(
    async (loteId: string, targetRecords: MigrationRecord[]) => {
      const readyClients = targetRecords.filter(
        (record) => record.modulo === 'clientes' && record.status === 'pronto_para_migrar',
      );

      if (!readyClients.length) {
        return {
          criados: 0,
          atualizados: 0,
          ignorados: 0,
          erros: 0,
          motivos: [],
        } satisfies ClientUpsertReport;
      }

      const report: ClientUpsertReport = {
        criados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: 0,
        motivos: [],
      };

      const seenInRun = new Set<string>();
      const statusUpdates: Array<{
        id: string;
        status: Dn4MigrationStatus;
        errors: string[];
      }> = [];

      type ClientTargetTable = 'clientes_fat' | 'clientes' | 'clientes_faturamento';

      const isMissingTableError = (error: any) =>
        /could not find the table|schema cache|does not exist|relation .* does not exist/i.test(
          String(error?.message || ''),
        );

      const tableExists = async (table: ClientTargetTable) => {
        const probePayload =
          table === 'clientes_faturamento'
            ? ({ status: 'ativo' } as Record<string, unknown>)
            : ({ status: 'ativo' } as Record<string, unknown>);
        const { error } = await supabase
          .from(table as any)
          .update(probePayload as any)
          .eq('id', '00000000-0000-0000-0000-000000000000');
        if (!error) return true;
        return !isMissingTableError(error);
      };

      const orderedTargets: ClientTargetTable[] = ['clientes_fat', 'clientes', 'clientes_faturamento'];
      const availableTargets: ClientTargetTable[] = [];
      for (const table of orderedTargets) {
        if (await tableExists(table)) availableTargets.push(table);
      }

      if (!availableTargets.length) {
        throw new Error(
          'Nenhuma tabela de clientes disponivel (clientes_fat/clientes/clientes_faturamento).',
        );
      }

      const primaryTarget: ClientTargetTable = availableTargets[0]!;
      const mirrorTargets = availableTargets.filter((table) => table !== primaryTarget);

      const getDocField = (table: ClientTargetTable) =>
        table === 'clientes_faturamento' ? 'cpf_cnpj' : 'cnpj_cpf';

      const getNameField = (table: ClientTargetTable) => {
        if (table === 'clientes_faturamento') return 'nome_razao_social';
        if (table === 'clientes') return 'nome';
        return 'razao_social';
      };

      const getRowDoc = (table: ClientTargetTable, row: any) =>
        normalizeDoc(row?.[getDocField(table)] || row?.cnpj_cpf || row?.cpf_cnpj || '');

      const getRowName = (table: ClientTargetTable, row: any) =>
        cleanText(
          row?.[getNameField(table)] ||
            row?.razao_social ||
            row?.nome_razao_social ||
            row?.nome ||
            '',
        ).toLowerCase();

      const buildPayloadForTable = (
        table: ClientTargetTable,
        mapped: Record<string, string>,
      ): Record<string, unknown> => {
        const fat = toClientPayload(mapped);
        if (table === 'clientes_faturamento') {
          const legacy = toClienteFaturamentoPayload(mapped);
          return {
            codigo_dn4: legacy.codigo_dn4 || null,
            nome_razao_social: legacy.nome_razao_social || fat.razao_social,
            cpf_cnpj: legacy.cpf_cnpj || fat.cnpj_cpf || null,
            inscricao_estadual: legacy.inscricao_estadual || null,
            endereco: legacy.endereco || null,
            bairro: legacy.bairro || null,
            cidade: legacy.cidade || null,
            uf: legacy.uf || null,
            cep: legacy.cep || null,
            empresa_origem: legacy.empresa_origem || null,
            filial_origem: legacy.filial_origem || null,
            status: legacy.status || fat.status || 'ativo',
          };
        }

        if (table === 'clientes') {
          return {
            nome: fat.razao_social,
            razao_social: fat.razao_social,
            nome_fantasia: fat.nome_fantasia || fat.razao_social,
            cnpj_cpf: fat.cnpj_cpf || null,
            cpf_cnpj: fat.cnpj_cpf || null,
            inscricao_estadual: fat.inscricao_estadual || null,
            endereco: fat.endereco || null,
            cidade: fat.cidade || null,
            uf: fat.uf || null,
            cep: fat.cep || null,
            status: fat.status || 'ativo',
            observacoes: fat.observacoes || null,
          };
        }

        return {
          razao_social: fat.razao_social,
          nome_fantasia: fat.nome_fantasia || fat.razao_social,
          cnpj_cpf: fat.cnpj_cpf || '',
          inscricao_estadual: fat.inscricao_estadual || '',
          endereco: fat.endereco || '',
          cidade: fat.cidade || '',
          uf: fat.uf || '',
          cep: fat.cep || '',
          observacoes: fat.observacoes || '',
          status: fat.status || 'ativo',
        };
      };

      const documents = [...new Set(
        readyClients
          .map((record) =>
            normalizeDoc(
              (record.dados_mapeados as Record<string, string>).cnpj ||
                (record.dados_mapeados as Record<string, string>).cpf ||
                (record.dados_mapeados as Record<string, string>).cnpj_cpf ||
                (record.dados_mapeados as Record<string, string>).numero_documento,
            ),
          )
          .filter(Boolean),
      )];

      const names = [...new Set(
        readyClients
          .map((record) =>
            cleanText(
              (record.dados_mapeados as Record<string, string>).razao_social ||
                (record.dados_mapeados as Record<string, string>).nome ||
                (record.dados_mapeados as Record<string, string>).cliente,
            ),
          )
          .filter(Boolean),
      )];

      const existingByDoc = new Map<string, any>();
      const existingByName = new Map<string, any>();

      for (const chunk of toChunk(documents, 250)) {
        const docField = getDocField(primaryTarget);
        const { data } = await supabase
          .from(primaryTarget as any)
          .select('*')
          .in(docField as any, chunk as any);
        (data || []).forEach((item: any) => {
          const doc = getRowDoc(primaryTarget, item);
          if (doc && !existingByDoc.has(doc)) existingByDoc.set(doc, item);
          const nameKey = getRowName(primaryTarget, item);
          if (nameKey && !existingByName.has(nameKey)) existingByName.set(nameKey, item);
        });
      }

      for (const chunk of toChunk(names, 250)) {
        const nameField = getNameField(primaryTarget);
        const { data } = await supabase
          .from(primaryTarget as any)
          .select('*')
          .in(nameField as any, chunk as any);
        (data || []).forEach((item: any) => {
          const doc = getRowDoc(primaryTarget, item);
          if (doc && !existingByDoc.has(doc)) existingByDoc.set(doc, item);
          const nameKey = getRowName(primaryTarget, item);
          if (nameKey && !existingByName.has(nameKey)) existingByName.set(nameKey, item);
        });
      }

      for (const record of readyClients) {
        const mapped = record.dados_mapeados as Record<string, string>;
        const payload = buildPayloadForTable(primaryTarget, mapped);
        const basePayload = toClientPayload(mapped);
        const doc = normalizeDoc(
          String(
            payload[getDocField(primaryTarget)] ||
              (payload as any).cnpj_cpf ||
              (payload as any).cpf_cnpj ||
              '',
          ),
        );
        const nameKey = cleanText(
          String(
            payload[getNameField(primaryTarget)] ||
              (payload as any).razao_social ||
              (payload as any).nome_razao_social ||
              (payload as any).nome ||
              '',
          ),
        ).toLowerCase();
        const identity = doc || nameKey || cleanText(record.chave_principal).toLowerCase();

        if (!identity) {
          report.ignorados += 1;
          const reason = `Registro ${record.linha}: sem identificador (CPF/CNPJ/chave).`;
          report.motivos.push(reason);
          statusUpdates.push({ id: record.id, status: 'ignorado', errors: [reason] });
          continue;
        }

        if (seenInRun.has(identity)) {
          report.ignorados += 1;
          const reason = `Registro ${record.linha}: duplicado no mesmo envio (${identity}).`;
          report.motivos.push(reason);
          statusUpdates.push({ id: record.id, status: 'duplicado', errors: [reason] });
          continue;
        }
        seenInRun.add(identity);

        if (!cleanText(basePayload.razao_social)) {
          report.erros += 1;
          const reason = `Registro ${record.linha}: razao social ausente.`;
          report.motivos.push(reason);
          statusUpdates.push({ id: record.id, status: 'campo_obrigatorio_ausente', errors: [reason] });
          continue;
        }

        if (doc && !isValidCpfCnpj(doc)) {
          report.erros += 1;
          const reason = `Registro ${record.linha}: CPF/CNPJ invalido (${doc}).`;
          report.motivos.push(reason);
          statusUpdates.push({ id: record.id, status: 'erro_formato', errors: [reason] });
          continue;
        }

        let existing =
          (doc && existingByDoc.get(doc)) ||
          (nameKey && existingByName.get(nameKey)) ||
          null;

        if (!existing && nameKey) {
          const nameField = getNameField(primaryTarget);
          const { data: fallbackByName } = await supabase
            .from(primaryTarget as any)
            .select('*')
            .ilike(nameField as any, String(payload[nameField] || basePayload.razao_social))
            .order('created_at', { ascending: true })
            .limit(1);
          existing = fallbackByName?.[0] || null;
        }

        if (existing) {
          const mergedPayload: Record<string, unknown> = { ...payload };
          Object.entries(mergedPayload).forEach(([key, value]) => {
            if (
              value === null ||
              value === undefined ||
              value === '' ||
              (typeof value === 'string' && value.trim() === '')
            ) {
              mergedPayload[key] = existing[key] ?? value;
            }
          });
          const { error: updateError } = await supabase
            .from(primaryTarget as any)
            .update(mergedPayload as any)
            .eq('id', existing.id);
          if (updateError) {
            report.erros += 1;
            const reason = `Registro ${record.linha}: erro ao atualizar cliente (${updateError.message}).`;
            report.motivos.push(reason);
            statusUpdates.push({ id: record.id, status: 'erro_formato', errors: [reason] });
            continue;
          }

          for (const mirrorTable of mirrorTargets) {
            try {
              const mirrorPayload = buildPayloadForTable(mirrorTable, mapped);
              const mirrorDocField = getDocField(mirrorTable);
              const mirrorNameField = getNameField(mirrorTable);
              const mirrorDoc = normalizeDoc(String(mirrorPayload[mirrorDocField] || ''));
              const mirrorName = cleanText(String(mirrorPayload[mirrorNameField] || '')).toLowerCase();
              let mirrorExisting: any = null;
              if (mirrorDoc) {
                const { data } = await supabase
                  .from(mirrorTable as any)
                  .select('id')
                  .eq(mirrorDocField as any, mirrorDoc)
                  .limit(1);
                mirrorExisting = data?.[0] || null;
              }
              if (!mirrorExisting && mirrorName) {
                const { data } = await supabase
                  .from(mirrorTable as any)
                  .select('id')
                  .ilike(mirrorNameField as any, String(mirrorPayload[mirrorNameField]))
                  .limit(1);
                mirrorExisting = data?.[0] || null;
              }
              if (mirrorExisting?.id) {
                await supabase
                  .from(mirrorTable as any)
                  .update(mirrorPayload as any)
                  .eq('id', mirrorExisting.id);
              } else {
                await supabase.from(mirrorTable as any).insert(mirrorPayload as any);
              }
            } catch (mirrorError: any) {
              if (!isMissingTableError(mirrorError)) {
                throw mirrorError;
              }
            }
          }

          const dn4Payload = toClienteDn4Payload(mapped);
          let existingDn4: any = null;
          if (dn4Payload.cnpj_cpf) {
            const { data } = await supabase
              .from('clientes_dn4')
              .select('id,nome,cnpj_cpf')
              .eq('cnpj_cpf', dn4Payload.cnpj_cpf)
              .limit(1);
            existingDn4 = data?.[0] || null;
          }
          if (!existingDn4 && dn4Payload.nome) {
            const { data } = await supabase
              .from('clientes_dn4')
              .select('id,nome,cnpj_cpf')
              .ilike('nome', dn4Payload.nome)
              .limit(1);
            existingDn4 = data?.[0] || null;
          }

          if (existingDn4?.id) {
            await supabase.from('clientes_dn4').update(dn4Payload as any).eq('id', existingDn4.id);
          } else if (dn4Payload.nome) {
            await supabase.from('clientes_dn4').insert(dn4Payload as any);
          }

          report.atualizados += 1;
          statusUpdates.push({ id: record.id, status: 'migrado_sucesso', errors: [] });
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from(primaryTarget as any)
          .insert(payload as any)
          .select('*')
          .single();

        if (insertError) {
          report.erros += 1;
          const reason = `Registro ${record.linha}: erro ao criar cliente (${insertError.message}).`;
          report.motivos.push(reason);
          statusUpdates.push({ id: record.id, status: 'erro_formato', errors: [reason] });
          continue;
        }

        if (inserted) {
          const insertedDoc = getRowDoc(primaryTarget, inserted);
          if (insertedDoc) existingByDoc.set(insertedDoc, inserted);
          const insertedName = getRowName(primaryTarget, inserted);
          if (insertedName) existingByName.set(insertedName, inserted);
        }

        for (const mirrorTable of mirrorTargets) {
          try {
            const mirrorPayload = buildPayloadForTable(mirrorTable, mapped);
            const mirrorDocField = getDocField(mirrorTable);
            const mirrorNameField = getNameField(mirrorTable);
            const mirrorDoc = normalizeDoc(String(mirrorPayload[mirrorDocField] || ''));
            const mirrorName = cleanText(String(mirrorPayload[mirrorNameField] || '')).toLowerCase();
            let mirrorExisting: any = null;
            if (mirrorDoc) {
              const { data } = await supabase
                .from(mirrorTable as any)
                .select('id')
                .eq(mirrorDocField as any, mirrorDoc)
                .limit(1);
              mirrorExisting = data?.[0] || null;
            }
            if (!mirrorExisting && mirrorName) {
              const { data } = await supabase
                .from(mirrorTable as any)
                .select('id')
                .ilike(mirrorNameField as any, String(mirrorPayload[mirrorNameField]))
                .limit(1);
              mirrorExisting = data?.[0] || null;
            }

            if (mirrorExisting?.id) {
              await supabase
                .from(mirrorTable as any)
                .update(mirrorPayload as any)
                .eq('id', mirrorExisting.id);
            } else {
              await supabase.from(mirrorTable as any).insert(mirrorPayload as any);
            }
          } catch (mirrorError: any) {
            if (!isMissingTableError(mirrorError)) {
              throw mirrorError;
            }
          }
        }

        const dn4Payload = toClienteDn4Payload(mapped);
        if (dn4Payload.nome) {
          let existingDn4: any = null;
          if (dn4Payload.cnpj_cpf) {
            const { data } = await supabase
              .from('clientes_dn4')
              .select('id,nome,cnpj_cpf')
              .eq('cnpj_cpf', dn4Payload.cnpj_cpf)
              .limit(1);
            existingDn4 = data?.[0] || null;
          }
          if (!existingDn4) {
            const { data } = await supabase
              .from('clientes_dn4')
              .select('id,nome,cnpj_cpf')
              .ilike('nome', dn4Payload.nome)
              .limit(1);
            existingDn4 = data?.[0] || null;
          }

          if (existingDn4?.id) {
            await supabase.from('clientes_dn4').update(dn4Payload as any).eq('id', existingDn4.id);
          } else {
            await supabase.from('clientes_dn4').insert(dn4Payload as any);
          }
        }

        report.criados += 1;
        statusUpdates.push({ id: record.id, status: 'migrado_sucesso', errors: [] });
      }

      for (const chunk of toChunk(statusUpdates, 200)) {
        await Promise.all(
          chunk.map((item) =>
            supabase
              .from('dn4_migracao_registros' as any)
              .update({
                status: item.status,
                erros: item.errors,
                migrado_em: item.status === 'migrado_sucesso' ? new Date().toISOString() : null,
              } as any)
              .eq('id', item.id),
          ),
        );
      }

      const idsMigrados = statusUpdates
        .filter((item) => item.status === 'migrado_sucesso')
        .map((item) => item.id);
      const idsErro = statusUpdates
        .filter((item) => item.status !== 'migrado_sucesso')
        .map((item) => item.id);

      if (idsMigrados.length) {
        await supabase
          .from('dn4_migracao_arquivos' as any)
          .update({ status: 'migrado_parcial', mensagem: 'Migracao clientes concluida com processamento automatico.' } as any)
          .in('id', [...new Set(
            readyClients
              .filter((record) => idsMigrados.includes(record.id))
              .map((record) => record.arquivo_id),
          )]);
      }

      if (idsErro.length) {
        await supabase
          .from('dn4_migracao_arquivos' as any)
          .update({ mensagem: 'Ha registros ignorados/erro. Consulte o relatorio final.' } as any)
          .in('id', [...new Set(
            readyClients
              .filter((record) => idsErro.includes(record.id))
              .map((record) => record.arquivo_id),
          )]);
      }

      const resumoPayload = {
        ultimo_relatorio: {
          criados: report.criados,
          atualizados: report.atualizados,
          ignorados: report.ignorados,
          erros: report.erros,
          motivos: report.motivos.slice(0, 80),
        },
      };

      await supabase
        .from('dn4_migracao_lotes' as any)
        .update({ resumo: resumoPayload } as any)
        .eq('id', loteId);

      await insertLog(
        loteId,
        'clientes_upsert',
        `Clientes migrados (${primaryTarget}) -> criados: ${report.criados}, atualizados: ${report.atualizados}, ignorados: ${report.ignorados}, erros: ${report.erros}`,
        { ...report, tabela: primaryTarget, espelhos: mirrorTargets, motivos: report.motivos.slice(0, 80) },
      );

      return report;
    },
    [insertLog],
  );

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = Array.from(event.target.files || []);
    if (!uploadFiles.length) return;
    if (!isAdmin) return toast.error('Somente admin pode executar migracao.');

    setBusy(true);
    try {
      const lote = await ensureBatch();
      const seen = new Set<string>();

      for (const file of uploadFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const path = `${lote.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: uploadError } = await supabase.storage
          .from('dn4-migracao')
          .upload(path, file, { upsert: false });

        if (uploadError) {
          toast.warning(
            `${file.name}: arquivo analisado, mas o storage recusou o anexo (${uploadError.message}).`,
          );
        }

        let headers: string[] = [];
        let parsedRows: Record<string, string>[] = [];
        let modulo: Dn4MigrationModule = 'nao_identificado';
        let status = 'aguardando_conferencia';
        let mensagem = '';

        if (
          ext === 'csv' ||
          file.type.includes('csv') ||
          file.name.toLowerCase().endsWith('.txt')
        ) {
          const parsed = parseCsv(await file.text());
          headers = parsed.headers;
          parsedRows = parsed.rows;
          modulo = detectDn4Module(headers, parsedRows, file.name);
          mensagem = `${parsedRows.length} registro(s) lido(s) por parser tabular.`;
        } else if (['xls', 'xlsx'].includes(ext)) {
          const parsed = await parseSpreadsheetFile(file);
          headers = parsed.headers;
          parsedRows = parsed.rows;
          modulo = detectDn4Module(headers, parsedRows, file.name);
          status = parsedRows.length ? 'aguardando_conferencia' : 'erro_formato';
          mensagem = parsedRows.length
            ? `${parsedRows.length} registro(s) lido(s) por parser Excel.`
            : 'Nenhum registro util encontrado no Excel.';
        } else if (ext === 'pdf' || file.type.includes('pdf')) {
          const ocrToastId = `pdf-ocr-${Date.now()}`;
          toast.message('Processando PDF DN4...', { id: ocrToastId });
          const parsedPdf = await parseDn4ClientesPdf(file, (progress) =>
            toast.message(progress, { id: ocrToastId }),
          );
          toast.dismiss(ocrToastId);

          headers = [
            'codigo_dn4',
            'razao_social',
            'nome',
            'cnpj',
            'cpf',
            'cnpj_cpf',
            'inscricao_estadual',
            'endereco',
            'cidade',
            'uf',
            'cep',
          ];
          parsedRows = mapPdfRowsToGenericRows(parsedPdf.rows);
          modulo = parsedRows.length ? 'clientes' : 'nao_identificado';
          status = parsedRows.length ? 'aguardando_conferencia' : 'erro_formato';
          mensagem = parsedPdf.message;
        } else {
          status = 'erro_formato';
          mensagem = 'Formato nao reconhecido para migracao em massa.';
        }

        const mapping = suggestDn4Mapping(headers);
        const { data: fileRow, error: fileError } = await supabase
          .from('dn4_migracao_arquivos' as any)
          .insert({
            lote_id: lote.id,
            nome_arquivo: file.name,
            storage_path: uploadError ? null : path,
            tipo_detectado: modulo,
            status,
            cabecalhos: headers,
            mapeamento: mapping,
            total_lidos: parsedRows.length,
            total_validos: 0,
            total_erros: 0,
            mensagem,
          } as any)
          .select()
          .single();

        if (fileError) throw fileError;

        const staged = parsedRows.map((row, index) => {
          const mapped = buildMapped(row, mapping);
          const validation = validateRecord(modulo, mapped, seen);
          return {
            lote_id: lote.id,
            arquivo_id: (fileRow as any).id,
            modulo,
            linha: index + 2,
            status: validation.status,
            chave_principal: validation.key || null,
            dados_raw: row,
            dados_mapeados: mapped,
            erros: validation.errors,
          };
        });

        for (const chunk of toChunk(staged, 500)) {
          const { error: rowsError } = await supabase
            .from('dn4_migracao_registros' as any)
            .insert(chunk as any);
          if (rowsError) throw rowsError;
        }

        const validos = staged.filter((row) => row.status === 'pronto_para_migrar').length;
        const erros = staged.length - validos;
        await supabase
          .from('dn4_migracao_arquivos' as any)
          .update({ total_validos: validos, total_erros: erros } as any)
          .eq('id', (fileRow as any).id);

        await insertLog(
          lote.id,
          'arquivo_analisado',
          `${file.name}: ${parsedRows.length} registros lidos`,
          { modulo, validos, erros, mensagem },
        );

        // Resultado esperado: arquivos de clientes (PDF/CSV/TXT/XLSX) devem criar/atualizar automaticamente.
        if (modulo === 'clientes') {
          const { data: insertedRecords } = await supabase
            .from('dn4_migracao_registros' as any)
            .select('*')
            .eq('arquivo_id', (fileRow as any).id)
            .order('linha', { ascending: true });

          const report = await upsertClientsFromRecords(
            lote.id,
            ((insertedRecords as any[]) || []).map((item) => ({
              ...item,
              erros: item.erros || [],
              dados_raw: item.dados_raw || {},
              dados_mapeados: item.dados_mapeados || {},
            })) as MigrationRecord[],
          );

          setLastReport(report);
          toast.success(
            `${file.name}: criados ${report.criados}, atualizados ${report.atualizados}, ignorados ${report.ignorados}, erros ${report.erros}.`,
          );
        }
      }

      toast.success('Arquivos analisados em pre-migracao.');
      await loadCurrent();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao analisar arquivos DN4.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const updateFileMapping = async (file: MigrationFile, field: string, header: string) => {
    const mapeamento = { ...file.mapeamento, [field]: header };
    const { error } = await supabase
      .from('dn4_migracao_arquivos' as any)
      .update({ mapeamento } as any)
      .eq('id', file.id);
    if (error) return toast.error(error.message);
    setFiles((current) =>
      current.map((item) => (item.id === file.id ? { ...item, mapeamento } : item)),
    );
  };

  const reanalyzeFile = async (file: MigrationFile) => {
    if (!isAdmin) return toast.error('Somente admin pode executar migracao.');
    setBusy(true);
    try {
      const fileRecords = records.filter((record) => record.arquivo_id === file.id);
      const seen = new Set(
        records
          .filter((record) => record.arquivo_id !== file.id)
          .map((record) => `${record.modulo}:${record.chave_principal || ''}`),
      );

      const updated = fileRecords.map((record) => {
        const mapped = buildMapped(record.dados_raw as Record<string, string>, file.mapeamento);
        const validation = validateRecord(file.tipo_detectado, mapped, seen);
        return {
          ...record,
          modulo: file.tipo_detectado,
          dados_mapeados: mapped,
          status: validation.status,
          chave_principal: validation.key || null,
          erros: validation.errors,
        };
      });

      for (const record of updated) {
        await supabase
          .from('dn4_migracao_registros' as any)
          .update({
            modulo: record.modulo,
            dados_mapeados: record.dados_mapeados,
            status: record.status,
            chave_principal: record.chave_principal,
            erros: record.erros,
          } as any)
          .eq('id', record.id);
      }

      await supabase
        .from('dn4_migracao_arquivos' as any)
        .update({
          total_validos: updated.filter((r) => r.status === 'pronto_para_migrar').length,
          total_erros: updated.filter((r) => r.status !== 'pronto_para_migrar').length,
        } as any)
        .eq('id', file.id);

      if (batch) {
        await insertLog(batch.id, 'arquivo_reanalisado', `${file.nome_arquivo}: mapeamento aplicado`);
      }
      toast.success('Mapeamento reaplicado.');
      await loadCurrent();
    } finally {
      setBusy(false);
    }
  };

  const confirmMigration = async () => {
    if (!isAdmin || !batch) return toast.error('Somente admin pode executar migracao.');
    const ready = records.filter((record) => record.status === 'pronto_para_migrar').length;
    if (!ready) return toast.error('Nenhum registro pronto para migrar.');
    if (!window.confirm(`Confirmar migracao definitiva de ${ready} registro(s)?`)) return;

    setBusy(true);
    try {
      const report = await upsertClientsFromRecords(batch.id, records);
      setLastReport(report);

      const remaining = records.filter(
        (record) => record.status === 'pronto_para_migrar' && record.modulo !== 'clientes',
      ).length;

      if (remaining > 0) {
        const { data, error } = await supabase.rpc(
          'dn4_confirmar_migracao_lote' as any,
          { p_lote_id: batch.id } as any,
        );
        if (error) throw error;
        toast.success(
          `Migracao confirmada: ${(data as any)?.migrados || remaining} registro(s) auxiliares e clientes sincronizados.`,
        );
      } else {
        toast.success(
          `Clientes sincronizados -> criados ${report.criados}, atualizados ${report.atualizados}, ignorados ${report.ignorados}, erros ${report.erros}.`,
        );
      }

      await loadCurrent();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao confirmar migracao.');
    } finally {
      setBusy(false);
    }
  };

  const cancelMigration = async () => {
    if (!isAdmin || !batch) return;
    if (!window.confirm('Cancelar este lote de pre-migracao?')) return;
    await supabase
      .from('dn4_migracao_lotes' as any)
      .update({ status: 'cancelado', cancelado_em: new Date().toISOString() } as any)
      .eq('id', batch.id);
    await insertLog(batch.id, 'lote_cancelado', 'Pre-migracao cancelada pelo admin');
    toast.success('Lote cancelado.');
    await loadCurrent();
  };

  const summary = useMemo(() => {
    const byStatus = records.reduce<Record<string, number>>((acc, record) => {
      acc[record.status] = (acc[record.status] || 0) + 1;
      return acc;
    }, {});
    return {
      total: records.length,
      validos: byStatus.pronto_para_migrar || 0,
      erros: (byStatus.campo_obrigatorio_ausente || 0) + (byStatus.erro_formato || 0),
      duplicados: byStatus.duplicado || 0,
      pendentes: byStatus.pendente_vinculo || 0,
      migrados: byStatus.migrado_sucesso || 0,
      ignorados: byStatus.ignorado || 0,
    };
  }, [records]);

  const filteredRecords = records.filter(
    (record) =>
      (selectedFile === 'todos' || record.arquivo_id === selectedFile) &&
      (selectedModule === 'todos' || record.modulo === selectedModule),
  );

  const inconsistencies = filteredRecords.filter(
    (record) => record.status !== 'pronto_para_migrar' && record.status !== 'migrado_sucesso',
  );

  const exportInconsistencies = () =>
    downloadText(
      `INCONSISTENCIAS_MIGRACAO_DN4_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'arquivo;modulo;linha;status;chave;erros',
        ...inconsistencies.map((record) => {
          const file = files.find((item) => item.id === record.arquivo_id);
          return [
            file?.nome_arquivo || '',
            DN4_MODULE_LABELS[record.modulo],
            record.linha,
            DN4_STATUS_LABELS[record.status],
            record.chave_principal || '',
            record.erros.join(' | '),
          ].join(';');
        }),
      ].join('\n'),
    );

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="h-6 w-6 animate-spin inline" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DatabaseBackup className="h-6 w-6 text-primary" />
            Migracao DN4 - TOPAC RH PRO
          </h1>
          <p className="text-sm text-muted-foreground">
            Ferramenta unica de implantacao: pre-migracao, conferencia, validacao de vinculos e gravacao definitiva.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            ref={inputRef}
            type="file"
            multiple
            accept=".csv,.txt,.xls,.xlsx,.pdf"
            className="hidden"
            onChange={handleFiles}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={!isAdmin || busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4 mr-2" />
            )}
            Enviar arquivos DN4
          </Button>
          <Button variant="outline" onClick={loadCurrent} disabled={busy}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Analisar arquivos
          </Button>
          <Button variant="outline" onClick={exportInconsistencies} disabled={!records.length}>
            <Download className="h-4 w-4 mr-2" />
            Baixar inconsistencias
          </Button>
          <Button onClick={confirmMigration} disabled={!isAdmin || busy || !summary.validos}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Confirmar migracao
          </Button>
          <Button variant="destructive" onClick={cancelMigration} disabled={!isAdmin || !batch || busy}>
            <Trash2 className="h-4 w-4 mr-2" />
            Cancelar migracao
          </Button>
        </div>
      </div>

      {isDirector && !isAdmin && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm text-amber-100">
          Diretor pode visualizar relatorios da migracao, mas nao pode executar upload, confirmar ou cancelar lote.
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        {[
          ['Total lidos', summary.total],
          ['Validos', summary.validos],
          ['Duplicados', summary.duplicados],
          ['Pendentes', summary.pendentes],
          ['Ignorados', summary.ignorados],
          ['Erros', summary.erros],
          ['Migrados', summary.migrados],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <strong className="text-2xl font-display">{value}</strong>
          </Card>
        ))}
      </div>

      {lastReport && (
        <Card className="p-4 border-cyan-500/30 bg-cyan-500/5">
          <div className="text-sm font-semibold mb-2">Relatorio final da ultima execucao</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Criados:</span>{' '}
              <strong className="text-emerald-300">{lastReport.criados}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Atualizados:</span>{' '}
              <strong className="text-cyan-300">{lastReport.atualizados}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Ignorados:</span>{' '}
              <strong className="text-yellow-300">{lastReport.ignorados}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Erros:</span>{' '}
              <strong className="text-red-300">{lastReport.erros}</strong>
            </div>
          </div>
          {lastReport.motivos.length > 0 && (
            <div className="mt-3 space-y-1 text-xs text-amber-200">
              {lastReport.motivos.slice(0, 12).map((reason) => (
                <div key={reason} className="flex gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5" />
                  {reason}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Tabs defaultValue="resumo" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="resumo">Resumo geral</TabsTrigger>
          {MODULES.filter((m) => m !== 'nao_identificado').map((m) => (
            <TabsTrigger key={m} value={m}>
              {DN4_MODULE_LABELS[m]}
            </TabsTrigger>
          ))}
          <TabsTrigger value="erros">Erros/Pendencias</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              >
                <option value="todos">Todos os arquivos</option>
                {files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.nome_arquivo}
                  </option>
                ))}
              </select>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value as any)}
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              >
                <option value="todos">Todos os modulos</option>
                {MODULES.map((m) => (
                  <option key={m} value={m}>
                    {DN4_MODULE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Arquivo</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-center p-2">Lidos</th>
                    <th className="text-center p-2">Validos</th>
                    <th className="text-center p-2">Erros</th>
                    <th className="text-left p-2">Mapeamento</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.id} className="border-t border-border align-top">
                      <td className="p-2 font-medium">{file.nome_arquivo}</td>
                      <td className="p-2">{DN4_MODULE_LABELS[file.tipo_detectado]}</td>
                      <td className="p-2 text-center">{file.total_lidos}</td>
                      <td className="p-2 text-center text-emerald-300">{file.total_validos}</td>
                      <td className="p-2 text-center text-red-300">{file.total_erros}</td>
                      <td className="p-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto">
                          {CANONICAL_FIELDS.slice(0, 18).map((field) => (
                            <label key={field} className="text-xs flex items-center gap-2">
                              <span className="w-28 text-muted-foreground">{field}</span>
                              <select
                                value={file.mapeamento[field] || ''}
                                onChange={(e) => updateFileMapping(file, field, e.target.value)}
                                className="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1"
                                disabled={!isAdmin}
                              >
                                <option value="">-</option>
                                {file.cabecalhos.map((header) => (
                                  <option key={header} value={header}>
                                    {header}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reanalyzeFile(file)}
                          disabled={!isAdmin || busy}
                        >
                          Reanalisar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {MODULES.filter((m) => m !== 'nao_identificado').map((m) => (
          <TabsContent key={m} value={m}>
            <RecordsTable records={records.filter((r) => r.modulo === m)} files={files} />
          </TabsContent>
        ))}

        <TabsContent value="erros">
          <RecordsTable records={inconsistencies} files={files} />
        </TabsContent>

        <TabsContent value="log">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              Log da migracao
            </div>
            {log.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum log registrado.</p>
            ) : (
              log.map((line) => (
                <div key={line} className="text-xs font-mono border-b border-border py-1">
                  {line}
                </div>
              ))
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const RecordsTable: React.FC<{ records: MigrationRecord[]; files: MigrationFile[] }> = ({
  records,
  files,
}) => (
  <Card className="overflow-auto">
    <table className="w-full text-sm">
      <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
        <tr>
          <th className="text-left p-2">Arquivo</th>
          <th className="text-left p-2">Linha</th>
          <th className="text-left p-2">Chave</th>
          <th className="text-left p-2">Status</th>
          <th className="text-left p-2">Dados mapeados</th>
          <th className="text-left p-2">Erros/Pendencias</th>
        </tr>
      </thead>
      <tbody>
        {records.length === 0 ? (
          <tr>
            <td colSpan={6} className="p-8 text-center text-muted-foreground">
              Nenhum registro neste filtro.
            </td>
          </tr>
        ) : (
          records.slice(0, 300).map((record) => {
            const file = files.find((item) => item.id === record.arquivo_id);
            return (
              <tr key={record.id} className="border-t border-border align-top">
                <td className="p-2 max-w-[220px] truncate">{file?.nome_arquivo || '-'}</td>
                <td className="p-2">{record.linha}</td>
                <td className="p-2 font-mono text-xs">{record.chave_principal || '-'}</td>
                <td className="p-2">
                  <Badge variant="outline" className={STATUS_CLASS[record.status]}>
                    {DN4_STATUS_LABELS[record.status]}
                  </Badge>
                </td>
                <td className="p-2 text-xs max-w-[420px]">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(record.dados_mapeados, null, 2)}
                  </pre>
                </td>
                <td className="p-2 text-xs text-amber-200">
                  {record.erros?.length ? (
                    record.erros.map((error) => (
                      <div key={error} className="flex gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5" />
                        {error}
                      </div>
                    ))
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
    {records.length > 300 && (
      <div className="p-3 text-xs text-muted-foreground">
        Mostrando 300 de {records.length} registros. Use os filtros ou baixe inconsistencias.
      </div>
    )}
  </Card>
);

export default MigracaoDN4Page;
