from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Needle not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

role_helper_admin_old = """const SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || employee?.employee_id || '');\n  const cargo = normalizeSignatureText(employee?.cargo || employee?.employee_role || employee?.employee_cargo);\n  const name = normalizeSignatureText(employee?.name || employee?.nome || employee?.employee_name);\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
role_helper_admin_new = """const normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const cargo = normalizeSignatureText(employee?.cargo || employee?.employee_role || employee?.employee_cargo);\n  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');\n};\n"""
replace_once('src/components/payroll/PayrollPortalAdminModule.tsx', role_helper_admin_old, role_helper_admin_new)

old_scoped = """  const scopedEmployees = useMemo<PayrollEmployeeMatch[]>(() => employees\n    .filter(e => e.companyId === companyId && e.status === 'ativo' && !isSignatureExcluded(e))\n    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))\n    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);\n"""
new_scoped = """  const matchingEmployees = useMemo<PayrollEmployeeMatch[]>(() => employees\n    .filter(e => e.companyId === companyId && (e.status === 'ativo' || isSignatureExcluded(e)))\n    .map(e => ({ id: e.id, name: e.name, cpf: e.cpf, cargo: e.cargo, companyId: e.companyId }))\n    .sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')), [employees, companyId]);\n\n  const scopedEmployees = useMemo<PayrollEmployeeMatch[]>(() => matchingEmployees\n    .filter(e => !isSignatureExcluded(e)), [matchingEmployees]);\n"""
replace_once('src/components/payroll/PayrollPortalAdminModule.tsx', old_scoped, new_scoped)
replace_once(
    'src/components/payroll/PayrollPortalAdminModule.tsx',
    "const analyses = await analyzePayrollFiles({ files: [file], employees: scopedEmployees });",
    "const analyses = await analyzePayrollFiles({ files: [file], employees: matchingEmployees });",
)

benefit_old = """const SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || '');\n  const cargo = normalizeSignatureText(employee?.cargo);\n  const name = normalizeSignatureText(employee?.name || employee?.nome);\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
benefit_new = """const normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const cargo = normalizeSignatureText(employee?.cargo);\n  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');\n};\n"""
replace_once('src/components/payroll/BenefitSignatureGenerator.tsx', benefit_old, benefit_new)

public_old = """const SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || employee?.employee_id || '');\n  const cargo = normalizeSignatureText(employee?.cargo);\n  const name = normalizeSignatureText(employee?.nome || employee?.name);\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
public_new = """const normalizeSignatureText = (value: unknown) => String(value || '')\n  .normalize('NFD')\n  .replace(/[\\u0300-\\u036f]/g, '')\n  .toLowerCase()\n  .replace(/[^a-z0-9]+/g, ' ')\n  .trim();\nconst isSignatureExcluded = (employee: any) => {\n  const cargo = normalizeSignatureText(employee?.cargo);\n  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');\n};\n"""
replace_once('api/payroll-public.ts', public_old, public_new)

archive_old = """const SIGNATURE_EXCLUDED_EMPLOYEE_IDS = new Set([\n  '2e736835-f228-49ec-80ee-e893172aeb44',\n  'f2a7cbe6-ca51-4f39-a7b8-b7843599793e',\n  '57abf7fb-8895-4881-8946-952a4d5e1a44',\n]);\nconst isSignatureExcluded = (employee: any) => {\n  const id = String(employee?.id || employee?.employee_id || '');\n  const cargo = normalizeText(employee?.cargo).replace(/[^a-z0-9]+/g, ' ');\n  const name = normalizeText(employee?.nome || employee?.name).replace(/[^a-z0-9]+/g, ' ');\n  return SIGNATURE_EXCLUDED_EMPLOYEE_IDS.has(id)\n    || cargo.includes('socio')\n    || cargo.includes('pro labore')\n    || name.includes('aitor urcelay')\n    || name.includes('robson chafi');\n};\n"""
archive_new = """const isSignatureExcluded = (employee: any) => {\n  const cargo = normalizeText(employee?.cargo).replace(/[^a-z0-9]+/g, ' ');\n  return cargo.includes('socio') || cargo.includes('pro labore') || cargo.includes('prolabore');\n};\n"""
replace_once('api/payroll-archive.ts', archive_old, archive_new)

print('Signature eligibility now uses role only; no employee names or ids are hardcoded.')
