import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

type Props = { companyCode: string; companyName: string };
type AnyRow = any[];

const cleanText = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\u00a0/g, ' ').trim();
  if (!text || ['#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NUM!'].includes(text)) return '';
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

const toOptionalNumber = (value: unknown): number | null => {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIsoDate = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    if (y < 2000) return '';
    return `${y}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 30000) return '';
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d && parsed.y >= 2000) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = cleanText(value);
  if (!text) return '';
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial < 30000) return '';
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed?.y && parsed?.m && parsed?.d && parsed.y >= 2000) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
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

const chunk = <T,>(rows: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
};

const deterministicLote = async (buffer: ArrayBuffer, companyCode: string) => {
  const salt = new TextEncoder().encode(`TOPAC-ALMOX-V3:${companyCode}:`);
  const source = new Uint8Array(buffer);
  const merged = new Uint8Array(salt.length + source.length);
  merged.set(salt, 0); merged.set(source, salt.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', merged));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const AlmoxarifadoExcelImporter: React.FC<Props> = ({ companyCode, companyName }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const sendBatch = async (lote: string, seq: number, tipo: string, payload: unknown) => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { data, error } = await supabase.functions.invoke('almoxarifado-import-xlsm-once', { body: { lote, seq, tipo, company_code: companyCode, payload } });
      if (!error && !(data as any)?.error) return data as any;
      lastError = new Error((data as any)?.error || error?.message || 'Falha na importação');
      await new Promise(resolve => window.setTimeout(resolve, attempt * 700));
    }
    throw lastError;
  };

  const handleExcel = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (!['xlsm', 'xlsx'].includes(ext || '')) throw new Error('Selecione a planilha Excel original (.xlsm ou .xlsx).');

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
    const estoqueRows = rowsOf(workbook, 'Estoque');
    const entradaRows = rowsOf(workbook, 'Entrada');
    const saidaRows = rowsOf(workbook, 'Saídas');
    const lote = await deterministicLote(buffer, companyCode);

    const entries = entradaRows.slice(1).map((r, index) => ({
      row: index + 2, codigo: cleanText(r[0]), descricao: cleanText(r[1]), data: toIsoDate(r[2]),
      responsavel: cleanText(r[3]), quantidade: toNumber(r[4]), nf: cleanText(r[5]),
      valor_unitario: toNumber(r[6]), valor_total: toNumber(r[7]), empresa_compra: cleanText(r[8]),
      emissao: toIsoDate(r[9]) || cleanText(r[9]), fornecedor: cleanText(r[10]), descricao_nf: cleanText(r[12]),
    })).filter(r => r.codigo && r.quantidade > 0);

    const exits = saidaRows.slice(1).map((r, index) => ({
      row: index + 2, codigo: cleanText(r[0]), descricao: cleanText(r[1]), data: toIsoDate(r[2]),
      mecanico: cleanText(r[3]), quantidade: toNumber(r[4]), patrimonio: cleanText(r[5]),
      ficha: cleanText(r[6]), utilizado: toOptionalNumber(r[9]), numero_serie: cleanText(r[10]),
    })).filter(r => r.codigo && r.quantidade > 0);

    const historyDescription = new Map<string, string>();
    [...entries, ...exits].forEach(r => { if (r.codigo && r.descricao && !historyDescription.has(r.codigo)) historyDescription.set(r.codigo, r.descricao); });

    const knownCodes = new Set<string>();
    const primarySeen = new Set<string>();
    const items = estoqueRows.slice(1).map((r, index) => {
      const codigo = cleanText(r[0]); const alternativo = cleanText(r[1]); const nome = cleanText(r[2]);
      if (!codigo || !nome) return null;
      const duplicate = primarySeen.has(codigo); primarySeen.add(codigo); knownCodes.add(codigo); if (alternativo) knownCodes.add(alternativo);
      const saldo = toNumber(r[9]); const valorEstoque = toNumber(r[3]);
      const observacoes: string[] = [];
      if (duplicate) observacoes.push(`Código TOPAC duplicado na planilha: ${codigo}; mantido como linha distinta pelo nome.`);
      return {
        row: index + 2, codigo_topac: codigo, codigo_alternativo: alternativo, codigo_sku: codigo, nome,
        categoria: '', aplicacao: cleanText(r[4]), unidade: 'un', saldo,
        minimo: toNumber(r[10]), valor_unitario: saldo > 0 && valorEstoque > 0 ? valorEstoque / saldo : 0,
        valor_estoque: valorEstoque, entrada_total: toNumber(r[5]), saida_total: toNumber(r[6]),
        ajuste_aumentar: toNumber(r[7]), ajuste_diminuir: toNumber(r[8]), status_planilha: cleanText(r[11]),
        ultimo_pedido: toIsoDate(r[12]), ultima_saida: toIsoDate(r[13]), localizacao: '', inativo: false,
        observacoes: observacoes.join(' | '),
      };
    }).filter(Boolean) as any[];

    let historicalRow = 1000000;
    historyDescription.forEach((descricao, codigo) => {
      if (knownCodes.has(codigo)) return;
      historicalRow += 1;
      items.push({ row: historicalRow, codigo_topac: codigo, codigo_alternativo: '', codigo_sku: codigo,
        nome: descricao || `Item histórico ${codigo}`, categoria: 'Histórico', aplicacao: 'Histórico', unidade: 'un',
        saldo: 0, minimo: 0, valor_unitario: 0, valor_estoque: 0, entrada_total: 0, saida_total: 0,
        ajuste_aumentar: 0, ajuste_diminuir: 0, status_planilha: '', ultimo_pedido: '', ultima_saida: '',
        localizacao: '', inativo: true, observacoes: 'Código encontrado somente no histórico; não pertence ao estoque ativo.' });
      knownCodes.add(codigo);
    });

    const totalSaldo = items.reduce((sum, item) => sum + toNumber(item.saldo), 0);
    const itemBatches = chunk(items, 300); const entryBatches = chunk(entries, 300); const exitBatches = chunk(exits, 250);

    setProgress(`Planilha validada: ${items.length.toLocaleString('pt-BR')} registros vinculados, ${entries.length.toLocaleString('pt-BR')} entradas e ${exits.length.toLocaleString('pt-BR')} saídas.`);
    for (let i = 0; i < itemBatches.length; i += 1) { setProgress(`Estoque ${i + 1}/${itemBatches.length}`); await sendBatch(lote, 1000 + i, 'items', itemBatches[i]); }
    for (let i = 0; i < entryBatches.length; i += 1) { setProgress(`Entradas ${i + 1}/${entryBatches.length} — ${entries.length.toLocaleString('pt-BR')}`); await sendBatch(lote, 2000 + i, 'entries', entryBatches[i]); }
    for (let i = 0; i < exitBatches.length; i += 1) { setProgress(`Saídas ${i + 1}/${exitBatches.length} — ${exits.length.toLocaleString('pt-BR')}`); await sendBatch(lote, 3000 + i, 'exits', exitBatches[i]); }

    setProgress('Conferindo saldo e contagens com a planilha...');
    const result = await sendBatch(lote, 9000, 'finalize', { items: items.length, entries: entries.length, exits: exits.length, total_saldo: totalSaldo });
    if (!result?.ok) throw new Error(`Importação incompleta. Registros ${result?.items}/${result?.expected_items}; entradas ${result?.entries}/${result?.expected_entries}; saídas ${result?.exits}/${result?.expected_exits}.`);
    toast.success(`Importação conferida: ${result.items} registros vinculados, ${result.entries} entradas e ${result.exits} saídas.`);
    setProgress('Importação concluída e validada. Atualizando...');
    window.setTimeout(() => window.location.reload(), 1000);
  };

  const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || busy) return;
    setBusy(true); setProgress('Lendo a planilha original...');
    try { await handleExcel(file); }
    catch (error: any) { console.error('[almoxarifado-import-excel]', error); toast.error(error?.message || 'Não foi possível importar a planilha. Você pode selecionar o mesmo arquivo novamente para retomar.'); setProgress('Importação interrompida — selecione a mesma planilha para continuar sem duplicar.'); }
    finally { setBusy(false); }
  };

  return <div className="no-print rounded-lg border border-primary/30 bg-primary/5 p-4">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><FileSpreadsheet className="w-5 h-5 text-primary" /></div>
        <div><div className="text-sm font-bold">Importar planilha oficial do Almoxarifado</div><div className="text-xs text-muted-foreground mt-1">Lê as abas Estoque, Entrada e Saídas e preserva a lógica da planilha para <strong>{companyName}</strong>.</div>{progress && <div className="text-xs font-medium mt-2 text-primary">{progress}</div>}</div></div>
      <div className="shrink-0"><input ref={inputRef} type="file" className="hidden" accept=".xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onChange} />
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}{busy ? 'Importando...' : 'Selecionar Excel (.XLSM)'}</Button></div>
    </div>
  </div>;
};

export default AlmoxarifadoExcelImporter;
