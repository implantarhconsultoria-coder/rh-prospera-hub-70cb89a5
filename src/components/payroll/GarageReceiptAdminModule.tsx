import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCircle2, FileUp, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { extractCpf, extractPdfFilesFromZip, extractPdfPages, readBlobBytes, sha256Browser } from '@/lib/payrollDocuments';
import { safeUuid } from '@/lib/payrollPageDocuments';

const BUCKET = 'payroll-private';
const TYPE = 'RECIBO_GARAGEM';
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const safeFile = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);

const garageAmount = (text: string) => {
  const match = String(text || '').match(/valor\s+mensal\s+da\s+garagem\s*(?:R\$)?\s*([\d.]+,\d{2})/i);
  if (!match?.[1]) return 200;
  const value = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : 200;
};

const GarageReceiptAdminModule: React.FC<{ companyId: string; competencia: string }> = ({ companyId, competencia }) => {
  const { employees, companies } = useApp();
  const company = companies.find(item => item.id === companyId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const employeeMap = useMemo(() => new Map(
    employees.filter(item => item.companyId === companyId).map(item => [digits(item.cpf), item]),
  ), [companyId, employees]);

  const referenceDate = useMemo(() => {
    const [year, month] = competencia.split('-');
    return year && month ? `05/${month}/${year}` : 'dia 5';
  }, [competencia]);

  const load = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from('payroll_documents')
        .select('id,employee_id,competencia,original_filename,storage_path,status,confirmed,created_at,extracted_data')
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .eq('document_type', TYPE)
        .eq('is_current', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar os recibos de garagem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId, competencia]);

  const uploadFiles = async (incoming: File[]) => {
    if (!incoming.length) return;
    setUploading(true);
    try {
      const files: File[] = [];
      for (const file of incoming) {
        if (/\.zip$/i.test(file.name)) files.push(...await extractPdfFilesFromZip(file));
        else if (/\.pdf$/i.test(file.name)) files.push(file);
      }
      if (!files.length) throw new Error('Selecione PDF ou ZIP com os recibos individuais de garagem.');

      let imported = 0;
      let duplicates = 0;
      const pending: string[] = [];

      for (const file of files) {
        const bytes = await readBlobBytes(file);
        const pages = await extractPdfPages(new Uint8Array(bytes));
        const text = pages.map(page => page.text).join('\n');
        const cpf = digits(extractCpf(text));
        const employee: any = employeeMap.get(cpf);
        if (!employee) {
          pending.push(`${file.name}: funcionário não localizado nesta empresa`);
          continue;
        }

        const { data: existing, error: existingError } = await (supabase as any).from('payroll_documents')
          .select('id')
          .eq('employee_id', employee.id)
          .eq('competencia', competencia)
          .eq('document_type', TYPE)
          .eq('is_current', true)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing) { duplicates += 1; continue; }

        const hash = await sha256Browser(bytes);
        const filename = safeFile(file.name || `Recibo_Garagem_${employee.name}_${competencia}.pdf`);
        const path = `${companyId}/${competencia}/garagem/${employee.id}/${safeUuid()}-${filename}`;
        const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, new Blob([bytes as any], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false });
        if (storageError) throw storageError;

        const amount = garageAmount(text);
        const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
          company_id: companyId,
          employee_id: employee.id,
          competencia,
          document_type: TYPE,
          storage_bucket: BUCKET,
          storage_path: path,
          original_filename: filename,
          mime_type: 'application/pdf',
          file_size: bytes.byteLength,
          document_sha256: hash,
          source_sha256: hash,
          document_version: 1,
          is_current: true,
          net_amount: amount,
          extracted_data: {
            origem: 'RECIBO_GARAGEM',
            cpf_detectado: cpf,
            valor_garagem: amount,
            referencia_assinatura_dia: 5,
            nao_bloqueante: true,
            pode_anexar_depois: true,
          },
          match_confidence: 100,
          status: 'AGUARDANDO_ASSINATURA',
          confirmed: true,
          confirmed_at: new Date().toISOString(),
          payment_kind: 'ORIGINAL',
          payment_sequence: 1,
          entitlement_amount: amount,
          prior_paid_amount: 0,
          payment_reason: 'Custeio de garagem',
          payment_state: 'PAGO',
        });
        if (insertError) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insertError;
        }
        imported += 1;
      }

      await load();
      if (pending.length) console.warn('[garagem-import-pendente]', pending);
      toast.success(`${imported} recibo(s) de garagem liberado(s) para assinatura.${duplicates ? ` ${duplicates} já existia(m).` : ''}${pending.length ? ` ${pending.length} arquivo(s) precisa(m) de conferência.` : ''}`);
    } catch (error: any) {
      console.error('[garagem-upload]', error);
      toast.error(error?.message || 'Não foi possível importar os recibos de garagem.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openReceipt = async (row: any) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path, 600);
    if (error || !data?.signedUrl) return toast.error('Não foi possível abrir o recibo.');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="mt-5 space-y-4 rounded-2xl border border-violet-500/25 bg-card p-5">
      <input ref={inputRef} type="file" accept="application/pdf,.pdf,.zip,application/zip" multiple className="hidden" onChange={event => void uploadFiles(Array.from(event.target.files || []))} />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-400">Assinatura Digital · Garagem</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5" />Recibos de garagem</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Referência padrão: <b>{referenceDate}</b> (dia 5). O recibo entra no portal para assinatura quando existir, mas <b>nunca bloqueia o fechamento</b>. Se ainda não estiver disponível, o processo continua normalmente e o arquivo pode ser incluído depois.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}><FileUp className="mr-2 h-4 w-4" />SUBIR RECIBOS DE GARAGEM</Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />ATUALIZAR</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <b className="text-emerald-300">REGRA NÃO BLOQUEANTE ATIVA</b>
        <span className="text-muted-foreground">Faltou recibo? Finaliza. Recebeu depois? Anexa depois.</span>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-muted/50"><tr><th className="px-3 py-2 text-left uppercase text-muted-foreground">Funcionário</th><th className="px-3 py-2 text-left uppercase text-muted-foreground">Competência</th><th className="px-3 py-2 text-left uppercase text-muted-foreground">Referência</th><th className="px-3 py-2 text-left uppercase text-muted-foreground">Status</th><th className="px-3 py-2 text-left uppercase text-muted-foreground">Arquivo</th></tr></thead>
          <tbody>
            {rows.map(row => {
              const employee = employees.find(item => item.id === row.employee_id);
              return <tr key={row.id} className="border-t"><td className="px-3 py-3 font-semibold">{employee?.name || 'Funcionário'}</td><td className="px-3 py-3">{row.competencia}</td><td className="px-3 py-3">{referenceDate}</td><td className="px-3 py-3"><Badge variant="outline" className="border-violet-400/30 text-violet-300">AGUARDANDO ASSINATURA</Badge></td><td className="px-3 py-3"><Button size="sm" variant="ghost" onClick={() => void openReceipt(row)}>Abrir PDF</Button></td></tr>;
            })}
            {!rows.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum recibo de garagem lançado para {company?.name || 'esta empresa'} nesta competência. Isso não bloqueia nenhuma finalização.</td></tr>}
          </tbody>
        </table>
      </div>
      {uploading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Importando recibos e vinculando pelo CPF do funcionário...</div>}
    </section>
  );
};

export default GarageReceiptAdminModule;
