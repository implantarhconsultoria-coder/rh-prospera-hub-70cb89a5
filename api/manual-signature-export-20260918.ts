import { getServiceClient, signedUrl } from '../src/server/payrollServer.js';

export default async function handler(req: any, res: any) {
  if ((req?.method || 'GET') !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    const service = getServiceClient();
    const { data: docs, error: docsError } = await service
      .from('payroll_documents')
      .select('id,company_id,employee_id,competencia,document_type,storage_path,original_filename,mime_type,net_amount,extracted_data,created_at,is_current,confirmed')
      .eq('is_current', true)
      .eq('confirmed', true)
      .in('competencia', ['2026-08', '2026-09'])
      .in('document_type', ['HOLERITE', 'BENEFICIO_VR', 'BENEFICIO_VT', 'ADIANTAMENTO']);
    if (docsError) throw docsError;

    const selected = (docs || []).filter((d: any) => {
      if (d.competencia === '2026-08' && d.document_type === 'HOLERITE') {
        return d.extracted_data?.tipo_documento_detectado === 'SALARY_ADVANCE'
          || d.extracted_data?.subtipo_documento_detectado === 'ADTO';
      }
      if (d.competencia === '2026-09' && ['BENEFICIO_VR','BENEFICIO_VT','HOLERITE','ADIANTAMENTO'].includes(d.document_type)) {
        return true;
      }
      return false;
    });

    const companyIds = [...new Set(selected.map((d: any) => d.company_id))];
    const employeeIds = [...new Set(selected.map((d: any) => d.employee_id))];

    const [{ data: companies, error: companyError }, { data: employees, error: employeeError }] = await Promise.all([
      service.from('empresas').select('id,nome,razao_social,cnpj').in('id', companyIds),
      service.from('funcionarios').select('id,nome,cpf,cargo,status,ativo,data_demissao').in('id', employeeIds),
    ]);
    if (companyError) throw companyError;
    if (employeeError) throw employeeError;

    const companyMap = new Map((companies || []).map((x: any) => [x.id, x]));
    const employeeMap = new Map((employees || []).map((x: any) => [x.id, x]));

    const out = [];
    for (const d of selected) {
      const url = await signedUrl(service, d.storage_path, 3600);
      out.push({
        ...d,
        company: companyMap.get(d.company_id) || null,
        employee: employeeMap.get(d.employee_id) || null,
        signed_url: url,
      });
    }

    out.sort((a: any, b: any) => {
      const c = String(a.company?.nome || '').localeCompare(String(b.company?.nome || ''), 'pt-BR');
      if (c) return c;
      const e = String(a.employee?.nome || '').localeCompare(String(b.employee?.nome || ''), 'pt-BR');
      if (e) return e;
      const order = (d: any) => {
        if (d.competencia === '2026-08' && d.document_type === 'HOLERITE') return 1;
        if (d.document_type === 'BENEFICIO_VR') return 2;
        if (d.document_type === 'BENEFICIO_VT') return 3;
        if (d.document_type === 'HOLERITE') return 4;
        if (d.document_type === 'ADIANTAMENTO') return 5;
        return 9;
      };
      return order(a) - order(b);
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, count: out.length, documents: out });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
