from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Needle not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) A página administrativa vira exclusivamente a central de Assinatura Digital.
folha = '''import React, { useEffect, useMemo, useState } from 'react';
import { Building2, FileSignature } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PayrollSignatureModule from '@/components/payroll/PayrollSignatureModule';
import BenefitSignatureGenerator from '@/components/payroll/BenefitSignatureGenerator';

const digits = (value: unknown) => String(value || '').replace(/\\D/g, '');

const SIGNATURE_COMPANIES = [
  { cnpj: '07291648000103', label: 'TOPAC MATRIZ' },
  { cnpj: '07291648000294', label: 'TOPAC PRAIA GRANDE' },
  { cnpj: '07291648000375', label: 'TOPAC GOIÂNIA' },
  { cnpj: '14464586000150', label: 'ALQUI' },
  { cnpj: '21967711000100', label: 'LMT' },
] as const;

const FolhaPagamentoPage: React.FC = () => {
  const { companies } = useApp();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));

  const signatureCompanies = useMemo(() => SIGNATURE_COMPANIES
    .map(config => {
      const company = companies.find(c => digits(c.cnpj) === config.cnpj);
      return company ? { ...company, signatureLabel: config.label } : null;
    })
    .filter(Boolean) as Array<(typeof companies)[number] & { signatureLabel: string }>, [companies]);

  useEffect(() => {
    if (!signatureCompanies.length) return;
    if (!selectedCompany || !signatureCompanies.some(company => company.id === selectedCompany)) {
      setSelectedCompany(signatureCompanies[0].id);
    }
  }, [signatureCompanies, selectedCompany]);

  const selectedCompanyData = signatureCompanies.find(company => company.id === selectedCompany);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
          <FileSignature className="w-6 h-6" /> Assinatura Digital
        </h1>
        <p className="text-sm text-muted-foreground">Holerites, comprovantes, VR e VT para conferência e assinatura.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {signatureCompanies.map(company => {
          const active = company.id === selectedCompany;
          return (
            <button
              key={company.id}
              type="button"
              onClick={() => setSelectedCompany(company.id)}
              className={`card-premium p-3 text-left transition-all hover:ring-2 hover:ring-primary/30 ${active ? 'ring-2 ring-primary/60 bg-primary/10' : ''}`}
            >
              <Building2 className="w-4 h-4 text-primary mb-2" />
              <span className="block text-xs font-semibold text-foreground">{company.signatureLabel}</span>
              <span className="mt-1 block text-[10px] text-muted-foreground">Clique para abrir</span>
            </button>
          );
        })}
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="w-52">
          <label className="text-xs text-muted-foreground">Competência do documento</label>
          <Input type="month" value={competencia} onChange={event => setCompetencia(event.target.value)} />
        </div>
        <div className="pb-2 text-xs text-muted-foreground">
          Empresa aberta: <strong className="text-foreground">{selectedCompanyData?.signatureLabel || '—'}</strong>
        </div>
      </Card>

      {selectedCompany ? (
        <>
          <PayrollSignatureModule companyId={selectedCompany} competencia={competencia} />
          <BenefitSignatureGenerator companyId={selectedCompany} competencia={competencia} />
        </>
      ) : (
        <Card className="p-6 text-center text-sm text-muted-foreground">Carregando empresas habilitadas para assinatura...</Card>
      )}
    </div>
  );
};

export default FolhaPagamentoPage;
'''
Path('src/pages/FolhaPagamentoPage.tsx').write_text(folha, encoding='utf-8')


# 2) Menu administrativo: acesso direto e explícito à Assinatura Digital.
replace_once(
    'src/components/AppSidebar.tsx',
    "  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento' },\n",
    "  { label: 'Fechamento', icon: FileCheck, path: '/admin/fechamento' },\n  { label: 'Assinatura Digital', icon: Receipt, path: '/admin/folha-pagamento' },\n",
)


# 3) Regras de elegibilidade no módulo administrativo de assinatura.
admin_helper = """\nconst SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || employee?.employee_id || '');\n  const cargo = normalizeSignatureText(employee?.cargo || employee?.employee_role || employee?.employee_cargo);\n  const name = normalizeSignatureText(employee?.name || employee?.nome || employee?.employee_name);\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
replace_once(
    'src/components/payroll/PayrollPortalAdminModule.tsx',
    "const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');\n",
    "const humanStatus = (value: unknown) => String(value || '').replace(/_/g, ' ');\n" + admin_helper,
)
replace_once(
    'src/components/payroll/PayrollPortalAdminModule.tsx',
    ".filter(e => e.companyId === companyId && e.status === 'ativo')\n    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))",
    ".filter(e => e.companyId === companyId && e.status === 'ativo' && !isSignatureExcluded(e))\n    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))",
)
replace_once(
    'src/components/payroll/PayrollPortalAdminModule.tsx',
    ".filter(e => e.companyId === companyId && e.status === 'ativo')\n    .filter(e => {\n      const phone = digits((e as any).celular || (e as any).telefone);",
    ".filter(e => e.companyId === companyId && e.status === 'ativo' && !isSignatureExcluded(e))\n    .filter(e => {\n      const phone = digits((e as any).celular || (e as any).telefone);",
)
replace_once(
    'src/components/payroll/PayrollPortalAdminModule.tsx',
    "      setRows(data || []);",
    "      setRows((data || []).filter((row: any) => !isSignatureExcluded(\n        employees.find((employee: any) => employee.id === row.employee_id) || { id: row.employee_id, name: row.employee_name, cargo: row.employee_role || row.employee_cargo || '' },\n      )));",
)
replace_once(
    'src/components/payroll/PayrollPortalAdminModule.tsx',
    "      const employeeName = receiptPage.employeeName || receiptPage.employeeNameDetected || `PENDENTE_P${receiptPage.pageNumber}`;\n      const pairBytes = await mergePairPdfBytes",
    "      const employeeName = receiptPage.employeeName || receiptPage.employeeNameDetected || `PENDENTE_P${receiptPage.pageNumber}`;\n      const identifiedEmployee = employeeId ? employees.find((employee: any) => employee.id === employeeId) : null;\n      if (isSignatureExcluded(identifiedEmployee || { id: employeeId, name: employeeName })) {\n        console.info('[payroll-signature-excluded]', { employeeId, employeeName, reason: 'SOCIO_PRO_LABORE' });\n        continue;\n      }\n      const pairBytes = await mergePairPdfBytes",
)


# 4) VR/VT: só funcionários elegíveis entram na geração para assinatura.
benefit_helper = """\nconst SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || '');\n  const cargo = normalizeSignatureText(employee?.cargo);\n  const name = normalizeSignatureText(employee?.name || employee?.nome);\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
replace_once(
    'src/components/payroll/BenefitSignatureGenerator.tsx',
    "const VT_TYPE = 'BENEFICIO_VT';\n",
    "const VT_TYPE = 'BENEFICIO_VT';\n" + benefit_helper,
)
replace_once(
    'src/components/payroll/BenefitSignatureGenerator.tsx',
    ".filter((employee: any) => employee.companyId === companyId && employee.status === 'ativo' && (employee.vrAtivo || employee.vtAtivo))",
    ".filter((employee: any) => employee.companyId === companyId && employee.status === 'ativo' && (employee.vrAtivo || employee.vtAtivo) && !isSignatureExcluded(employee))",
)


# 5) Backend público: sócio/pró-labore não consegue autenticar nem reutilizar sessão antiga.
public_helper = """\nconst SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || employee?.employee_id || '');\n  const cargo = normalizeSignatureText(employee?.cargo);\n  const name = normalizeSignatureText(employee?.nome || employee?.name);\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
replace_once(
    'api/payroll-public.ts',
    "const normalizeCompanyScope = (value: unknown) => String(value || '').trim().toLowerCase();\n",
    "const normalizeCompanyScope = (value: unknown) => String(value || '').trim().toLowerCase();\n" + public_helper,
)
replace_once(
    'api/payroll-public.ts',
    "  if (data.company_id !== expectedCompanyId) {\n    throw Object.assign(new Error('invalid_session'), { status: 401 });\n  }\n  await assertCompanyEnabled(service, data.company_id);",
    "  if (data.company_id !== expectedCompanyId) {\n    throw Object.assign(new Error('invalid_session'), { status: 401 });\n  }\n  const { data: sessionEmployee } = await service.from('funcionarios').select('id,nome,cargo').eq('id', data.employee_id).maybeSingle();\n  if (isSignatureExcluded(sessionEmployee || { id: data.employee_id })) {\n    await service.from('payroll_public_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', data.id);\n    throw Object.assign(new Error('invalid_session'), { status: 401 });\n  }\n  await assertCompanyEnabled(service, data.company_id);",
)
replace_once(
    'api/payroll-public.ts',
    "  if (employeeError || !employee) throw Object.assign(new Error('employee_not_found'), { status: 404 });\n\n  const phone = normalizePhone",
    "  if (employeeError || !employee) throw Object.assign(new Error('employee_not_found'), { status: 404 });\n  if (isSignatureExcluded(employee)) throw Object.assign(new Error('document_not_available'), { status: 404 });\n\n  const phone = normalizePhone",
)
replace_once(
    'api/payroll-public.ts',
    "  if (employeeError || !employee) return genericIdentityError(res);\n\n  const documents = await availableDocuments",
    "  if (employeeError || !employee) return genericIdentityError(res);\n  if (isSignatureExcluded(employee)) {\n    await service.from('payroll_public_access_attempts').insert({ identifier_hash: identifierHash, ip, success: false, failure_reason: 'SIGNATURE_EXCLUDED' });\n    return genericIdentityError(res);\n  }\n\n  const documents = await availableDocuments",
)


# 6) Arquivo do portal: uma sessão de sócio/pró-labore também é recusada.
archive_helper = """\nconst SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || employee?.employee_id || '');\n  const cargo = normalizeText(employee?.cargo).replace(/[^a-z0-9]+/g, ' ');\n  const name = normalizeText(employee?.nome || employee?.name).replace(/[^a-z0-9]+/g, ' ');\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
replace_once(
    'api/payroll-archive.ts',
    "const normalizeText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase();\n",
    "const normalizeText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase();\n" + archive_helper,
)
replace_once(
    'api/payroll-archive.ts',
    "  if (data.company_id !== expectedCompanyId) {\n    throw Object.assign(new Error('invalid_session'), { status: 401 });\n  }\n\n  await service.from('payroll_public_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);",
    "  if (data.company_id !== expectedCompanyId) {\n    throw Object.assign(new Error('invalid_session'), { status: 401 });\n  }\n  const { data: sessionEmployee } = await service.from('funcionarios').select('id,nome,cargo').eq('id', data.employee_id).maybeSingle();\n  if (isSignatureExcluded(sessionEmployee || { id: data.employee_id })) {\n    await service.from('payroll_public_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', data.id);\n    throw Object.assign(new Error('invalid_session'), { status: 401 });\n  }\n\n  await service.from('payroll_public_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);",
)

print('TOPAC signature-only page and eligibility rules applied successfully.')
