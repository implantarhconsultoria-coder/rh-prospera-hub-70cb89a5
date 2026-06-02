import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileText,
  FolderArchive,
  Loader2,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { extractPdfPagesText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import {
  analyzePaymentProof,
  buildPaymentDocumentName,
  formatBRL,
  formatCompetenciaFolder,
  isDuplicatePaymentDocument,
  safeFileName,
  tipoPagamentoLabel,
  type StatusComprovante,
  type TipoPagamento,
} from '@/lib/comprovantesPagamento';
import { buscarHistoricoFuncionario, registrarDocumento } from '@/lib/documentoHistorico';

type ReviewRow = {
  id: string;
  lote_id: string;
  nome_arquivo: string;
  storage_bucket: string;
  storage_path: string;
  texto_extraido: string;
  pagina: number;
  status: StatusComprovante;
  status_leitura: string;
  confianca: number;
  funcionario_id: string;
  funcionario_nome: string;
  company_id: string;
  empresa_nome: string;
  tipo_pagamento: TipoPagamento;
  competencia: string;
  valor: number;
  data_pagamento: string;
  cpf_detectado: string;
  cnpj_detectado: string;
  identificador: string;
  banco_origem: string;
  motivo_status: string;
  candidatos: any[];
  arquivado_documento_id?: string | null;
  ignorado?: boolean;
};

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const STATUS_LABEL: Record<StatusComprovante, string> = {
  reconhecido_seguro: 'Reconhecido com seguranca',
  possivel_correspondencia: 'Possivel correspondencia',
  nao_identificado: 'Nao identificado',
  duplicado: 'Duplicado',
  erro_leitura: 'Erro de leitura',
  arquivado: 'Arquivado',
  ignorado: 'Ignorado',
};

const STATUS_CLASS: Record<StatusComprovante, string> = {
  reconhecido_seguro: 'bg-success/20 text-success',
  possivel_correspondencia: 'bg-warning/20 text-warning',
  nao_identificado: 'bg-muted text-muted-foreground',
  duplicado: 'bg-destructive/15 text-destructive',
  erro_leitura: 'bg-destructive/15 text-destructive',
  arquivado: 'bg-emerald-500/20 text-emerald-400',
  ignorado: 'bg-muted text-muted-foreground',
};

const isSchemaMissing = (error: any) => {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === 'PGRST205' || msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('could not find');
};

const mapRow = (row: any): ReviewRow => ({
  id: row.id,
  lote_id: row.lote_id || '',
  nome_arquivo: row.nome_arquivo || '',
  storage_bucket: row.storage_bucket || 'documentos-funcionarios',
  storage_path: row.storage_path || '',
  texto_extraido: row.texto_extraido || '',
  pagina: Number(row.pagina) || 1,
  status: (row.status || 'nao_identificado') as StatusComprovante,
  status_leitura: row.status_leitura || 'pendente',
  confianca: Number(row.confianca) || 0,
  funcionario_id: row.funcionario_id || '',
  funcionario_nome: row.funcionario_nome || '',
  company_id: row.company_id || '',
  empresa_nome: row.empresa_nome || '',
  tipo_pagamento: (row.tipo_pagamento || 'outros') as TipoPagamento,
  competencia: row.competencia || new Date().toISOString().slice(0, 7),
  valor: Number(row.valor) || 0,
  data_pagamento: row.data_pagamento || '',
  cpf_detectado: row.cpf_detectado || '',
  cnpj_detectado: row.cnpj_detectado || '',
  identificador: row.identificador || '',
  banco_origem: row.banco_origem || '',
  motivo_status: row.motivo_status || '',
  candidatos: Array.isArray(row.candidatos) ? row.candidatos : [],
  arquivado_documento_id: row.arquivado_documento_id || null,
  ignorado: row.ignorado || false,
});

const rowPayload = (row: ReviewRow) => ({
  status: row.status,
  status_leitura: row.status_leitura,
  confianca: row.confianca,
  funcionario_id: row.funcionario_id || null,
  funcionario_nome: row.funcionario_nome || '',
  company_id: row.company_id || null,
  empresa_nome: row.empresa_nome || '',
  tipo_pagamento: row.tipo_pagamento || 'outros',
  competencia: row.competencia || '',
  valor: Number(row.valor) || 0,
  data_pagamento: row.data_pagamento || null,
  cpf_detectado: row.cpf_detectado || '',
  cnpj_detectado: row.cnpj_detectado || '',
  identificador: row.identificador || '',
  banco_origem: row.banco_origem || '',
  motivo_status: row.motivo_status || '',
  candidatos: row.candidatos || [],
  ignorado: row.ignorado || false,
});

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const ComprovantesPagamentoPage: React.FC = () => {
  const { employees, companies, session, userRoles, directorCanAccessPath } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [lastError, setLastError] = useState('');

  const isDirector = userRoles.includes('diretor_geral') || userRoles.includes('diretor');
  const canManage = userRoles.includes('admin') ||
    userRoles.includes('financeiro') ||
    userRoles.includes('faturamento') ||
    userRoles.includes('filial_matriz') ||
    userRoles.includes('filial_praia') ||
    userRoles.includes('filial_goiania');
  const canView = canManage || (isDirector && directorCanAccessPath('/admin/comprovantes-pagamento'));

  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const companiesById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);

  const resumo = useMemo(() => ({
    total: rows.length,
    seguros: rows.filter((row) => row.status === 'reconhecido_seguro').length,
    pendentes: rows.filter((row) => ['possivel_correspondencia', 'nao_identificado', 'erro_leitura', 'duplicado'].includes(row.status)).length,
    arquivados: rows.filter((row) => row.status === 'arquivado').length,
  }), [rows]);

  const carregarPendentes = async () => {
    if (!canView) return;
    setLoadingRows(true);
    try {
      const { data, error } = await (supabase as any)
        .from('comprovantes_pagamento_staging')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) {
        if (isSchemaMissing(error)) {
          setLastError('A migration de comprovantes de pagamento ainda nao foi aplicada no Supabase.');
          return;
        }
        throw error;
      }
      setRows((data || []).map(mapRow));
    } catch (error: any) {
      console.error('Erro ao carregar comprovantes em conferencia:', error);
      setLastError(error?.message || 'Nao foi possivel carregar a conferencia.');
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    carregarPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  const runOcrFallback = async (bytes: Uint8Array) => {
    if (!ocrEnabled) return '';
    try {
      const { pageUrls } = await renderPdfPagesToDataUrls(bytes, 1.5, 2);
      if (!pageUrls.length) return '';
      const tesseract = await import('tesseract.js');
      const texts: string[] = [];
      for (const url of pageUrls) {
        try {
          const result = await tesseract.recognize(url, 'por');
          texts.push(result.data.text || '');
        } catch {
          const result = await tesseract.recognize(url, 'eng');
          texts.push(result.data.text || '');
        }
      }
      return texts.join('\n').trim();
    } catch (error) {
      console.warn('OCR fallback falhou:', error);
      return '';
    }
  };

  const uploadStagingFile = async (file: File, loteId: string) => {
    const path = `comprovantes-pagamento/staging/${loteId}/${Date.now()}_${safeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from('documentos-funcionarios')
      .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
    if (error) throw error;
    return path;
  };

  const processarArquivos = async () => {
    if (!canManage) {
      toast.error('Seu perfil nao tem permissao para importar comprovantes.');
      return;
    }
    if (!files.length) {
      toast.error('Selecione um ou mais PDFs.');
      return;
    }

    setProcessing(true);
    setProgress(0);
    setLastError('');
    const createdRows: ReviewRow[] = [];

    try {
      const { data: lote, error: loteError } = await (supabase as any)
        .from('comprovantes_pagamento_lotes')
        .insert({
          usuario_id: session?.user?.id || null,
          usuario_nome: session?.user?.email || 'Sistema',
          total_arquivos: files.length,
          status: 'em_conferencia',
        })
        .select('*')
        .single();

      if (loteError) throw loteError;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          toast.warning(`${file.name}: ignorado, somente PDF e aceito neste fluxo.`);
          continue;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const storagePath = await uploadStagingFile(file, lote.id);
        let pages = await extractPdfPagesText(bytes);

        const textCount = pages.reduce((total, page) => total + page.text.trim().length, 0);
        if (textCount < 20) {
          const ocrText = await runOcrFallback(bytes);
          pages = [{ pageNumber: 1, text: ocrText }];
        }

        if (!pages.length) {
          pages = [{ pageNumber: 1, text: '' }];
        }

        for (const page of pages) {
          const analysis = analyzePaymentProof(page.text, employees, companies);
          let status = analysis.status;
          let motivo = analysis.motivo;

          if (analysis.employeeId) {
            const historico = await buscarHistoricoFuncionario(analysis.employeeId);
            if (isDuplicatePaymentDocument(historico, {
              tipoPagamento: analysis.type,
              competencia: analysis.competencia,
              valor: analysis.valor,
              dataPagamento: analysis.dataPagamento,
              identificador: analysis.identificador,
            })) {
              status = 'duplicado';
              motivo = 'Possivel duplicidade encontrada no historico do funcionario.';
            }
          }

          if (pages.length > 1) {
            motivo = `${motivo} Arquivo com multiplas paginas: conferir se esta pagina corresponde ao comprovante certo.`;
          }

          const payload = {
            lote_id: lote.id,
            nome_arquivo: file.name,
            storage_bucket: 'documentos-funcionarios',
            storage_path: storagePath,
            texto_extraido: page.text,
            pagina: page.pageNumber,
            status,
            status_leitura: page.text?.trim() ? 'texto_extraido' : 'erro_leitura',
            confianca: analysis.confidence,
            funcionario_id: analysis.employeeId || null,
            funcionario_nome: analysis.employeeName || '',
            company_id: analysis.companyId || null,
            empresa_nome: analysis.companyName || '',
            tipo_pagamento: analysis.type,
            competencia: analysis.competencia,
            valor: analysis.valor,
            data_pagamento: analysis.dataPagamento || null,
            cpf_detectado: analysis.cpfDetectado,
            cnpj_detectado: analysis.cnpjDetectado,
            identificador: analysis.identificador,
            banco_origem: analysis.bancoOrigem,
            motivo_status: motivo,
            candidatos: analysis.candidatos,
          };

          const { data: inserted, error: insertError } = await (supabase as any)
            .from('comprovantes_pagamento_staging')
            .insert(payload)
            .select('*')
            .single();
          if (insertError) throw insertError;
          createdRows.push(mapRow(inserted));
        }

        setProgress(Math.round(((index + 1) / files.length) * 100));
      }

      setRows((current) => [...createdRows, ...current]);
      setFiles([]);
      toast.success(`${createdRows.length} comprovante(s) enviados para conferencia.`);
    } catch (error: any) {
      console.error('Erro ao processar comprovantes:', error);
      const message = isSchemaMissing(error)
        ? 'A migration de comprovantes de pagamento precisa estar aplicada no Supabase.'
        : (error?.message || 'Nao foi possivel processar os comprovantes.');
      setLastError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const updateLocal = (rowId: string, patch: Partial<ReviewRow>) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const persistRow = async (row: ReviewRow) => {
    const { error } = await (supabase as any)
      .from('comprovantes_pagamento_staging')
      .update(rowPayload(row))
      .eq('id', row.id);
    if (error) throw error;
  };

  const persistCurrentRow = async (rowId: string, fallback: ReviewRow) => {
    const current = rows.find((item) => item.id === rowId) || fallback;
    await persistRow(current);
  };

  const setFuncionario = async (row: ReviewRow, funcionarioId: string) => {
    const employee = employeesById.get(funcionarioId);
    const company = employee ? companiesById.get(employee.companyId) : null;
    const next: ReviewRow = {
      ...row,
      funcionario_id: employee?.id || '',
      funcionario_nome: employee?.name || '',
      company_id: company?.id || '',
      empresa_nome: company?.name || '',
      status: employee ? (row.status === 'erro_leitura' ? 'possivel_correspondencia' : row.status) : 'nao_identificado',
      motivo_status: employee ? 'Funcionario alterado manualmente para conferencia.' : row.motivo_status,
    };
    updateLocal(row.id, next);
    await persistRow(next);
  };

  const setCompany = async (row: ReviewRow, companyId: string) => {
    const company = companiesById.get(companyId);
    const next = {
      ...row,
      company_id: company?.id || '',
      empresa_nome: company?.name || '',
      motivo_status: company ? 'Empresa alterada manualmente para conferencia.' : row.motivo_status,
    };
    updateLocal(row.id, next);
    await persistRow(next);
  };

  const confirmar = async (row: ReviewRow) => {
    if (!row.funcionario_id || !row.company_id) {
      toast.error('Escolha funcionario e empresa antes de confirmar.');
      return;
    }
    try {
      const next = {
        ...row,
        status: 'reconhecido_seguro' as StatusComprovante,
        status_leitura: 'conferido',
        confianca: Math.max(80, row.confianca),
        motivo_status: 'Conferido manualmente pelo usuario.',
      };
      updateLocal(row.id, next);
      await persistRow(next);
      toast.success('Comprovante confirmado.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel confirmar.');
    }
  };

  const ignorar = async (row: ReviewRow) => {
    try {
      const next = {
        ...row,
        status: 'ignorado' as StatusComprovante,
        ignorado: true,
        motivo_status: 'Ignorado na conferencia.',
      };
      updateLocal(row.id, next);
      await persistRow(next);
      toast.success('Comprovante ignorado.');
    } catch (error: any) {
      toast.error(error?.message || 'Nao foi possivel ignorar.');
    }
  };

  const arquivar = async (row: ReviewRow) => {
    if (!canManage) {
      toast.error('Seu perfil nao tem permissao para arquivar comprovantes.');
      return;
    }
    if (!row.funcionario_id || !row.company_id) {
      toast.error('Escolha funcionario e empresa antes de arquivar.');
      return;
    }
    if (row.status === 'duplicado') {
      toast.error('Este comprovante esta marcado como duplicado. Altere os dados ou ignore o item.');
      return;
    }
    if (row.status !== 'reconhecido_seguro' && !confirm('A confianca nao esta alta. Arquivar mesmo assim apos sua conferencia manual?')) {
      return;
    }

    try {
      const employee = employeesById.get(row.funcionario_id);
      const company = companiesById.get(row.company_id);
      if (!employee || !company) throw new Error('Funcionario ou empresa nao localizado.');

      const historico = await buscarHistoricoFuncionario(employee.id);
      if (isDuplicatePaymentDocument(historico, {
        tipoPagamento: row.tipo_pagamento,
        competencia: row.competencia,
        valor: row.valor,
        dataPagamento: row.data_pagamento,
        identificador: row.identificador,
      })) {
        const duplicate = { ...row, status: 'duplicado' as StatusComprovante, motivo_status: 'Duplicidade encontrada antes do arquivamento.' };
        updateLocal(row.id, duplicate);
        await persistRow(duplicate);
        toast.error('Duplicidade detectada no historico do funcionario.');
        return;
      }

      const folder = formatCompetenciaFolder(row.competencia);
      const subcategoria = tipoPagamentoLabel(row.tipo_pagamento);
      const nomeArquivo = buildPaymentDocumentName(company.name, employee.name, row.tipo_pagamento, row.competencia);

      const document = await registrarDocumento({
        funcionarioId: employee.id,
        funcionarioNome: employee.name,
        companyId: company.id,
        empresaNome: company.name,
        tipoDocumento: 'COMPROVANTE DE PAGAMENTO',
        categoria: 'COMPROVANTE DE PAGAMENTO',
        origem: 'importacao_comprovante_pagamento',
        competencia: row.competencia,
        descricao: `${folder} / ${subcategoria} - ${formatBRL(row.valor)}`,
        observacao: row.motivo_status || `Comprovante importado em lote: ${row.nome_arquivo}`,
        arquivoUrl: row.storage_path,
        storageBucket: row.storage_bucket || 'documentos-funcionarios',
        storagePath: row.storage_path,
        nomeArquivo,
        dataDocumento: new Date().toISOString(),
        geradoPorUserId: session?.user?.id || ZERO_UUID,
        geradoPorNome: session?.user?.email || 'Sistema',
        unidade: company.name,
        pastaCompetencia: folder,
        subcategoria,
        tipoPagamento: row.tipo_pagamento,
        valorDocumento: row.valor,
        dataPagamento: row.data_pagamento || undefined,
        identificadorDocumento: row.identificador,
        origemImportacaoId: row.id,
        metadata: {
          nome_arquivo_original: row.nome_arquivo,
          pagina: row.pagina,
          cpf_detectado: row.cpf_detectado,
          cnpj_detectado: row.cnpj_detectado,
          banco_origem: row.banco_origem,
          confianca: row.confianca,
        },
      });

      const next = {
        ...row,
        status: 'arquivado' as StatusComprovante,
        arquivado_documento_id: document?.id || null,
        status_leitura: 'arquivado',
        motivo_status: 'Arquivado no historico documental do funcionario.',
      };
      updateLocal(row.id, next);
      await (supabase as any)
        .from('comprovantes_pagamento_staging')
        .update({
          ...rowPayload(next),
          arquivado_documento_id: document?.id || null,
          conferido_por: session?.user?.id || null,
          conferido_por_nome: session?.user?.email || 'Sistema',
          conferido_em: new Date().toISOString(),
        })
        .eq('id', row.id);
      toast.success('Comprovante arquivado no historico do funcionario.');
    } catch (error: any) {
      console.error('Erro ao arquivar comprovante:', error);
      toast.error(error?.message || 'Nao foi possivel arquivar.');
    }
  };

  const arquivarTodosSeguros = async () => {
    const seguros = rows.filter((row) => row.status === 'reconhecido_seguro' && !row.arquivado_documento_id);
    if (!seguros.length) {
      toast.info('Nenhum comprovante seguro pendente para arquivar.');
      return;
    }
    for (const row of seguros) {
      // eslint-disable-next-line no-await-in-loop
      await arquivar(row);
    }
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-warning mt-1" />
          <div>
            <h1 className="text-lg font-semibold">Acesso restrito</h1>
            <p className="text-sm text-muted-foreground">Somente Admin, RH autorizado ou Financeiro podem acessar comprovantes de pagamento.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderArchive className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Comprovantes de Pagamento</h1>
              <p className="text-sm text-muted-foreground">Upload em lote, leitura automatica, conferencia e arquivamento por funcionario.</p>
            </div>
          </div>
          <Button variant="outline" onClick={carregarPendentes} disabled={loadingRows}>
            {loadingRows ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Atualizar conferencia
          </Button>
        </div>
      </div>

      {lastError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          <span>{lastError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Total</p><p className="text-2xl font-bold">{resumo.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Seguros</p><p className="text-2xl font-bold text-success">{resumo.seguros}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Pendentes</p><p className="text-2xl font-bold text-warning">{resumo.pendentes}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground uppercase">Arquivados</p><p className="text-2xl font-bold text-emerald-400">{resumo.arquivados}</p></CardContent></Card>
      </div>

      {canManage && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Upload className="w-4 h-4 text-primary" />
              Upload em lote
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 items-end">
              <Input
                type="file"
                multiple
                accept=".pdf,application/pdf"
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={ocrEnabled} onChange={(event) => setOcrEnabled(event.target.checked)} />
                Usar OCR quando o PDF nao tiver texto
              </label>
              <Button onClick={processarArquivos} disabled={processing || !files.length}>
                {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Processar PDFs
              </Button>
            </div>
            {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s).</p>}
            {processing && <Progress value={progress} className="h-2" />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="font-semibold">Conferencia antes de arquivar</h2>
              <p className="text-xs text-muted-foreground">Baixa confianca, duplicidade ou falta de CPF ficam pendentes para revisao manual.</p>
            </div>
            {canManage && (
              <Button variant="outline" onClick={arquivarTodosSeguros}>
                <Archive className="w-4 h-4 mr-2" />
                Arquivar todos seguros
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum comprovante em conferencia.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const employeeOptions = row.company_id
                  ? employees.filter((employee) => employee.companyId === row.company_id)
                  : employees;
                return (
                  <div key={row.id} className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-sm">{row.nome_arquivo}</span>
                          {row.pagina > 1 && <Badge variant="outline">Pagina {row.pagina}</Badge>}
                          <Badge className={STATUS_CLASS[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                          <Badge variant="outline">{row.confianca}%</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{row.motivo_status || 'Aguardando conferencia.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canManage && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => confirmar(row)} disabled={row.status === 'arquivado' || row.status === 'ignorado'}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar
                            </Button>
                            <Button size="sm" onClick={() => arquivar(row)} disabled={row.status === 'arquivado' || row.status === 'ignorado'}>
                              <Archive className="w-4 h-4 mr-1" /> Arquivar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => ignorar(row)} disabled={row.status === 'arquivado' || row.status === 'ignorado'}>
                              <XCircle className="w-4 h-4 mr-1" /> Ignorar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Funcionario sugerido</label>
                        <select
                          value={row.funcionario_id}
                          onChange={(event) => setFuncionario(row, event.target.value)}
                          disabled={!canManage || row.status === 'arquivado'}
                          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                        >
                          <option value="">Selecionar funcionario</option>
                          {employeeOptions.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.name} - {employee.cpf || 'CPF pendente'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Empresa sugerida</label>
                        <select
                          value={row.company_id}
                          onChange={(event) => setCompany(row, event.target.value)}
                          disabled={!canManage || row.status === 'arquivado'}
                          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                        >
                          <option value="">Selecionar empresa</option>
                          {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Tipo de pagamento</label>
                        <select
                          value={row.tipo_pagamento}
                          onChange={(event) => {
                            const next = { ...row, tipo_pagamento: event.target.value as TipoPagamento };
                            updateLocal(row.id, next);
                            persistRow(next).catch((error) => toast.error(error?.message || 'Erro ao salvar tipo.'));
                          }}
                          disabled={!canManage || row.status === 'arquivado'}
                          className="w-full border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                        >
                          <option value="adiantamento">Adiantamento</option>
                          <option value="salario">Salario</option>
                          <option value="outros">Outros</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Competencia</label>
                        <Input
                          type="month"
                          value={row.competencia}
                          disabled={!canManage || row.status === 'arquivado'}
                          onChange={(event) => {
                            const next = { ...row, competencia: event.target.value };
                            updateLocal(row.id, next);
                            persistRow(next).catch((error) => toast.error(error?.message || 'Erro ao salvar competencia.'));
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Valor</label>
                        <Input
                          value={row.valor ? String(row.valor).replace('.', ',') : ''}
                          placeholder="0,00"
                          disabled={!canManage || row.status === 'arquivado'}
                          onChange={(event) => {
                            const raw = event.target.value.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
                            updateLocal(row.id, { valor: Number(raw) || 0 });
                          }}
                          onBlur={() => persistCurrentRow(row.id, row).catch((error) => toast.error(error?.message || 'Erro ao salvar valor.'))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Data do pagamento</label>
                        <Input
                          type="date"
                          value={row.data_pagamento || ''}
                          disabled={!canManage || row.status === 'arquivado'}
                          onChange={(event) => {
                            const next = { ...row, data_pagamento: event.target.value };
                            updateLocal(row.id, next);
                            persistRow(next).catch((error) => toast.error(error?.message || 'Erro ao salvar data.'));
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">CPF detectado</label>
                        <Input value={row.cpf_detectado || '-'} readOnly />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Identificador</label>
                        <Input
                          value={row.identificador}
                          disabled={!canManage || row.status === 'arquivado'}
                          onChange={(event) => updateLocal(row.id, { identificador: event.target.value })}
                          onBlur={() => persistCurrentRow(row.id, row).catch((error) => toast.error(error?.message || 'Erro ao salvar identificador.'))}
                        />
                      </div>
                    </div>

                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Ver leitura e candidatos</summary>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        <Textarea value={(row.texto_extraido || '').slice(0, 3000)} readOnly className="min-h-[120px] text-xs" />
                        <div className="rounded-lg border border-border p-3 space-y-2">
                          <p className="font-semibold">Candidatos</p>
                          {row.candidatos?.length ? row.candidatos.map((candidate: any) => (
                            <div key={candidate.employeeId} className="flex items-center justify-between gap-2">
                              <span>{candidate.employeeName}</span>
                              <Badge variant="outline">{candidate.score}%</Badge>
                            </div>
                          )) : <p className="text-muted-foreground">Nenhum candidato encontrado.</p>}
                          <p className="text-muted-foreground">Pasta final: {formatCompetenciaFolder(row.competencia)} / {tipoPagamentoLabel(row.tipo_pagamento)}</p>
                          <p className="text-muted-foreground">Data da conferencia: {todayIsoDate()}</p>
                        </div>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ComprovantesPagamentoPage;
