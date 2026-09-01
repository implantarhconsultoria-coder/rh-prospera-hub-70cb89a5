import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');

const replaceOrConfirm = (path, original, replacement, confirmMarker) => {
  const source = read(path);
  if (source.includes(confirmMarker)) return;
  const count = source.split(original).length - 1;
  if (count !== 1) throw new Error(`${path}: padrão esperado não encontrado de forma única (${count})`);
  write(path, source.replace(original, replacement));
};

// A assinatura usa um único instante autoritativo do PostgreSQL.
// O mesmo instante é formatado com o offset real de America/Sao_Paulo para o certificado,
// mantendo a fração de segundo entregue pelo banco.
replaceOrConfirm(
  'api/payroll-public.ts',
  "      const signedAt = new Date().toISOString();",
  `      const { data: authoritativeNow, error: authoritativeNowError } = await service.rpc('payroll_authoritative_now');
      if (authoritativeNowError || !authoritativeNow) throw new Error('authoritative_signature_clock_failed');
      const authoritativeRaw = String(authoritativeNow);
      const authoritativeDate = new Date(authoritativeRaw);
      if (Number.isNaN(authoritativeDate.getTime())) throw new Error('authoritative_signature_clock_invalid');
      const saoPauloParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(authoritativeDate).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      const timezoneName = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', timeZoneName: 'longOffset',
      }).formatToParts(authoritativeDate).find(part => part.type === 'timeZoneName')?.value || 'GMT-03:00';
      const offset = timezoneName.replace('GMT', '') || '-03:00';
      const fraction = (authoritativeRaw.match(/\\.(\\d{1,6})/)?.[1] || String(authoritativeDate.getUTCMilliseconds()).padStart(3, '0'));
      const signedAt = \`${'${saoPauloParts.year}'}-${'${saoPauloParts.month}'}-${'${saoPauloParts.day}'}T${'${saoPauloParts.hour}'}:${'${saoPauloParts.minute}'}:${'${saoPauloParts.second}'}.${'${fraction}'}${'${offset}'}\`;`,
  "service.rpc('payroll_authoritative_now')",
);

// O dossiê de uma folha inclui tudo que foi assinado no ciclo:
// HOLERITE/ADIANTAMENTO da competência da folha + VR/VT da competência antecipada seguinte.
const uiPath = 'src/components/payroll/PayrollPortalAdminModule.tsx';
let ui = read(uiPath);
if (!ui.includes("dossier-cycle-signed-documents")) {
  const start = ui.indexOf('  const dossier = async (row: any) => {');
  if (start < 0) throw new Error(`${uiPath}: função dossier não encontrada`);
  const next = ui.indexOf('\n\n  const consolidated = async () => {', start);
  if (next < 0) throw new Error(`${uiPath}: limite da função dossier não encontrado`);

  const dossier = `  const dossier = async (row: any) => {
    if (row.signature_status !== 'ASSINADO') return toast.error('O dossiê final exige assinatura concluída.');
    try {
      // dossier-cycle-signed-documents
      const [yearText, monthText] = competencia.split('-');
      const benefitDate = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
      const benefitCompetencia = \`${'${benefitDate.getUTCFullYear()}'}-${'${String(benefitDate.getUTCMonth() + 1).padStart(2, \'0\')}'}\`;
      const { data: dossierRows, error: dossierError } = await (supabase as any)
        .from('payroll_admin_status_v')
        .select('document_id,document_type,competencia,signature_status,signed_at,employee_id')
        .eq('company_id', companyId)
        .eq('employee_id', row.employee_id)
        .in('competencia', [competencia, benefitCompetencia])
        .eq('signature_status', 'ASSINADO');
      if (dossierError) throw dossierError;

      const payrollTypes = new Set(['HOLERITE', 'ADIANTAMENTO']);
      const benefitTypes = new Set(['BENEFICIO_VR', 'BENEFICIO_VT', 'BENEFICIO_VR_VT']);
      const typeOrder: Record<string, number> = {
        HOLERITE: 10,
        ADIANTAMENTO: 20,
        BENEFICIO_VR: 30,
        BENEFICIO_VT: 40,
        BENEFICIO_VR_VT: 50,
      };
      const typeLabel: Record<string, string> = {
        HOLERITE: 'Holerite',
        ADIANTAMENTO: 'Adiantamento',
        BENEFICIO_VR: 'Recibo VR',
        BENEFICIO_VT: 'Recibo VT',
        BENEFICIO_VR_VT: 'Recibo VR + VT',
      };

      const cycleRows = (dossierRows || [])
        .filter((item: any) =>
          (item.competencia === competencia && payrollTypes.has(String(item.document_type || '')))
          || (item.competencia === benefitCompetencia && benefitTypes.has(String(item.document_type || ''))),
        )
        .sort((a: any, b: any) =>
          (typeOrder[String(a.document_type || '')] || 99) - (typeOrder[String(b.document_type || '')] || 99)
          || new Date(a.signed_at || 0).getTime() - new Date(b.signed_at || 0).getTime(),
        );

      if (!cycleRows.length) throw new Error('Nenhum documento assinado encontrado para este ciclo.');
      const sources: Array<{url:string;label:string}> = [];
      for (const item of cycleRows) {
        const urls = await apiCall('signed-urls', { document_id: item.document_id });
        const label = typeLabel[String(item.document_type || '')] || String(item.document_type || 'Documento');
        if (urls.holerite_url) sources.push({ url: urls.holerite_url, label: \`${'${label}'} ${'${item.competencia}'}\` });
        if (!urls.document_includes_bank_proof && urls.receipt_url) sources.push({ url: urls.receipt_url, label: \`Comprovante ${'${item.competencia}'}\` });
        if (urls.certificate_url) sources.push({ url: urls.certificate_url, label: \`Certificado ${'${label}'} ${'${item.competencia}'}\` });
      }
      if (!sources.length) throw new Error('Dossiê incompleto: arquivos assinados indisponíveis.');
      await mergePdfUrls(sources, \`DOSSIE_ASSINATURAS_${'${safeFile(row.employee_name || \'FUNCIONARIO\')}'}_${'${competencia}'}.pdf\`);
    } catch (error: any) { toast.error(error.message); }
  };`;

  ui = ui.slice(0, start) + dossier + ui.slice(next);
  write(uiPath, ui);
}

console.log('[payroll-signature-patch] horário oficial e dossiê completo garantidos');
