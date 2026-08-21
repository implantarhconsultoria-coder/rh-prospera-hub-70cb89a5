import { supabase } from '@/integrations/supabase/client';
import { parsePayrollPdf, sha256Browser, type PayrollEmployeeMatch } from '@/lib/payrollDocuments';

const BUCKET = 'payroll-private';
const ALLOWED_CNPJS = new Set(['07291648000103', '14464586000150', '21967711000100']);

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const normalize = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const MONTH_NUMBER: Record<string, string> = {
  JANEIRO: '01',
  FEVEREIRO: '02',
  MARCO: '03',
  MARÇO: '03',
  ABRIL: '04',
  MAIO: '05',
  JUNHO: '06',
  JULHO: '07',
  AGOSTO: '08',
  SETEMBRO: '09',
  OUTUBRO: '10',
  NOVEMBRO: '11',
  DEZEMBRO: '12',
};

const competenceKey = (value: string) => {
  const match = String(value || '').trim().match(/^([^/]+)\/(20\d{2})$/);
  if (!match) return '';
  const month = MONTH_NUMBER[normalize(match[1])];
  return month ? `${match[2]}-${month}` : '';
};

const detectedCnpj = (companyLabel: string) => {
  const upper = normalize(companyLabel);
  if (upper.includes('ALQUI')) return '14464586000150';
  if (upper.includes('LMT')) return '21967711000100';
  if (upper.includes('MATRIZ') || upper === 'TOPAC COMERCIO DE EQUIP. INDUSTRIAIS LTDA') return '07291648000103';
  return '';
};

const looksLikeAdvanceReceipt = (text: string) => {
  const upper = normalize(text);
  return upper.includes('RECIBO DE PAGAMENTO ADTO') || (upper.includes('ADTO') && upper.includes('ADIANTAMENTO CREDITO'));
};

export type ConsolidatorPayrollRecord = {
  company: string;
  competence: string;
  source: string;
};

export type AutoIngestResult = {
  created: number;
  duplicates: number;
  pending: number;
  skippedFiles: number;
  advanceFiles: number;
  errors: string[];
};

export const ingestPaymentHoleritesFromConsolidator = async ({
  files,
  records,
  companies,
  employees,
}: {
  files: File[];
  records: ConsolidatorPayrollRecord[];
  companies: any[];
  employees: any[];
}): Promise<AutoIngestResult> => {
  const result: AutoIngestResult = {
    created: 0,
    duplicates: 0,
    pending: 0,
    skippedFiles: 0,
    advanceFiles: 0,
    errors: [],
  };

  for (const file of files) {
    try {
      const fileRecords = records.filter(record => record.source === file.name);
      const companyLabels = Array.from(new Set(fileRecords.map(record => record.company).filter(Boolean)));
      const competences = Array.from(new Set(fileRecords.map(record => competenceKey(record.competence)).filter(Boolean)));

      if (companyLabels.length !== 1 || competences.length !== 1) {
        result.skippedFiles += 1;
        result.errors.push(`${file.name}: empresa ou competência não pôde ser determinada de forma única.`);
        continue;
      }

      const cnpj = detectedCnpj(companyLabels[0]);
      if (!cnpj || !ALLOWED_CNPJS.has(cnpj)) {
        result.skippedFiles += 1;
        continue;
      }

      const company = companies.find(companyRow => digits(companyRow?.cnpj) === cnpj);
      if (!company?.id) {
        result.skippedFiles += 1;
        result.errors.push(`${file.name}: empresa identificada no PDF não foi localizada no cadastro da Plataforma.`);
        continue;
      }

      const competencia = competences[0];
      const scopedEmployees: PayrollEmployeeMatch[] = employees
        .filter(employee => employee.companyId === company.id && employee.status === 'ativo')
        .map(employee => ({
          id: employee.id,
          name: employee.name,
          cpf: employee.cpf,
          cargo: employee.cargo,
          companyId: employee.companyId,
        }));

      if (!scopedEmployees.length) {
        result.skippedFiles += 1;
        result.errors.push(`${file.name}: nenhum funcionário ativo encontrado para ${company.name || companyLabels[0]}.`);
        continue;
      }

      const parsed = await parsePayrollPdf({ file, employees: scopedEmployees, kind: 'HOLERITE' });
      if (parsed.length && parsed.every(item => looksLikeAdvanceReceipt(item.text))) {
        result.advanceFiles += 1;
        result.errors.push(`${file.name}: é recibo de ADIANTAMENTO e não foi enviado para assinatura de holerite.`);
        continue;
      }

      const sourceHash = await sha256Browser(file);

      for (const item of parsed) {
        if (looksLikeAdvanceReceipt(item.text)) {
          result.advanceFiles += 1;
          continue;
        }

        const pageStart = item.pageNumbers[0] || null;
        const pageEnd = item.pageNumbers[item.pageNumbers.length - 1] || null;

        let duplicateQuery = (supabase as any)
          .from('payroll_documents')
          .select('id')
          .eq('company_id', company.id)
          .eq('competencia', competencia)
          .eq('source_sha256', sourceHash);

        if (pageStart != null) duplicateQuery = duplicateQuery.eq('source_page_start', pageStart);
        if (pageEnd != null) duplicateQuery = duplicateQuery.eq('source_page_end', pageEnd);

        const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) {
          result.duplicates += 1;
          continue;
        }

        const hash = await sha256Browser(item.bytes);
        const path = `${company.id}/${competencia}/holerites/${crypto.randomUUID()}-${safeFile(item.filename)}`;
        const blob = new Blob([item.bytes as any], { type: 'application/pdf' });
        const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, blob, {
          contentType: 'application/pdf',
          upsert: false,
        });
        if (storageError) throw storageError;

        const { error: insertError } = await (supabase as any).from('payroll_documents').insert({
          company_id: company.id,
          employee_id: item.employeeId,
          competencia,
          storage_path: path,
          original_filename: item.filename,
          mime_type: 'application/pdf',
          file_size: item.bytes.byteLength,
          document_sha256: hash,
          source_sha256: sourceHash,
          source_page_start: pageStart,
          source_page_end: pageEnd,
          net_amount: item.amountDetected,
          match_confidence: item.confidence,
          extracted_data: {
            cpf_detectado: item.cpfDetected,
            metodo_vinculo: item.matchMethod,
            paginas: item.pageNumbers,
            origem: 'FECHAMENTO_CONSOLIDADOR_PAGAMENTO',
          },
          status: 'HOLERITE_PENDENTE',
        });

        if (insertError) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insertError;
        }

        result.created += 1;
        if (!item.employeeId) result.pending += 1;
      }
    } catch (error: any) {
      result.skippedFiles += 1;
      result.errors.push(`${file.name}: ${error?.message || error}`);
    }
  }

  return result;
};
