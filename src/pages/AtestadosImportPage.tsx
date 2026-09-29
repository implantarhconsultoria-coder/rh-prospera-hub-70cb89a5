import React, { useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, User, Calendar, FileQuestion } from 'lucide-react';
import { toast } from 'sonner';
import { renderPdfPagesToDataUrls } from '@/lib/pdf';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

type StagingStatus = 'subindo' | 'processando' | 'ok' | 'manual' | 'erro';

interface AtestadoStaging {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  status: StagingStatus;
  erro?: string;
  // dados extraídos / editáveis
  ehAtestado: boolean;
  tipoDocumento: string;
  funcionarioId?: string;
  funcionarioNome?: string;
  empresaNome?: string;
  cpf?: string;
  dataInicio?: string;
  dataFim?: string;
  diasCobertos?: number;
  cid?: string;
  medico?: string;
  crm?: string;
  textoBruto?: string;
  confianca?: number;
  aplicarVR: boolean;
  aplicarVT: boolean;
  descricao?: string;
  classificacao?: string;
  dataDocumento?: string;
  horaInicio?: string;
  horaFim?: string;
  horasJustificadas?: number;
  acaoPonto?: 'abonar_dia' | 'abonar_intervalo' | 'nao_abonar' | 'revisar';
  parecer?: string;
}

const onlyDigits = (s: string) => (s || '').replace(/\D/g, '');
const TIPOS_DOC = ['Atestado Médico', 'Declaração de Comparecimento', 'Comparecimento Judicial', 'Documento de Identidade', 'Comprovante Comum', 'Recibo', 'Receita Médica', 'Outros'];

const tipoLabel = (tipo: string) => ({
  atestado_medico: 'Atestado Médico',
  declaracao_comparecimento: 'Declaração de Comparecimento',
  comparecimento_judicial: 'Comparecimento Judicial',
  documento_identidade: 'Documento de Identidade',
  recibo: 'Recibo',
  receita_medica: 'Receita Médica',
  outro: 'Outros',
} as Record<string, string>)[tipo] || 'Outros';

const pontoStatusLabel = (acao?: string) => ({
  abonar_dia: 'ABONO DE DIA',
  abonar_intervalo: 'ABONO DE HORAS',
  nao_abonar: 'SEM ABONO',
  revisar: 'REVISAR',
} as Record<string, string>)[acao || ''] || 'REVISAR';

const formatHours = (value: number) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const AtestadosImportPage: React.FC = () => {
  const { employees, companies, session } = useApp();
  const [staging, setStaging] = useState<AtestadoStaging[]>([]);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matchFuncionario = (data: { funcionario_nome?: string; cpf?: string }) => {
    const cpf = onlyDigits(data.cpf || '');
    if (cpf) {
      const byCpf = employees.find(e => onlyDigits(e.cpf) === cpf);
      if (byCpf) return byCpf;
    }
    const nome = (data.funcionario_nome || '').trim().toLowerCase();
    if (!nome) return undefined;
    let m = employees.find(e => e.name.trim().toLowerCase() === nome);
    if (m) return m;
    const tokens = nome.split(/\s+/).filter(t => t.length > 2);
    m = employees.find(e => {
      const en = e.name.toLowerCase();
      return tokens.every(t => en.includes(t));
    });
    return m;
  };

  const tentarMatchPorNomeArquivo = (fileName: string) => {
    const limpo = fileName.replace(/\.[^.]+$/, '').toLowerCase();
    const tokens = limpo.split(/[^a-z0-9]+/).filter(t => t.length > 2);
    if (tokens.length < 2) return undefined;
    return employees.find(e => {
      const en = e.name.toLowerCase();
      return tokens.filter(t => en.includes(t)).length >= 2;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const userId = session?.user?.id;
    if (!userId) { toast.error('Sessão expirada'); return; }

    for (const file of Array.from(files)) {
      const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const path = `${userId}/${safeName}`;

      setStaging(prev => [...prev, {
        fileName: file.name, fileUrl: '', fileSize: file.size,
        status: 'subindo', aplicarVR: true, aplicarVT: true,
        ehAtestado: false, tipoDocumento: 'Comprovante Comum', acaoPonto: 'revisar',
      }]);

      const up = await supabase.storage.from('atestados').upload(path, file, { upsert: false });
      if (up.error) {
        setStaging(prev => prev.map(s => s.fileName === file.name && s.status === 'subindo'
          ? { ...s, status: 'erro', erro: up.error.message } : s));
        continue;
      }

      const { data: pub } = supabase.storage.from('atestados').getPublicUrl(path);
      const fileUrl = pub.publicUrl;

      setStaging(prev => prev.map(s => s.fileName === file.name && s.status === 'subindo'
        ? { ...s, status: 'processando', fileUrl } : s));

      // tenta OCR — se falhar em qualquer etapa, cai para modo manual
      try {
        let dataUrl: string;
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const { pageUrls } = await renderPdfPagesToDataUrls(fileUrl, 1.6, 1);
          if (!pageUrls.length) throw new Error('PDF sem páginas legíveis');
          dataUrl = pageUrls[0];
        } else {
          dataUrl = await fileToDataUrl(file);
        }

        const { data, error } = await supabase.functions.invoke('ocr-documento-ponto', { body: { dataUrl } });
        if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Falha OCR');

        const ext = data.data;
        const emp = matchFuncionario({ funcionario_nome: ext.funcionario_nome, cpf: ext.cpf });
        const empresa = emp ? companies.find(c => c.id === emp.companyId) : undefined;
        const classificacao = String(ext.tipo_documento || 'outro');
        const ehAtestado = classificacao === 'atestado_medico';

        setStaging(prev => prev.map(s => s.fileUrl === fileUrl ? {
          ...s,
          status: 'ok',
          ehAtestado,
          classificacao,
          tipoDocumento: tipoLabel(classificacao),
          funcionarioId: emp?.id,
          funcionarioNome: ext.funcionario_nome || emp?.name || '',
          empresaNome: empresa?.name || '',
          cpf: ext.cpf || '',
          dataDocumento: ext.data_documento || ext.data_inicio || '',
          dataInicio: ext.data_inicio || ext.data_documento || '',
          dataFim: ext.data_fim || ext.data_inicio || ext.data_documento || '',
          diasCobertos: Number(ext.dias_cobertos) || (ehAtestado ? 1 : 0),
          horaInicio: ext.hora_inicio || '',
          horaFim: ext.hora_fim || '',
          horasJustificadas: Number(ext.horas_justificadas) || 0,
          acaoPonto: ext.acao_ponto || 'revisar',
          parecer: ext.parecer || '',
          cid: ext.cid || '',
          medico: ext.medico || '',
          crm: ext.crm || '',
          descricao: ext.motivo || '',
          textoBruto: ext.texto_bruto || '',
          confianca: Number(ext.confianca) || 0,
        } : s));
      } catch (e: any) {
        // Fallback: nunca trava — abre modo manual para arquivar como comprovante comum
        const empPorNome = tentarMatchPorNomeArquivo(file.name);
        const empresa = empPorNome ? companies.find(c => c.id === empPorNome.companyId) : undefined;
        setStaging(prev => prev.map(s => s.fileUrl === fileUrl ? {
          ...s,
          status: 'manual',
          erro: e?.message || 'Não foi possível ler o documento automaticamente',
          ehAtestado: false,
          tipoDocumento: 'Comprovante Comum',
          funcionarioId: empPorNome?.id,
          funcionarioNome: empPorNome?.name || '',
          empresaNome: empresa?.name || '',
          dataDocumento: new Date().toISOString().slice(0, 10),
          dataInicio: new Date().toISOString().slice(0, 10),
          diasCobertos: 0,
          acaoPonto: 'revisar',
          parecer: 'Documento não lido automaticamente. Necessária conferência manual antes de qualquer abono.',
        } : s));
      }
    }
  };

  const updateRow = (i: number, patch: Partial<AtestadoStaging>) => {
    setStaging(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const removeRow = (i: number) => setStaging(prev => prev.filter((_, idx) => idx !== i));

  const salvarTudo = async () => {
    const validos = staging.filter(s => (s.status === 'ok' || s.status === 'manual') && s.funcionarioId);
    if (validos.length === 0) {
      toast.error('Nenhum documento pronto. Vincule o funcionário em cada item.');
      return;
    }
    setSalvando(true);
    try {
      const userId = session?.user?.id!;
      const userName = session?.user?.email || 'Sistema';

      const atestadosRows: any[] = [];
      const docsRows: any[] = [];
      const pointActions: Array<{
        funcionarioId: string;
        companyId: string;
        competencia: string;
        acao: AtestadoStaging['acaoPonto'];
        horas: number;
        dias: number;
        parecer: string;
        fileName: string;
      }> = [];

      for (const v of validos) {
        const emp = employees.find(e => e.id === v.funcionarioId);
        const company = emp ? companies.find(c => c.id === emp.companyId) : undefined;
        const dataBase = v.dataInicio || v.dataDocumento || new Date().toISOString().slice(0, 10);
        const competencia = dataBase.slice(0, 7);
        const parecerBase = v.parecer || (
          v.acaoPonto === 'nao_abonar'
            ? `${v.tipoDocumento}: documento arquivado sem abono automático.`
            : `${v.tipoDocumento}: documento arquivado para conferência.`
        );
        const parecer = `[DOC:${v.fileName}] PARECER DOCUMENTO: ${parecerBase}`;

        if (v.ehAtestado) {
          atestadosRows.push({
            funcionario_id: v.funcionarioId!,
            funcionario_nome: emp?.name || v.funcionarioNome || '',
            company_id: emp?.companyId,
            empresa_nome: company?.name || '',
            competencia,
            data_inicio: v.dataInicio || null,
            data_fim: v.dataFim || null,
            dias_cobertos: Math.max(1, v.diasCobertos || 1),
            cid: v.cid || '',
            medico: v.medico || '',
            crm: v.crm || '',
            arquivo_url: v.fileUrl,
            arquivo_nome: v.fileName,
            ocr_texto_bruto: v.textoBruto || '',
            ocr_confianca: v.confianca || 0,
            status: 'confirmado',
            aplicado_vr: v.aplicarVR,
            aplicado_vt: v.aplicarVT,
            importado_por_user_id: userId,
            importado_por_nome: userName,
          });
        }

        docsRows.push({
          funcionario_id: v.funcionarioId!,
          funcionario_nome: emp?.name || v.funcionarioNome || '',
          company_id: emp?.companyId,
          empresa_nome: company?.name || '',
          tipo_documento: v.tipoDocumento,
          categoria: v.tipoDocumento.toUpperCase(),
          competencia,
          descricao: v.ehAtestado
            ? `Atestado ${v.diasCobertos || 1} dia(s)${v.cid ? ` — CID ${v.cid}` : ''}${v.medico ? ` — Dr(a). ${v.medico}` : ''}`
            : (v.descricao || v.tipoDocumento),
          observacao: parecer,
          arquivo_url: v.fileUrl,
          nome_arquivo: v.fileName,
          data_documento: `${v.dataDocumento || dataBase}T12:00:00-03:00`,
          origem: 'upload_manual',
          storage_bucket: 'atestados',
          storage_path: '',
          gerado_por_user_id: userId,
          gerado_por_nome: userName,
          status_envio: 'arquivado',
          unidade: company?.name || '',
        });

        if (emp?.companyId) {
          pointActions.push({
            funcionarioId: v.funcionarioId!,
            companyId: emp.companyId,
            competencia,
            acao: v.acaoPonto || 'revisar',
            horas: Math.max(0, Number(v.horasJustificadas) || 0),
            dias: Math.max(0, Number(v.diasCobertos) || 0),
            parecer,
            fileName: v.fileName,
          });
        }
      }

      if (atestadosRows.length) {
        const { error: errA } = await supabase.from('atestados').insert(atestadosRows);
        if (errA) throw errA;
      }
      if (docsRows.length) {
        const { error: errD } = await supabase.from('documentos_funcionario').insert(docsRows);
        if (errD) throw errD;
      }

      for (const action of pointActions) {
        const { data: current, error: loadError } = await supabase
          .from('lancamentos_mensais')
          .select('id,observacoes,bloqueado')
          .eq('funcionario_id', action.funcionarioId)
          .eq('competencia', action.competencia)
          .is('apagado_em', null)
          .maybeSingle();
        if (loadError) throw loadError;
        if (current?.bloqueado) continue;

        const existing = String(current?.observacoes || '');
        if (existing.includes(`[DOC:${action.fileName}]`)) continue;

        const markers: string[] = [];
        if (action.acao === 'abonar_intervalo' && action.horas > 0) {
          markers.push(`DECLARACAO/ATESTADO HORAS: +${formatHours(action.horas)}h`);
        }
        if (action.acao === 'abonar_dia' && action.dias > 0) {
          markers.push(`ABONO DOCUMENTAL DIAS: +${formatHours(action.dias)}`);
        }
        if (action.acao === 'revisar') markers.push('REVISÃO DOCUMENTAL PENDENTE');
        if (action.acao === 'nao_abonar') markers.push('SEM ABONO AUTOMÁTICO');

        const observacoes = [existing, ...markers, action.parecer].filter(Boolean).join(' | ');
        if (current?.id) {
          const { error: updateError } = await supabase
            .from('lancamentos_mensais')
            .update({ observacoes } as any)
            .eq('id', current.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('lancamentos_mensais').insert({
            funcionario_id: action.funcionarioId,
            company_id: action.companyId,
            competencia: action.competencia,
            observacoes,
            origem: 'consolidado',
            status_conferencia: action.acao === 'revisar' ? 'divergente' : 'pendente',
            user_id: userId,
          } as any);
          if (insertError) throw insertError;
        }
      }

      toast.success(`${validos.length} documento(s) arquivado(s).`);
      setStaging(prev => prev.filter(s => !validos.includes(s)));
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const prontos = staging.filter(s => (s.status === 'ok' || s.status === 'manual') && s.funcionarioId).length;
  const erros = staging.filter(s => s.status === 'erro').length;
  const processando = staging.filter(s => s.status === 'subindo' || s.status === 'processando').length;
  const manuais = staging.filter(s => s.status === 'manual').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-foreground">Importar Atestados / Comprovantes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suba PDFs ou imagens. Se for atestado, o sistema reconhece e arquiva. Se não for, dá para arquivar como comprovante comum.
        </p>
      </div>

      <Card className="p-6 border-2 border-dashed border-primary/30 bg-primary/5">
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*"
          onChange={e => handleFiles(e.target.files)} className="hidden" />
        <button onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-3 py-10 cursor-pointer hover:bg-primary/5 rounded-lg transition">
          <Upload className="w-12 h-12 text-primary" />
          <div className="text-center">
            <p className="font-semibold text-foreground">Clique para selecionar arquivos</p>
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WEBP — pode subir vários de uma vez</p>
          </div>
        </button>
        {staging.length > 0 && (
          <div className="flex gap-2 justify-center mt-3 flex-wrap">
            {processando > 0 && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{processando} processando</Badge>}
            {prontos > 0 && <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />{prontos} prontos</Badge>}
            {manuais > 0 && <Badge variant="outline"><FileQuestion className="w-3 h-3 mr-1" />{manuais} manual</Badge>}
            {erros > 0 && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />{erros} com erro</Badge>}
          </div>
        )}
      </Card>

      {staging.length > 0 && (
        <div className="space-y-3">
          {staging.map((s, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(s.fileSize / 1024).toFixed(0)} KB
                      {s.fileUrl && <> • <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">abrir arquivo</a></>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === 'subindo' && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Subindo</Badge>}
                  {s.status === 'processando' && <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Lendo…</Badge>}
                  {s.status === 'ok' && (
                    <Badge className="bg-success text-success-foreground">
                      <CheckCircle2 className="w-3 h-3 mr-1" />Atestado OK {s.confianca ? `(${Math.round((s.confianca || 0) * 100)}%)` : ''}
                    </Badge>
                  )}
                  {s.status === 'manual' && <Badge variant="outline"><FileQuestion className="w-3 h-3 mr-1" />Preencher manual</Badge>}
                  {s.status === 'erro' && <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro upload</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => removeRow(i)}>×</Button>
                </div>
              </div>

              {s.status === 'erro' && (
                <p className="text-xs text-destructive">{s.erro}</p>
              )}

              {s.status === 'manual' && (
                <p className="text-xs text-warning mb-3 bg-warning/10 p-2 rounded">
                  ⚠ Não consegui ler automaticamente ({s.erro}). Você ainda pode arquivar este documento — escolha o funcionário e o tipo abaixo.
                </p>
              )}

              {(s.status === 'ok' || s.status === 'manual') && (
                <>
                  <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{pontoStatusLabel(s.acaoPonto)}</Badge>
                      {s.horasJustificadas ? <span className="text-xs text-foreground">{formatHours(s.horasJustificadas)}h justificadas</span> : null}
                      {s.diasCobertos && s.acaoPonto === 'abonar_dia' ? <span className="text-xs text-foreground">{s.diasCobertos} dia(s) justificado(s)</span> : null}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {s.parecer || 'Documento arquivado. Sem decisão automática de abono.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" />Funcionário *</label>
                    <select value={s.funcionarioId || ''} onChange={e => updateRow(i, { funcionarioId: e.target.value || undefined })}
                      className={`w-full border rounded-lg px-3 py-2 text-sm bg-background ${!s.funcionarioId ? 'border-destructive' : ''}`}>
                      <option value="">— Selecione —</option>
                      {employees.filter(e => e.status === 'ativo').map(emp => {
                        const c = companies.find(cc => cc.id === emp.companyId);
                        return <option key={emp.id} value={emp.id}>{emp.name} • {c?.name || ''}</option>;
                      })}
                    </select>
                    {s.funcionarioNome && !s.funcionarioId && (
                      <p className="text-[10px] text-warning mt-1">Sugerido: "{s.funcionarioNome}" — selecione manualmente</p>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-[10px] uppercase text-muted-foreground">Tipo de documento</label>
                    <div className="flex gap-2 items-center">
                      <select value={s.tipoDocumento} onChange={e => {
                        const t = e.target.value;
                        updateRow(i, {
                          tipoDocumento: t,
                          ehAtestado: t === 'Atestado Médico',
                          classificacao: undefined,
                          acaoPonto: 'revisar',
                          parecer: 'Tipo ajustado manualmente. Conferir antes de qualquer abono.',
                        });
                      }} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background">
                        {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {s.ehAtestado && (
                    <>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Início</label>
                        <Input type="date" value={s.dataInicio || ''} onChange={e => updateRow(i, { dataInicio: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">Dias</label>
                        <Input type="number" min="1" value={s.diasCobertos || 1}
                          onChange={e => updateRow(i, { diasCobertos: Number(e.target.value) })} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">CID</label>
                        <Input value={s.cid || ''} onChange={e => updateRow(i, { cid: e.target.value })} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-muted-foreground">CRM</label>
                        <Input value={s.crm || ''} onChange={e => updateRow(i, { crm: e.target.value })} className="h-9" />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="text-[10px] uppercase text-muted-foreground">Médico</label>
                        <Input value={s.medico || ''} onChange={e => updateRow(i, { medico: e.target.value })} className="h-9" />
                      </div>
                      <div className="flex flex-col gap-1 lg:col-span-4">
                        <label className="text-[10px] uppercase text-muted-foreground">Impacto em benefícios</label>
                        <div className="flex gap-3 text-xs">
                          <label className="flex items-center gap-2"><input type="checkbox" checked={s.aplicarVR} onChange={e => updateRow(i, { aplicarVR: e.target.checked })} />Descontar dia(s) do VR</label>
                          <label className="flex items-center gap-2"><input type="checkbox" checked={s.aplicarVT} onChange={e => updateRow(i, { aplicarVT: e.target.checked })} />Descontar dia(s) do VT</label>
                        </div>
                      </div>
                    </>
                  )}

                  {!s.ehAtestado && (
                    <div className="lg:col-span-4">
                      <label className="text-[10px] uppercase text-muted-foreground">Descrição</label>
                      <Input value={s.descricao || ''} onChange={e => updateRow(i, { descricao: e.target.value })}
                        placeholder="Ex.: Comprovante de residência, Declaração escolar..." className="h-9" />
                    </div>
                  )}
                </div>
                </>
              )}
            </Card>
          ))}

          <div className="flex justify-end gap-3 sticky bottom-4 bg-background/80 backdrop-blur p-3 rounded-xl border">
            <Button variant="outline" onClick={() => setStaging([])} disabled={salvando}>Limpar lista</Button>
            <Button onClick={salvarTudo} disabled={salvando || prontos === 0} className="gradient-primary text-primary-foreground">
              {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar e arquivar ({prontos})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AtestadosImportPage;
