const clean = (value: unknown) => String(value || '').trim();
const digits = (value: unknown) => clean(value).replace(/\D/g, '');
const normalize = (value: unknown) => ` ${clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()} `;

const aliasesFor = (company: any) => {
  const code = clean(company?.codigo).toLowerCase();
  const aliases = new Set<string>();
  const fullName = normalize(company?.nome).trim();
  if (fullName) aliases.add(fullName);

  if (code === 'alqui') {
    aliases.add('alqui obras');
    aliases.add('alqui');
  } else if (code === 'lmt') {
    aliases.add('lmt');
  } else if (code === 'topac-matriz') {
    aliases.add('topac matriz');
  } else if (code === 'topac-pg') {
    aliases.add('topac filial praia grande');
    aliases.add('topac praia grande');
  } else if (code === 'topac-gyn') {
    aliases.add('topac filial goiania');
    aliases.add('topac goiania');
  }

  return Array.from(aliases).filter(alias => alias.length >= 3);
};

const detectCompanies = (text: string, companies: any[]) => {
  const normalizedText = normalize(text);
  const digitText = digits(text);
  const byCnpj = new Set<string>();
  const byName = new Set<string>();

  for (const company of companies || []) {
    const id = clean(company?.id);
    if (!id) continue;
    const cnpj = digits(company?.cnpj);
    if (cnpj.length === 14 && digitText.includes(cnpj)) byCnpj.add(id);

    for (const alias of aliasesFor(company)) {
      const normalizedAlias = normalize(alias).trim();
      if (normalizedAlias && normalizedText.includes(` ${normalizedAlias} `)) {
        byName.add(id);
        break;
      }
    }
  }

  return { byCnpj, byName };
};

export async function validateAccountingPdfCompany(
  service: any,
  bucket: string,
  path: string,
  expectedCompanyId: string,
) {
  const [{ data: expected, error: expectedError }, { data: companies, error: companiesError }] = await Promise.all([
    service.from('empresas').select('id,nome,codigo,cnpj').eq('id', expectedCompanyId).maybeSingle(),
    service.from('empresas').select('id,nome,codigo,cnpj'),
  ]);
  if (expectedError || !expected) throw expectedError || new Error('empresa_nao_encontrada');
  if (companiesError) throw companiesError;

  const { data: file, error: downloadError } = await service.storage.from(bucket).download(path);
  if (downloadError || !file) throw downloadError || new Error('pdf_nao_encontrado');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('pdf_vazio');

  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  });

  let pdf: any = null;
  try {
    pdf = await loading.promise;
    let text = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      text += '\n' + (content.items || []).map((item: any) => clean(item?.str)).filter(Boolean).join(' ');
      try { page.cleanup?.(); } catch { /* noop */ }
    }

    const detected = detectCompanies(text, companies || []);
    const companyMap = new Map((companies || []).map((row: any) => [clean(row.id), row]));

    if (detected.byCnpj.size > 1) {
      return {
        ok: false,
        code: 'pdf_mistura_empresas',
        message: `Arquivo bloqueado: o PDF contém documentos de mais de uma empresa. Envie somente documentos de ${expected.nome}.`,
      };
    }

    if (detected.byCnpj.size === 1) {
      const [detectedId] = Array.from(detected.byCnpj);
      if (detectedId !== expectedCompanyId) {
        const found = companyMap.get(detectedId);
        return {
          ok: false,
          code: 'empresa_documento_divergente',
          message: `Arquivo bloqueado: este PDF pertence a ${clean(found?.nome) || 'outra empresa'} e não pode ser enviado em ${expected.nome}.`,
        };
      }
      return { ok: true, method: 'cnpj', company: expected };
    }

    if (detected.byName.size > 1) {
      return {
        ok: false,
        code: 'pdf_mistura_empresas',
        message: `Arquivo bloqueado: foram identificadas referências a mais de uma empresa. Envie somente documentos de ${expected.nome}.`,
      };
    }

    if (detected.byName.size === 1) {
      const [detectedId] = Array.from(detected.byName);
      if (detectedId !== expectedCompanyId) {
        const found = companyMap.get(detectedId);
        return {
          ok: false,
          code: 'empresa_documento_divergente',
          message: `Arquivo bloqueado: este PDF foi identificado como ${clean(found?.nome) || 'outra empresa'} e não pode ser enviado em ${expected.nome}.`,
        };
      }
      return { ok: true, method: 'nome', company: expected };
    }

    return {
      ok: false,
      code: 'empresa_documento_nao_identificada',
      message: `Arquivo bloqueado: não foi possível confirmar que este PDF pertence a ${expected.nome}. Verifique o documento e tente novamente.`,
    };
  } finally {
    try { await loading.destroy?.(); } catch { /* noop */ }
    try { await pdf?.destroy?.(); } catch { /* noop */ }
  }
}
