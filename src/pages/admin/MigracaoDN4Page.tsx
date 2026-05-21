import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, FileUp, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { CANONICAL_FIELDS, DN4_MODULE_LABELS, DN4_STATUS_LABELS, Dn4MigrationModule, Dn4MigrationStatus, detectDn4Module, normalizeKeyValue, parseCsv, suggestDn4Mapping } from '@/lib/dn4Migration';

type MigrationBatch = { id: string; nome: string; status: string; criado_em: string; confirmado_em?: string | null };
type MigrationFile = { id: string; lote_id: string; nome_arquivo: string; storage_path?: string | null; tipo_detectado: Dn4MigrationModule; status: string; cabecalhos: string[]; mapeamento: Record<string, string>; total_lidos: number; total_validos: number; total_erros: number };
type MigrationRecord = { id: string; lote_id: string; arquivo_id: string; modulo: Dn4MigrationModule; status: Dn4MigrationStatus; linha: number; chave_principal?: string | null; dados_raw: Record<string, unknown>; dados_mapeados: Record<string, unknown>; erros: string[] };

const MODULES: Dn4MigrationModule[] = ['empresas','clientes','fornecedores','financeiro','contas_pagar','contas_receber','faturamento','notas_fiscais','frota','ativos','manutencoes','os_chamados','almoxarifado','abastecimentos','historico_operacional','nao_identificado'];
const REQUIRED_FIELDS: Partial<Record<Dn4MigrationModule, string[]>> = { empresas: ['cnpj','razao_social'], clientes: ['razao_social'], fornecedores: ['razao_social'], contas_pagar: ['fornecedor','valor'], contas_receber: ['cliente','valor'], faturamento: ['cliente','valor'], notas_fiscais: ['numero_nf'], frota: ['placa'], ativos: ['patrimonio'], manutencoes: ['placa','descricao'], os_chamados: ['numero_os'], abastecimentos: ['placa','data'], almoxarifado: ['descricao'] };
const STATUS_CLASS: Record<Dn4MigrationStatus, string> = { pronto_para_migrar: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', duplicado: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', pendente_vinculo: 'bg-orange-500/15 text-orange-300 border-orange-500/30', campo_obrigatorio_ausente: 'bg-red-500/15 text-red-300 border-red-500/30', erro_formato: 'bg-red-500/15 text-red-300 border-red-500/30', ignorado: 'bg-slate-500/15 text-slate-300 border-slate-500/30', migrado_sucesso: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' };

const buildMapped = (row: Record<string, string>, mapping: Record<string, string>) => Object.entries(mapping).reduce<Record<string, string>>((acc, [field, header]) => { if (header && row[header] !== undefined) acc[field] = row[header]; return acc; }, {});
const buildKey = (mapped: Record<string, string>) => normalizeKeyValue(mapped.cnpj || mapped.cpf || mapped.placa || mapped.numero_os || mapped.numero_nf || mapped.numero_documento || [mapped.data, mapped.valor, mapped.centro_custo].filter(Boolean).join('-'));
const validateRecord = (modulo: Dn4MigrationModule, mapped: Record<string, string>, seenKeys: Set<string>) => {
  const required = REQUIRED_FIELDS[modulo] || [];
  const errors = required.filter((field) => !String(mapped[field] || '').trim()).map((field) => `Campo obrigatorio ausente: ${field}`);
  const key = buildKey(mapped);
  if (modulo === 'nao_identificado') errors.push('Tipo de arquivo nao identificado pelo cabecalho.');
  if (!key) errors.push('Nenhuma chave principal encontrada.');
  if (key && seenKeys.has(`${modulo}:${key}`)) return { status: 'duplicado' as Dn4MigrationStatus, errors: ['Duplicidade dentro do lote.'], key };
  if (key) seenKeys.add(`${modulo}:${key}`);
  if (errors.length) return { status: (required.some((field) => errors.join(' ').includes(field)) ? 'campo_obrigatorio_ausente' : 'pendente_vinculo') as Dn4MigrationStatus, errors, key };
  return { status: 'pronto_para_migrar' as Dn4MigrationStatus, errors: [], key };
};
const downloadText = (filename: string, content: string) => { const blob = new Blob([content], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };

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

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    const { data: batches, error } = await supabase.from('dn4_migracao_lotes' as any).select('*').order('criado_em', { ascending: false }).limit(1);
    if (error) { setLoading(false); toast.error(error.message.includes('schema cache') ? 'A migration da tela Migracao DN4 ainda precisa ser aplicada.' : error.message); return; }
    const current = ((batches as any[]) || [])[0] || null;
    setBatch(current);
    if (current) {
      const [{ data: fileData }, { data: recordData }, { data: logData }] = await Promise.all([
        supabase.from('dn4_migracao_arquivos' as any).select('*').eq('lote_id', current.id).order('criado_em'),
        supabase.from('dn4_migracao_registros' as any).select('*').eq('lote_id', current.id).order('criado_em').limit(5000),
        supabase.from('dn4_migracao_logs' as any).select('acao,detalhe,criado_em').eq('lote_id', current.id).order('criado_em', { ascending: false }).limit(50),
      ]);
      setFiles(((fileData as any[]) || []).map((item) => ({ ...item, cabecalhos: item.cabecalhos || [], mapeamento: item.mapeamento || {} })));
      setRecords(((recordData as any[]) || []).map((item) => ({ ...item, erros: item.erros || [], dados_raw: item.dados_raw || {}, dados_mapeados: item.dados_mapeados || {} })));
      setLog(((logData as any[]) || []).map((item) => `${new Date(item.criado_em).toLocaleString('pt-BR')} - ${item.acao}: ${item.detalhe || ''}`));
    } else { setFiles([]); setRecords([]); setLog([]); }
    setLoading(false);
  }, []);
  useEffect(() => { loadCurrent(); }, [loadCurrent]);

  const ensureBatch = async () => {
    if (batch && batch.status !== 'cancelado' && batch.status !== 'concluido') return batch;
    const { data, error } = await supabase.from('dn4_migracao_lotes' as any).insert({ nome: `Migracao DN4 -> TOPAC RH PRO ${new Date().toLocaleDateString('pt-BR')}`, status: 'pre_migracao', criado_por: session?.user?.id } as any).select().single();
    if (error) throw error;
    setBatch(data as any);
    return data as MigrationBatch;
  };
  const insertLog = async (loteId: string, acao: string, detalhe: string, payload?: Record<string, unknown>) => supabase.from('dn4_migracao_logs' as any).insert({ lote_id: loteId, acao, detalhe, payload: payload || {}, criado_por: session?.user?.id } as any);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadFiles = Array.from(event.target.files || []);
    if (!uploadFiles.length) return;
    if (!isAdmin) return toast.error('Somente admin pode executar migracao.');
    setBusy(true);
    try {
      const lote = await ensureBatch();
      const seen = new Set(records.map((record) => `${record.modulo}:${record.chave_principal || ''}`).filter(Boolean));
      for (const file of uploadFiles) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const path = `${lote.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const { error: uploadError } = await supabase.storage.from('dn4-migracao').upload(path, file, { upsert: false });
        if (uploadError) toast.warning(`${file.name}: arquivo analisado, mas o storage recusou o anexo (${uploadError.message}).`);
        let headers: string[] = [], parsedRows: Record<string, string>[] = [], modulo: Dn4MigrationModule = 'nao_identificado', status = 'aguardando_conferencia', mensagem = '';
        if (ext === 'csv' || file.type.includes('csv') || file.name.toLowerCase().endsWith('.txt')) { const parsed = parseCsv(await file.text()); headers = parsed.headers; parsedRows = parsed.rows; modulo = detectDn4Module(headers); }
        else if (['xls','xlsx'].includes(ext)) { status = 'pendente_processador_excel'; mensagem = 'Arquivo Excel recebido. Converta/normalize pelo processador antes da gravacao definitiva.'; }
        else { status = 'erro_formato'; mensagem = 'Formato nao reconhecido para migracao em massa.'; }
        const mapping = suggestDn4Mapping(headers);
        const { data: fileRow, error: fileError } = await supabase.from('dn4_migracao_arquivos' as any).insert({ lote_id: lote.id, nome_arquivo: file.name, storage_path: uploadError ? null : path, tipo_detectado: modulo, status, cabecalhos: headers, mapeamento: mapping, total_lidos: parsedRows.length, total_validos: 0, total_erros: 0, mensagem } as any).select().single();
        if (fileError) throw fileError;
        const staged = parsedRows.map((row, index) => { const mapped = buildMapped(row, mapping); const validation = validateRecord(modulo, mapped, seen); return { lote_id: lote.id, arquivo_id: (fileRow as any).id, modulo, linha: index + 2, status: validation.status, chave_principal: validation.key || null, dados_raw: row, dados_mapeados: mapped, erros: validation.errors }; });
        for (let i = 0; i < staged.length; i += 500) { const { error: rowsError } = await supabase.from('dn4_migracao_registros' as any).insert(staged.slice(i, i + 500)); if (rowsError) throw rowsError; }
        const validos = staged.filter((row) => row.status === 'pronto_para_migrar').length;
        const erros = staged.length - validos;
        await supabase.from('dn4_migracao_arquivos' as any).update({ total_validos: validos, total_erros: erros } as any).eq('id', (fileRow as any).id);
        await insertLog(lote.id, 'arquivo_analisado', `${file.name}: ${parsedRows.length} registros lidos`, { modulo, validos, erros });
      }
      toast.success('Arquivos analisados em pre-migracao.');
      await loadCurrent();
    } catch (error: any) { toast.error(error.message || 'Erro ao analisar arquivos DN4.'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const updateFileMapping = async (file: MigrationFile, field: string, header: string) => {
    const mapeamento = { ...file.mapeamento, [field]: header };
    const { error } = await supabase.from('dn4_migracao_arquivos' as any).update({ mapeamento } as any).eq('id', file.id);
    if (error) return toast.error(error.message);
    setFiles((current) => current.map((item) => item.id === file.id ? { ...item, mapeamento } : item));
  };
  const reanalyzeFile = async (file: MigrationFile) => {
    if (!isAdmin) return toast.error('Somente admin pode executar migracao.');
    setBusy(true);
    try {
      const fileRecords = records.filter((record) => record.arquivo_id === file.id);
      const seen = new Set(records.filter((record) => record.arquivo_id !== file.id).map((record) => `${record.modulo}:${record.chave_principal || ''}`));
      const updated = fileRecords.map((record) => { const mapped = buildMapped(record.dados_raw as Record<string,string>, file.mapeamento); const validation = validateRecord(file.tipo_detectado, mapped, seen); return { ...record, modulo: file.tipo_detectado, dados_mapeados: mapped, status: validation.status, chave_principal: validation.key || null, erros: validation.errors }; });
      for (const record of updated) await supabase.from('dn4_migracao_registros' as any).update({ modulo: record.modulo, dados_mapeados: record.dados_mapeados, status: record.status, chave_principal: record.chave_principal, erros: record.erros } as any).eq('id', record.id);
      await supabase.from('dn4_migracao_arquivos' as any).update({ total_validos: updated.filter((r) => r.status === 'pronto_para_migrar').length, total_erros: updated.filter((r) => r.status !== 'pronto_para_migrar').length } as any).eq('id', file.id);
      if (batch) await insertLog(batch.id, 'arquivo_reanalisado', `${file.nome_arquivo}: mapeamento aplicado`);
      toast.success('Mapeamento reaplicado.'); await loadCurrent();
    } finally { setBusy(false); }
  };
  const confirmMigration = async () => {
    if (!isAdmin || !batch) return toast.error('Somente admin pode executar migracao.');
    const ready = records.filter((record) => record.status === 'pronto_para_migrar').length;
    if (!ready) return toast.error('Nenhum registro pronto para migrar.');
    if (!window.confirm(`Confirmar migracao definitiva de ${ready} registro(s)?`)) return;
    setBusy(true); const { data, error } = await supabase.rpc('dn4_confirmar_migracao_lote' as any, { p_lote_id: batch.id } as any); setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Migracao confirmada: ${(data as any)?.migrados || ready} registro(s).`); await loadCurrent();
  };
  const cancelMigration = async () => { if (!isAdmin || !batch) return; if (!window.confirm('Cancelar este lote de pre-migracao?')) return; await supabase.from('dn4_migracao_lotes' as any).update({ status: 'cancelado', cancelado_em: new Date().toISOString() } as any).eq('id', batch.id); await insertLog(batch.id, 'lote_cancelado', 'Pre-migracao cancelada pelo admin'); toast.success('Lote cancelado.'); await loadCurrent(); };

  const summary = useMemo(() => { const byStatus = records.reduce<Record<string, number>>((acc, record) => { acc[record.status] = (acc[record.status] || 0) + 1; return acc; }, {}); return { total: records.length, validos: byStatus.pronto_para_migrar || 0, erros: (byStatus.campo_obrigatorio_ausente || 0) + (byStatus.erro_formato || 0), duplicados: byStatus.duplicado || 0, pendentes: byStatus.pendente_vinculo || 0, migrados: byStatus.migrado_sucesso || 0 }; }, [records]);
  const filteredRecords = records.filter((record) => (selectedFile === 'todos' || record.arquivo_id === selectedFile) && (selectedModule === 'todos' || record.modulo === selectedModule));
  const inconsistencies = filteredRecords.filter((record) => record.status !== 'pronto_para_migrar' && record.status !== 'migrado_sucesso');
  const exportInconsistencies = () => downloadText(`INCONSISTENCIAS_MIGRACAO_DN4_${new Date().toISOString().slice(0,10)}.csv`, ['arquivo;modulo;linha;status;chave;erros', ...inconsistencies.map((record) => { const file = files.find((item) => item.id === record.arquivo_id); return [file?.nome_arquivo || '', DN4_MODULE_LABELS[record.modulo], record.linha, DN4_STATUS_LABELS[record.status], record.chave_principal || '', record.erros.join(' | ')].join(';'); })].join('\n'));
  if (loading) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold flex items-center gap-2"><DatabaseBackup className="h-6 w-6 text-primary" />Migracao DN4 - TOPAC RH PRO</h1><p className="text-sm text-muted-foreground">Ferramenta unica de implantacao: pre-migracao, conferencia, validacao de vinculos e gravacao definitiva.</p></div><div className="flex flex-wrap gap-2"><Input ref={inputRef} type="file" multiple accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={handleFiles} /><Button onClick={() => inputRef.current?.click()} disabled={!isAdmin || busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileUp className="h-4 w-4 mr-2" />}Enviar arquivos DN4</Button><Button variant="outline" onClick={loadCurrent} disabled={busy}><RotateCcw className="h-4 w-4 mr-2" />Analisar arquivos</Button><Button variant="outline" onClick={exportInconsistencies} disabled={!records.length}><Download className="h-4 w-4 mr-2" />Baixar inconsistencias</Button><Button onClick={confirmMigration} disabled={!isAdmin || busy || !summary.validos}><CheckCircle2 className="h-4 w-4 mr-2" />Confirmar migracao</Button><Button variant="destructive" onClick={cancelMigration} disabled={!isAdmin || !batch || busy}><Trash2 className="h-4 w-4 mr-2" />Cancelar migracao</Button></div></div>
    {isDirector && !isAdmin && <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm text-amber-100">Diretor pode visualizar relatorios da migracao, mas nao pode executar upload, confirmar ou cancelar lote.</Card>}
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">{[['Total lidos', summary.total], ['Validos', summary.validos], ['Duplicados', summary.duplicados], ['Pendentes', summary.pendentes], ['Erros', summary.erros], ['Migrados', summary.migrados]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><strong className="text-2xl font-display">{value}</strong></Card>)}</div>
    <Tabs defaultValue="resumo" className="space-y-4"><TabsList className="flex flex-wrap h-auto justify-start"><TabsTrigger value="resumo">Resumo geral</TabsTrigger>{MODULES.filter((m) => m !== 'nao_identificado').map((m) => <TabsTrigger key={m} value={m}>{DN4_MODULE_LABELS[m]}</TabsTrigger>)}<TabsTrigger value="erros">Erros/Pendencias</TabsTrigger><TabsTrigger value="log">Log</TabsTrigger></TabsList>
      <TabsContent value="resumo" className="space-y-4"><Card className="p-4 space-y-3"><div className="flex flex-wrap gap-2"><select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)} className="bg-background border border-border rounded px-3 py-2 text-sm"><option value="todos">Todos os arquivos</option>{files.map((file) => <option key={file.id} value={file.id}>{file.nome_arquivo}</option>)}</select><select value={selectedModule} onChange={(e) => setSelectedModule(e.target.value as any)} className="bg-background border border-border rounded px-3 py-2 text-sm"><option value="todos">Todos os modulos</option>{MODULES.map((m) => <option key={m} value={m}>{DN4_MODULE_LABELS[m]}</option>)}</select></div><div className="overflow-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground bg-muted/40"><tr><th className="text-left p-2">Arquivo</th><th className="text-left p-2">Tipo</th><th className="text-center p-2">Lidos</th><th className="text-center p-2">Validos</th><th className="text-center p-2">Erros</th><th className="text-left p-2">Mapeamento</th><th className="p-2" /></tr></thead><tbody>{files.map((file) => <tr key={file.id} className="border-t border-border align-top"><td className="p-2 font-medium">{file.nome_arquivo}</td><td className="p-2">{DN4_MODULE_LABELS[file.tipo_detectado]}</td><td className="p-2 text-center">{file.total_lidos}</td><td className="p-2 text-center text-emerald-300">{file.total_validos}</td><td className="p-2 text-center text-red-300">{file.total_erros}</td><td className="p-2"><div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto">{CANONICAL_FIELDS.slice(0,18).map((field) => <label key={field} className="text-xs flex items-center gap-2"><span className="w-28 text-muted-foreground">{field}</span><select value={file.mapeamento[field] || ''} onChange={(e) => updateFileMapping(file, field, e.target.value)} className="min-w-0 flex-1 bg-background border border-border rounded px-2 py-1" disabled={!isAdmin}><option value="">-</option>{file.cabecalhos.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div></td><td className="p-2 text-right"><Button size="sm" variant="outline" onClick={() => reanalyzeFile(file)} disabled={!isAdmin || busy}>Reanalisar</Button></td></tr>)}</tbody></table></div></Card></TabsContent>
      {MODULES.filter((m) => m !== 'nao_identificado').map((m) => <TabsContent key={m} value={m}><RecordsTable records={records.filter((r) => r.modulo === m)} files={files} /></TabsContent>)}
      <TabsContent value="erros"><RecordsTable records={inconsistencies} files={files} /></TabsContent>
      <TabsContent value="log"><Card className="p-4 space-y-2"><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" />Log da migracao</div>{log.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum log registrado.</p> : log.map((line) => <div key={line} className="text-xs font-mono border-b border-border py-1">{line}</div>)}</Card></TabsContent>
    </Tabs>
  </div>;
};

const RecordsTable: React.FC<{ records: MigrationRecord[]; files: MigrationFile[] }> = ({ records, files }) => <Card className="overflow-auto"><table className="w-full text-sm"><thead className="text-xs uppercase text-muted-foreground bg-muted/40"><tr><th className="text-left p-2">Arquivo</th><th className="text-left p-2">Linha</th><th className="text-left p-2">Chave</th><th className="text-left p-2">Status</th><th className="text-left p-2">Dados mapeados</th><th className="text-left p-2">Erros/Pendencias</th></tr></thead><tbody>{records.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum registro neste filtro.</td></tr> : records.slice(0,300).map((record) => { const file = files.find((item) => item.id === record.arquivo_id); return <tr key={record.id} className="border-t border-border align-top"><td className="p-2 max-w-[220px] truncate">{file?.nome_arquivo || '-'}</td><td className="p-2">{record.linha}</td><td className="p-2 font-mono text-xs">{record.chave_principal || '-'}</td><td className="p-2"><Badge variant="outline" className={STATUS_CLASS[record.status]}>{DN4_STATUS_LABELS[record.status]}</Badge></td><td className="p-2 text-xs max-w-[420px]"><pre className="whitespace-pre-wrap">{JSON.stringify(record.dados_mapeados, null, 2)}</pre></td><td className="p-2 text-xs text-amber-200">{record.erros?.length ? record.erros.map((error) => <div key={error} className="flex gap-1"><AlertTriangle className="h-3 w-3 mt-0.5" />{error}</div>) : '-'}</td></tr>; })}</tbody></table>{records.length > 300 && <div className="p-3 text-xs text-muted-foreground">Mostrando 300 de {records.length} registros. Use os filtros ou baixe inconsistencias.</div>}</Card>;

export default MigracaoDN4Page;
