import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type Props = {
  companyCode: string;
  companyName: string;
};

type AnyRow = any[];

const cleanText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\u00a0/g, ' ').trim();
  if (!text || text === '#REF!' || text === '#N/A' || text === '#VALUE!') return '';
  return text;
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cleanText(value);
  if (!text) return 0;
  const normalized = text.includes(',') && !text.includes('.')
    ? text.replace(',', '.')
    : text.replace(/\s/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDate = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = cleanText(value);
  if (!text) return '';
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const parsed = XLSX.SSF.parse_date_code(Number(text));
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return '';
};

const rowsOf = (workbook: XLSX.WorkBook, sheetName: string): AnyRow[] => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Aba obrigatória não encontrada: ${sheetName}`);
  return XLSX.utils.sheet_to_json<AnyRow>(sheet, { header: 1, defval: null, raw: true });
};

const chunk = <T,>(rows: T[], size = 500) => {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
};

const deterministicLote = async (buffer: ArrayBuffer, companyCode: string) => {
  const salt = new TextEncoder().encode(`TOPAC-ALMOX:${companyCode}:`);
  const source = new Uint8Array(buffer);
  const merged = new Uint8Array(salt.length + source.length);
  merged.set(salt, 0);
  merged.set(source, salt.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', merged));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const AlmoxarifadoExcelImporter: React.FC<Props> = ({ companyCode, companyName }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const sendBatch = async (lote: string, seq: number, tipo: string, payload: unknown) => {
    const { data, error } = await supabase.functions.invoke('almoxarifado-import-xlsm-once', {
      body: { lote, seq, tipo, company_code: companyCode, payload },
    });
    if (error) throw new Error((data as any)?.error || error.message || 'Falha na importação');
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const handleExcel = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['xlsm', 'xlsx'].includes(ext || '')) {
      throw new Error('Selecione a planilha Excel original (.xlsm ou .xlsx).');
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
    const estoqueRows = rowsOf(workbook, 'Estoque');
    const entradaRows = rowsOf(workbook, 'Entrada');
    const saidaRows = rowsOf(workbook, 'Saídas');
    const lote = await deterministicLote(buffer, companyCode);

    const entries = entradaRows.slice(1).map((r, index) => ({
      row: index + 2,
      codigo: cleanText(r[0]),
      descricao: cleanText(r[1]),
      data: toIsoDate(r[2]),
      responsavel: cleanText(r[3]),
      quantidade: toNumber(r[4]),
      nf: cleanText(r[5]),
      valor_unitario: toNumber(r[6]),
      valor_total: toNumber(r[7]),
      empresa_compra: cleanText(r[8]),
      emissao: toIsoDate(r[9]) || cleanText(r[9]),
      fornecedor: cleanText(r[10]),
      descricao_nf: cleanText(r[12]),
    })).filter(r => r.codigo && r.quantidade > 0);

    const exits = saidaRows.slice(1).map((r, index) => ({
      row: index + 2,
      codigo: cleanText(r[0]),
      descricao: cleanText(r[1]),
      data: toIsoDate(r[2]),
      mecanico: cleanText(r[3]),
      quantidade: toNumber(r[4]),
      patrimonio: cleanText(r[5]),
      ficha: cleanText(r[6]),
      utilizado: cleanText(r[9]),
      numero_serie: cleanText(r[10]),
    })).filter(r => r.codigo && r.quantidade > 0);

    const historyDescription = new Map<string, string>();
    [...entries, ...exits].forEach(r => {
      if (r.codigo && r.descricao && !historyDescription.has(r.codigo)) historyDescription.set(r.codigo, r.descricao);
    });

    const knownCodes = new Set<string>();
    const primarySeen = new Set<string>();
    const items = estoqueRows.slice(1).map((r, index) => {
      const codigo = cleanText(r[0]);
      const alternativo = cleanText(r[1]);
      const nome = cleanText(r[2]);
      if (!codigo || !nome) return null;
      const duplicate = primarySeen.has(codigo);
      primarySeen.add(codigo);
      knownCodes.add(codigo);
      if (alternativo) knownCodes.add(alternativo);
      const aumentar = toNumber(r[7]);
      const diminuir = toNumber(r[8]);
      const obs: string[] = [];
      if (aumentar) obs.push(`Aumentar na planilha: ${aumentar}`);
      if (diminuir) obs.push(`Diminuir na planilha: ${diminuir}`);
      if (duplicate) obs.push(`Código duplicado na planilha: ${codigo}`);
      return {
        row: index + 2,
        codigo_topac: codigo,
        codigo_alternativo: alternativo,
        codigo_sku: codigo,
        nome,
        categoria: cleanText(r[4]),
        aplicacao: cleanText(r[4]),
        unidade: 'un',
        saldo: toNumber(r[9]),
        minimo: toNumber(r[10]),
        valor_unitario: 0,
        localizacao: '',
        inativo: duplicate,
        observacoes: obs.join(' | '),
      };
    }).filter(Boolean) as any[];

    let historicalRow = 1000000;
    historyDescription.forEach((descricao, codigo) => {
      if (knownCodes.has(codigo)) return;
      historicalRow += 1;
      items.push({
        row: historicalRow,
        codigo_topac: codigo,
        codigo_alternativo: '',
        codigo_sku: codigo,
        nome: descricao || `Item histórico ${codigo}`,
        categoria: 'Histórico',
        aplicacao: 'Histórico',
        unidade: 'un',
        saldo: 0,
        minimo: 0,
        valor_unitario: 0,
        localizacao: '',
        inativo: true,
        observacoes: 'Código encontrado somente no histórico da planilha',
      });
      knownCodes.add(codigo);
    });

    const totalSaldo = items.reduce((sum, item) => sum + toNumber(item.saldo), 0);
    const itemBatches = chunk(items, 400);
    const entryBatches = chunk(entries, 500);
    const exitBatches = chunk(exits, 500);

    setProgress(`Preparando ${items.length.toLocaleString('pt-BR')} itens...`);
    for (let i = 0; i < itemBatches.length; i += 1) {
      setProgress(`Itens ${i + 1}/${itemBatches.length} — ${companyName}`);
      await sendBatch(lote, 1000 + i, 'items', itemBatches[i]);
    }

    for (let i = 0; i < entryBatches.length; i += 1) {
      setProgress(`Entradas ${i + 1}/${entryBatches.length} — ${entries.length.toLocaleString('pt-BR')} registros`);
      await sendBatch(lote, 2000 + i, 'entries', entryBatches[i]);
    }

    for (let i = 0; i < exitBatches.length; i += 1) {
      setProgress(`Saídas ${i + 1}/${exitBatches.length} — ${exits.length.toLocaleString('pt-BR')} registros`);
      await sendBatch(lote, 3000 + i, 'exits', exitBatches[i]);
    }

    setProgress('Validando saldo e quantidade de registros...');
    const result = await sendBatch(lote, 9000, 'finalize', {
      items: items.length,
      entries: entries.length,
      exits: exits.length,
      total_saldo: totalSaldo,
    });

    if (!result?.ok) {
      throw new Error(`Validação final não bateu. Itens ${result?.items}/${result?.expected_items}, entradas ${result?.entries}/${result?.expected_entries}, saídas ${result?.exits}/${result?.expected_exits}, saldo ${result?.total_saldo}/${result?.expected_total_saldo}.`);
    }

    toast.success(`Planilha importada: ${result.items} itens, ${result.entries} entradas e ${result.exits} saídas.`);
    setProgress('Importação concluída e validada. Atualizando tela...');
    window.setTimeout(() => window.location.reload(), 1200);
  };

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    setProgress('Lendo planilha Excel...');
    try {
      await handleExcel(file);
    } catch (error: any) {
      console.error('[almoxarifado-import-excel]', error);
      toast.error(error?.message || 'Não foi possível importar a planilha.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold">Importar planilha oficial do Almoxarifado</div>
            <div className="text-xs text-muted-foreground mt-1">
              Aceita Excel .XLSM/.XLSX e importa Estoque, Entrada e Saídas para <strong>{companyName}</strong>.
            </div>
            {progress && <div className="text-xs font-medium mt-2 text-primary">{progress}</div>}
          </div>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onChange}
          />
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {busy ? 'Importando...' : 'Selecionar Excel (.XLSM)'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AlmoxarifadoExcelImporter;
