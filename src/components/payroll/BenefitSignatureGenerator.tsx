import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSignature, Loader2, RefreshCw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { buildIndividualBenefitData, getPreviousCompetencia } from '@/lib/benefitReports';
import { getWorkingDays } from '@/lib/workingDays';
import { sha256Browser } from '@/lib/payrollDocuments';

const BUCKET = 'payroll-private';
const DOCUMENT_TYPE = 'BENEFICIO_VR_VT';

const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const money = (value: number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const competenceLabel = (value: string) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : value;
};

const makeBenefitPdf = ({ company, employee, competencia, vr, vt }: any) => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const left = 18;
  let y = 20;
  const row = (label: string, value: string, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(10);
    pdf.text(label, left, y);
    pdf.text(value, 90, y);
    y += 7;
  };
  const section = (title: string, data: any) => {
    if (!data) return;
    y += 4;
    pdf.setFillColor(240, 240, 240);
    pdf.rect(left, y - 5, 174, 9, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(title, left + 2, y + 1);
    y += 10;
    row('Valor diário', money(data.valorDiario));
    row('Dias previstos', String(data.diasPrevistos));
    row('Dias descontados', String(data.diasDescontados));
    row('Dias finais', String(data.diasFinais));
    if (data.motivo) row('Motivo do desconto', String(data.motivo));
    row('VALOR TOTAL', money(data.valorTotal), true);
  };

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(String(company.name || company.nome || 'EMPRESA'), 105, y, { align: 'center' });
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`CNPJ: ${company.cnpj || '—'}`, 105, y, { align: 'center' });
  y += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('RECIBO INDIVIDUAL DE BENEFÍCIOS — VR / VT', 105, y, { align: 'center' });
  y += 12;

  row('Funcionário', employee.name || employee.nome || '—', true);
  row('CPF', employee.cpf || '—');
  row('Cargo', employee.cargo || '—');
  row('Registro', employee.registro || '—');
  row('Competência', competenceLabel(competencia));

  section('VALE REFEIÇÃO (VR)', vr);
  section('VALE TRANSPORTE (VT)', vt);

  const total = Number(vr?.valorTotal || 0) + Number(vt?.valorTotal || 0);
  y += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(`TOTAL DE BENEFÍCIOS: ${money(total)}`, left, y);
  y += 15;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const declaration = 'Declaro que visualizei e conferi os valores de Vale Refeição e/ou Vale Transporte referentes à competência acima. A confirmação será registrada por assinatura eletrônica no Portal TOPAC RH.';
  const lines = pdf.splitTextToSize(declaration, 174);
  pdf.text(lines, left, y);
  y += lines.length * 5 + 22;
  pdf.line(45, y, 165, y);
  y += 5;
  pdf.text(employee.name || employee.nome || 'Funcionário', 105, y, { align: 'center' });

  return new Uint8Array(pdf.output('arraybuffer'));
};

const BenefitSignatureGenerator: React.FC<{ companyId: string; competencia: string }> = ({ companyId, competencia }) => {
  const { companies, employees, entries, getOrCreateEntries } = useApp();
  const company = companies.find(c => c.id === companyId);
  const previousCompetencia = getPreviousCompetencia(competencia);
  const diasUteis = getWorkingDays(competencia);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);

  useEffect(() => {
    if (companyId && competencia) getOrCreateEntries(companyId, competencia);
    if (companyId && previousCompetencia) getOrCreateEntries(companyId, previousCompetencia);
  }, [companyId, competencia, previousCompetencia, getOrCreateEntries]);

  const eligible = useMemo(() => employees
    .filter((employee: any) => employee.companyId === companyId && employee.status === 'ativo' && (employee.vrAtivo || employee.vtAtivo))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);

  const load = async () => {
    if (!companyId || !competencia) return;
    setLoading(true);
    try {
      const { data: documentRows, error } = await (supabase as any)
        .from('payroll_documents')
        .select('id,employee_id,document_type,original_filename,document_sha256,status,confirmed,created_at')
        .eq('company_id', companyId)
        .eq('competencia', competencia)
        .eq('document_type', DOCUMENT_TYPE)
        .eq('is_current', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (documentRows || []).map((item: any) => item.id);
      let signatureRows: any[] = [];
      if (ids.length) {
        const result = await (supabase as any).from('payroll_signatures').select('id,document_id,signed_at').in('document_id', ids);
        if (result.error) throw result.error;
        signatureRows = result.data || [];
      }
      setDocs(documentRows || []);
      setSignatures(signatureRows);
    } catch (error: any) {
      toast.error(`Falha ao carregar recibos VR/VT: ${error?.message || error}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [companyId, competencia]);

  const generate = async () => {
    if (!company) return toast.error('Selecione uma empresa.');
    if (!eligible.length) return toast.info('Nenhum funcionário com VR/VT ativo nesta empresa.');
    setGenerating(true);
    try {
      let created = 0;
      let unchanged = 0;
      for (const employee of eligible as any[]) {
        const entry = entries.find((item: any) => item.employeeId === employee.id && item.companyId === companyId && item.competencia === competencia);
        const discountEntry = entries.find((item: any) => item.employeeId === employee.id && item.companyId === companyId && item.competencia === previousCompetencia);
        const vr = buildIndividualBenefitData({ emp: employee, entry, descontoEntry: discountEntry, diasUteis, type: 'vr' });
        const vt = buildIndividualBenefitData({ emp: employee, entry, descontoEntry: discountEntry, diasUteis, type: 'vt' });
        if (!vr && !vt) continue;

        const bytes = makeBenefitPdf({ company, employee, competencia, vr, vt });
        const hash = await sha256Browser(bytes);
        const { data: existing, error: existingError } = await (supabase as any)
          .from('payroll_documents')
          .select('id,document_sha256')
          .eq('company_id', companyId)
          .eq('employee_id', employee.id)
          .eq('competencia', competencia)
          .eq('document_type', DOCUMENT_TYPE)
          .eq('is_current', true)
          .maybeSingle();
        if (existingError) throw existingError;
        if (existing?.document_sha256 === hash) { unchanged += 1; continue; }

        const filename = `RECIBO_VR_VT_${safeFile(employee.name)}_${competencia}.pdf`;
        const path = `${companyId}/${competencia}/beneficios/${employee.id}/${crypto.randomUUID()}-${filename}`;
        const blob = new Blob([bytes as any], { type: 'application/pdf' });
        const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false });
        if (storageError) throw storageError;

        const total = Number(vr?.valorTotal || 0) + Number(vt?.valorTotal || 0);
        const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
          company_id: companyId,
          employee_id: employee.id,
          competencia,
          document_type: DOCUMENT_TYPE,
          storage_path: path,
          original_filename: filename,
          mime_type: 'application/pdf',
          file_size: bytes.byteLength,
          document_sha256: hash,
          source_sha256: hash,
          net_amount: total,
          match_confidence: 100,
          extracted_data: {
            origem: 'TOPAC_RH_BENEFICIOS',
            vr,
            vt,
            total_beneficios: total,
            dias_uteis: diasUteis,
          },
          status: 'AGUARDANDO_ASSINATURA',
          confirmed: true,
          confirmed_at: new Date().toISOString(),
        });
        if (insertError) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insertError;
        }
        created += 1;
      }
      toast.success(`${created} recibo(s) VR/VT liberado(s) para assinatura.${unchanged ? ` ${unchanged} já estavam atualizados.` : ''}`);
      await load();
    } catch (error: any) {
      toast.error(`Falha ao gerar recibos VR/VT: ${error?.message || error}`);
    } finally { setGenerating(false); }
  };

  const signatureByDoc = new Map(signatures.map(row => [row.document_id, row]));
  const signedCount = docs.filter(row => signatureByDoc.has(row.id)).length;

  return <div className="mt-5 space-y-4 rounded-2xl border border-cyan-500/25 bg-card p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-cyan-400">Assinatura digital de benefícios</p>
        <h3 className="mt-1 flex items-center gap-2 text-lg font-bold"><FileSignature className="h-5 w-5"/>Recibos VR / VT</h3>
        <p className="mt-1 text-xs text-muted-foreground">Puxa os valores já calculados pela TOPAC, gera um recibo individual por funcionário e libera no mesmo Portal de Holerite e Recibos.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={()=>void generate()} disabled={generating || loading}>{generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileSignature className="mr-2 h-4 w-4"/>}PUXAR RECIBOS VR/VT PARA ASSINATURA</Button>
        <Button variant="outline" onClick={()=>void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Atualizar</Button>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      <Badge variant="outline">Funcionários com benefício: {eligible.length}</Badge>
      <Badge variant="outline">Recibos liberados: {docs.length}</Badge>
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400"><CheckCircle2 className="mr-1 h-3 w-3"/>Assinados: {signedCount}</Badge>
    </div>
  </div>;
};

export default BenefitSignatureGenerator;
