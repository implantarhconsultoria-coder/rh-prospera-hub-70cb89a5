import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bus, CheckCircle2, FileSignature, Loader2, RefreshCw, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { sha256Browser } from '@/lib/payrollDocuments';

const PAYROLL_BUCKET = 'payroll-private';
const VR_TYPE = 'BENEFICIO_VR';
const VT_TYPE = 'BENEFICIO_VT';

const normalizeSignatureText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const isSignatureExcluded = (employee: any) => {
  const cargo = normalizeSignatureText(employee?.cargo);
  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');
};

const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const competenceLabel = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : value;
};

type SourceReceipt = {
  id: string;
  funcionario_id: string | null;
  funcionario_nome: string;
  company_id: string | null;
  tipo_documento: string;
  categoria: string;
  competencia: string;
  nome_arquivo: string;
  storage_bucket: string;
  storage_path: string;
  data_documento: string | null;
  created_at: string;
};

const sourceKind = (row: SourceReceipt): 'vr' | 'vt' | null => {
  const text = `${row.tipo_documento || ''} ${row.categoria || ''}`.toUpperCase();
  if (/\bVR\b/.test(text) && !/\bVT\b/.test(text)) return 'vr';
  if (/\bVT\b/.test(text) && !/\bVR\b/.test(text)) return 'vt';
  return null;
};

const sourceKey = (employeeId: string, kind: 'vr' | 'vt') => `${employeeId}:${kind}`;

const BenefitSignatureGenerator: React.FC<{ companyId: string; competencia: string }> = ({ companyId, competencia }) => {
  const { companies, employees } = useApp();
  const company = companies.find(c => c.id === companyId);
  const [sources, setSources] = useState<SourceReceipt[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);

  const eligible = useMemo(() => employees
    .filter((employee: any) => employee.companyId === companyId && employee.status === 'ativo' && (employee.vrAtivo || employee.vtAtivo) && !isSignatureExcluded(employee))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const latestSources = useMemo(() => {
    const map = new Map<string, SourceReceipt>();
    [...sources]
      .sort((a, b) => String(b.data_documento || b.created_at).localeCompare(String(a.data_documento || a.created_at)))
      .forEach(row => {
        if (!row.funcionario_id) return;
        const kind = sourceKind(row);
        if (!kind) return;
        const key = sourceKey(row.funcionario_id, kind);
        if (!map.has(key)) map.set(key, row);
      });
    return map;
  }, [sources]);

  const load = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    try {
      const [sourceResult, docResult] = await Promise.all([
        (supabase as any)
          .from('documentos_funcionario')
          .select('id,funcionario_id,funcionario_nome,company_id,tipo_documento,categoria,competencia,nome_arquivo,storage_bucket,storage_path,data_documento,created_at,origem')
          .eq('company_id', companyId)
          .eq('competencia', competencia)
          .neq('origem', 'payroll_portal')
          .in('tipo_documento', ['Recibo VR', 'Recibo VT'])
          .order('data_documento', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('payroll_documents')
          .select('id,employee_id,document_type,document_version,document_sha256,original_filename,status,confirmed,is_current,created_at')
          .eq('company_id', companyId)
          .eq('competencia', competencia)
          .in('document_type', [VR_TYPE, VT_TYPE])
          .eq('is_current', true)
          .order('created_at', { ascending: false }),
      ]);
      if (sourceResult.error) throw sourceResult.error;
      if (docResult.error) throw docResult.error;
      const documentRows = docResult.data || [];
      const ids = documentRows.map((row: any) => row.id);
      let signatureRows: any[] = [];
      if (ids.length) {
        const signatureResult = await (supabase as any)
          .from('payroll_signatures')
          .select('id,document_id,signed_at')
          .in('document_id', ids);
        if (signatureResult.error) throw signatureResult.error;
        signatureRows = signatureResult.data || [];
      }
      setSources((sourceResult.data || []) as SourceReceipt[]);
      setDocs(documentRows);
      setSignatures(signatureRows);
    } catch (error: any) {
      toast.error(`Falha ao carregar recibos gerados: ${error?.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId, competencia]);

  const availableVr = eligible.filter((employee: any) => employee.vrAtivo && latestSources.has(sourceKey(employee.id, 'vr'))).length;
  const availableVt = eligible.filter((employee: any) => employee.vtAtivo && latestSources.has(sourceKey(employee.id, 'vt'))).length;
  const missing = eligible.flatMap((employee: any) => {
    const out: string[] = [];
    if (employee.vrAtivo && !latestSources.has(sourceKey(employee.id, 'vr'))) out.push(`${employee.name} — VR`);
    if (employee.vtAtivo && !latestSources.has(sourceKey(employee.id, 'vt'))) out.push(`${employee.name} — VT`);
    return out;
  });

  const pullGenerated = async () => {
    if (!company) return toast.error('Selecione uma empresa.');
    const candidates = eligible.flatMap((employee: any) => {
      const out: Array<{ employee: any; kind: 'vr' | 'vt'; source: SourceReceipt }> = [];
      const vr = latestSources.get(sourceKey(employee.id, 'vr'));
      const vt = latestSources.get(sourceKey(employee.id, 'vt'));
      if (employee.vrAtivo && vr) out.push({ employee, kind: 'vr', source: vr });
      if (employee.vtAtivo && vt) out.push({ employee, kind: 'vt', source: vt });
      return out;
    });
    if (!candidates.length) return toast.info(`Nenhum recibo VR/VT separado foi gerado para ${competenceLabel(competencia)}.`);

    setPulling(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const actorId = sessionData.session?.user?.id || null;
      if (!actorId) throw new Error('Sessão administrativa expirada.');

      const currentMap = new Map(docs.map((row: any) => [`${row.employee_id}:${row.document_type}`, row]));
      let created = 0;
      let unchanged = 0;

      for (const item of candidates) {
        const docType = item.kind === 'vr' ? VR_TYPE : VT_TYPE;
        const current = currentMap.get(`${item.employee.id}:${docType}`);
        const sourceBucket = item.source.storage_bucket || 'documentos-funcionarios';
        const sourcePath = item.source.storage_path;
        if (!sourcePath) continue;

        const { data: sourceBlob, error: sourceError } = await supabase.storage.from(sourceBucket).download(sourcePath);
        if (sourceError || !sourceBlob) throw sourceError || new Error(`Arquivo não encontrado para ${item.employee.name}.`);
        const bytes = new Uint8Array(await sourceBlob.arrayBuffer());
        const hash = await sha256Browser(bytes);
        if (current?.document_sha256 === hash) {
          unchanged += 1;
          continue;
        }

        const nextVersion = Number(current?.document_version || 0) + 1;
        if (current) {
          const { error: supersedeError } = await (supabase as any)
            .from('payroll_documents')
            .update({ is_current: false, status: 'SUBSTITUIDO', updated_at: new Date().toISOString() })
            .eq('id', current.id);
          if (supersedeError) throw supersedeError;
        }

        const label = item.kind === 'vr' ? 'VR' : 'VT';
        const filename = item.source.nome_arquivo || `RECIBO_${label}_${safeFile(item.employee.name)}_${competencia}.pdf`;
        const payrollPath = `${companyId}/${competencia}/beneficios/${item.employee.id}/${item.kind}/${crypto.randomUUID()}-${safeFile(filename)}`;
        const { error: uploadError } = await supabase.storage.from(PAYROLL_BUCKET).upload(
          payrollPath,
          new Blob([bytes as any], { type: 'application/pdf' }),
          { contentType: 'application/pdf', upsert: false },
        );
        if (uploadError) {
          if (current) await (supabase as any).from('payroll_documents').update({ is_current: true, status: current.status }).eq('id', current.id);
          throw uploadError;
        }

        const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
          company_id: companyId,
          employee_id: item.employee.id,
          competencia,
          document_type: docType,
          storage_bucket: PAYROLL_BUCKET,
          storage_path: payrollPath,
          original_filename: filename,
          mime_type: 'application/pdf',
          file_size: bytes.byteLength,
          document_sha256: hash,
          source_sha256: hash,
          document_version: nextVersion,
          is_current: true,
          extracted_data: {
            origem: 'DOCUMENTO_GERADO_TOPAC_RH',
            source_documento_funcionario_id: item.source.id,
            source_bucket: sourceBucket,
            source_path: sourcePath,
            beneficio: label,
            competencia_uso: competencia,
          },
          match_confidence: 100,
          status: 'AGUARDANDO_ASSINATURA',
          confirmed: true,
          confirmed_at: new Date().toISOString(),
          confirmed_by: actorId,
          created_by: actorId,
        });
        if (insertError) {
          await supabase.storage.from(PAYROLL_BUCKET).remove([payrollPath]);
          if (current) await (supabase as any).from('payroll_documents').update({ is_current: true, status: current.status }).eq('id', current.id);
          throw insertError;
        }
        created += 1;
      }

      toast.success(`${created} recibo(s) gerado(s) na plataforma foram liberados para assinatura.${unchanged ? ` ${unchanged} já estavam atualizados.` : ''}`);
      await load();
    } catch (error: any) {
      console.error('[benefit-signature-pull]', error);
      toast.error(`Falha ao puxar os recibos: ${error?.message || error}`);
    } finally {
      setPulling(false);
    }
  };

  const signatureByDoc = new Map(signatures.map(row => [row.document_id, row]));
  const signedVr = docs.filter(row => row.document_type === VR_TYPE && signatureByDoc.has(row.id)).length;
  const signedVt = docs.filter(row => row.document_type === VT_TYPE && signatureByDoc.has(row.id)).length;

  return <div className="mt-5 space-y-4 rounded-2xl border border-cyan-500/25 bg-card p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-cyan-400">Assinatura digital de benefícios</p>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5"/>Recibos VR e VT já gerados</h3>
        <p className="mt-1 text-xs text-muted-foreground">Não recalcula e não exige upload. Puxa o recibo individual que já foi gerado e arquivado na TOPAC RH PRO.</p>
        <p className="mt-2 text-sm font-semibold text-cyan-300">Competência de uso: {competenceLabel(competencia)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Regra: benefício pago antecipadamente pertence ao mês de uso. Ex.: gerado em agosto para setembro = competência 09/2026.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={()=>void pullGenerated()} disabled={pulling || loading}>{pulling ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileSignature className="mr-2 h-4 w-4"/>}PUXAR RECIBOS GERADOS</Button>
        <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Atualizar</Button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border p-3"><p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><Utensils className="h-3 w-3"/>VR gerado</p><p className="text-xl font-bold">{availableVr}</p><p className="text-xs text-muted-foreground">Assinados: {signedVr}</p></div>
      <div className="rounded-xl border p-3"><p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><Bus className="h-3 w-3"/>VT gerado</p><p className="text-xl font-bold">{availableVt}</p><p className="text-xs text-muted-foreground">Assinados: {signedVt}</p></div>
      <div className="rounded-xl border p-3"><p className="text-[10px] uppercase text-muted-foreground">Liberados no portal</p><p className="text-xl font-bold">{docs.length}</p></div>
      <div className="rounded-xl border p-3"><p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><CheckCircle2 className="h-3 w-3"/>Assinados</p><p className="text-xl font-bold text-emerald-400">{signedVr + signedVt}</p></div>
    </div>

    {missing.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
      <div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4"/>Ainda não existe recibo separado gerado para {missing.length} benefício(s) nesta competência.</div>
      <p className="mt-1 text-amber-100/80">Gere primeiro no módulo normal de VR/VT. Depois clique em “Puxar recibos gerados”.</p>
      <div className="mt-2 flex flex-wrap gap-1">{missing.slice(0, 12).map(item => <Badge key={item} variant="outline" className="border-amber-400/40 text-amber-100">{item}</Badge>)}{missing.length > 12 && <Badge variant="outline">+{missing.length - 12}</Badge>}</div>
    </div>}
  </div>;
};

export default BenefitSignatureGenerator;
