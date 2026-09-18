import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getServiceClient } from '../src/server/payrollServer.js';

const COMPANY_NAMES: Record<string, string> = {
  'topac-matriz': 'TOPAC MATRIZ',
  'topac-praia-grande': 'TOPAC FILIAL PRAIA GRANDE',
  'topac-goiania': 'TOPAC FILIAL GOIANIA',
  'alqui-obras': 'ALQUI OBRAS',
  'lmt': 'LMT',
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

const ptDate = (value: string | null | undefined, fallback: string) => {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fallback;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const eventInfo = (doc: any) => {
  if (doc.competencia === '2026-08' && doc.document_type === 'HOLERITE') {
    return { order: 1, label: 'Recibo / adiantamento - referencia de 20/08', date: '20/08/2026' };
  }
  if (doc.document_type === 'BENEFICIO_VR') {
    return {
      order: 2,
      label: 'Vale Refeicao (VR) - competencia 09/2026',
      date: ptDate(doc.extracted_data?.data_pagamento, '31/08/2026'),
    };
  }
  if (doc.document_type === 'BENEFICIO_VT') {
    return {
      order: 3,
      label: 'Vale Transporte (VT) - competencia 09/2026',
      date: ptDate(doc.extracted_data?.data_pagamento, '31/08/2026'),
    };
  }
  if (doc.document_type === 'HOLERITE') {
    return { order: 4, label: 'Salario / Holerite - referencia do dia 05', date: '05/09/2026' };
  }
  if (doc.document_type === 'RECIBO_GARAGEM') {
    return { order: 5, label: 'Recibo de Garagem - referencia do dia 05', date: '05/09/2026' };
  }
  if (doc.document_type === 'AVISO_FERIAS') {
    return {
      order: 6,
      label: 'Aviso de Ferias - referencia de emissao',
      date: ptDate(doc.created_at, '12/09/2026'),
    };
  }
  if (doc.document_type === 'ADIANTAMENTO') {
    return { order: 7, label: 'Adiantamento salarial - referencia do dia 20', date: '20/09/2026' };
  }
  return { order: 9, label: doc.document_type || 'Documento', date: '' };
};

const wrap = (text: string, font: any, size: number, maxWidth: number) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
};

const drawCover = async (pdf: PDFDocument, company: any, employee: any, docs: any[], regular: any, bold: any) => {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const dark = rgb(0.08, 0.10, 0.16);
  const muted = rgb(0.35, 0.39, 0.47);
  const line = rgb(0.82, 0.84, 0.88);

  page.drawText('DOCUMENTOS PARA ASSINATURA MANUAL', {
    x: MARGIN, y: PAGE_H - 72, size: 18, font: bold, color: dark,
  });
  page.drawLine({ start: { x: MARGIN, y: PAGE_H - 84 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 84 }, thickness: 1.2, color: line });

  page.drawText('EMPRESA', { x: MARGIN, y: PAGE_H - 120, size: 9, font: bold, color: muted });
  page.drawText(String(company.nome || ''), { x: MARGIN, y: PAGE_H - 141, size: 13, font: bold, color: dark });

  page.drawText('FUNCIONARIO', { x: MARGIN, y: PAGE_H - 178, size: 9, font: bold, color: muted });
  const nameLines = wrap(String(employee.nome || ''), bold, 15, PAGE_W - MARGIN * 2);
  let nameY = PAGE_H - 200;
  for (const ln of nameLines) {
    page.drawText(ln, { x: MARGIN, y: nameY, size: 15, font: bold, color: dark });
    nameY -= 19;
  }

  const boxTop = nameY - 18;
  const boxHeight = 72;
  page.drawRectangle({ x: MARGIN, y: boxTop - boxHeight, width: PAGE_W - MARGIN * 2, height: boxHeight, borderWidth: 1, borderColor: line });
  page.drawText('ORIENTACAO PARA ASSINATURA', { x: MARGIN + 14, y: boxTop - 21, size: 10, font: bold, color: dark });
  const instruction = 'As datas abaixo identificam o pagamento ou a referencia de cada documento. A assinatura manual deve ser feita com a data real em que for coletada.';
  const insLines = wrap(instruction, regular, 9.5, PAGE_W - MARGIN * 2 - 28);
  let iy = boxTop - 40;
  for (const ln of insLines) {
    page.drawText(ln, { x: MARGIN + 14, y: iy, size: 9.5, font: regular, color: muted });
    iy -= 13;
  }

  let y = boxTop - boxHeight - 34;
  page.drawText('DATA DE PAGAMENTO / REFERENCIA', { x: MARGIN, y, size: 11, font: bold, color: dark });
  y -= 24;

  docs.forEach((doc, index) => {
    const info = eventInfo(doc);
    page.drawText(String(index + 1).padStart(2, '0'), { x: MARGIN, y, size: 10, font: bold, color: muted });
    const labelLines = wrap(info.label, regular, 10.5, 320);
    page.drawText(labelLines[0], { x: MARGIN + 28, y, size: 10.5, font: regular, color: dark });
    if (labelLines[1]) {
      page.drawText(labelLines[1], { x: MARGIN + 28, y: y - 14, size: 10.5, font: regular, color: dark });
    }
    page.drawText(info.date, { x: PAGE_W - MARGIN - 82, y, size: 10.5, font: bold, color: dark });
    y -= labelLines[1] ? 38 : 29;
  });

  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: line });
  y -= 32;
  page.drawText('Assinatura do funcionario:', { x: MARGIN, y, size: 10, font: regular, color: muted });
  page.drawLine({ start: { x: MARGIN + 128, y: y - 2 }, end: { x: PAGE_W - MARGIN, y: y - 2 }, thickness: 0.8, color: muted });
  y -= 34;
  page.drawText('Data real da assinatura:', { x: MARGIN, y, size: 10, font: regular, color: muted });
  page.drawText('____/____/________', { x: MARGIN + 120, y, size: 10, font: bold, color: dark });

  page.drawText('Pacote preparado para coleta de assinatura manual.', {
    x: MARGIN, y: 42, size: 8.5, font: regular, color: muted,
  });
};

export default async function handler(req: any, res: any) {
  if ((req?.method || 'GET') !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const rawToken = String(req.query?.token || '');
  const companySlug = String(req.query?.company || '');
  const mode = String(req.query?.mode || 'download');
  if (!rawToken || !COMPANY_NAMES[companySlug]) {
    res.status(404).end();
    return;
  }

  const service = getServiceClient();
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const { data: tokenRow, error: tokenError } = await service
    .from('temp_manual_export_tokens')
    .select('token_hash,expires_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (tokenError || !tokenRow) {
    res.status(404).end();
    return;
  }

  try {
    const tempBucket = 'temp-manual-signature-export-20260918';
    if (mode === 'cleanup') {
      const objectPath = String(req.query?.object || '');
      if (!objectPath || !objectPath.startsWith(companySlug + '/')) {
        res.status(400).json({ ok: false, error: 'invalid_object' });
        return;
      }
      const { error: removeError } = await service.storage.from(tempBucket).remove([objectPath]);
      if (removeError) throw removeError;
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true, removed: objectPath });
      return;
    }

    if (mode === 'drop-bucket') {
      const { data: listed } = await service.storage.from(tempBucket).list(companySlug, { limit: 1000 });
      const paths = (listed || []).map((x: any) => companySlug + '/' + x.name);
      if (paths.length) await service.storage.from(tempBucket).remove(paths);
      const { error: deleteError } = await service.storage.deleteBucket(tempBucket);
      if (deleteError && !String(deleteError.message || '').toLowerCase().includes('not found')) throw deleteError;
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ ok: true });
      return;
    }

    const companyName = COMPANY_NAMES[companySlug];
    const { data: company, error: companyError } = await service
      .from('empresas')
      .select('id,nome,razao_social,cnpj')
      .eq('nome', companyName)
      .single();
    if (companyError || !company) throw companyError || new Error('company_not_found');

    const { data: docs, error: docsError } = await service
      .from('payroll_documents')
      .select('id,company_id,employee_id,competencia,document_type,storage_bucket,storage_path,original_filename,mime_type,net_amount,extracted_data,created_at,is_current,confirmed')
      .eq('company_id', company.id)
      .eq('is_current', true)
      .eq('confirmed', true)
      .in('competencia', ['2026-08', '2026-09'])
      .in('document_type', ['HOLERITE', 'BENEFICIO_VR', 'BENEFICIO_VT', 'ADIANTAMENTO', 'RECIBO_GARAGEM', 'AVISO_FERIAS']);
    if (docsError) throw docsError;

    const selected = (docs || []).filter((d: any) => {
      if (d.competencia === '2026-08' && d.document_type === 'HOLERITE') return true;
      if (d.competencia === '2026-09' && ['BENEFICIO_VR','BENEFICIO_VT','HOLERITE','ADIANTAMENTO','RECIBO_GARAGEM','AVISO_FERIAS'].includes(d.document_type)) return true;
      return false;
    });

    const employeeIds = [...new Set(selected.map((d: any) => d.employee_id))];
    const { data: employees, error: employeeError } = await service
      .from('funcionarios')
      .select('id,nome,cpf,cargo,status,ativo,data_demissao')
      .in('id', employeeIds);
    if (employeeError) throw employeeError;

    const employeeMap = new Map((employees || []).map((x: any) => [x.id, x]));
    const byEmployee = new Map<string, any[]>();
    for (const d of selected) {
      const arr = byEmployee.get(d.employee_id) || [];
      arr.push(d);
      byEmployee.set(d.employee_id, arr);
    }

    const employeeOrder = [...byEmployee.keys()].sort((a, b) =>
      String(employeeMap.get(a)?.nome || '').localeCompare(String(employeeMap.get(b)?.nome || ''), 'pt-BR')
    );

    const out = await PDFDocument.create();
    const regular = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);

    for (const employeeId of employeeOrder) {
      const employee = employeeMap.get(employeeId);
      if (!employee) continue;
      const employeeDocs = (byEmployee.get(employeeId) || []).sort((a, b) => eventInfo(a).order - eventInfo(b).order);

      await drawCover(out, company, employee, employeeDocs, regular, bold);

      for (const d of employeeDocs) {
        const { data: blob, error: downloadError } = await service.storage.from(d.storage_bucket || 'payroll-private').download(d.storage_path);
        if (downloadError || !blob) throw downloadError || new Error(`download_failed:${d.id}`);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach((p) => out.addPage(p));
      }
    }

    out.setTitle(`Assinaturas manuais - ${company.nome}`);
    out.setSubject('Documentos organizados por funcionario para assinatura manual');
    out.setCreator('TOPAC RH PRO');
    out.setProducer('TOPAC RH PRO');

    const bytes = await out.save({ useObjectStreams: false });
    const filename = `ASSINATURAS_MANUAIS_${companySlug.toUpperCase().replace(/-/g, '_')}_2026-08-20_A_2026-09-20.pdf`;

    if (mode === 'upload') {
      const { data: existingBucket } = await service.storage.getBucket(tempBucket);
      if (!existingBucket) {
        const { error: createBucketError } = await service.storage.createBucket(tempBucket, {
          public: true,
          fileSizeLimit: 50 * 1024 * 1024,
          allowedMimeTypes: ['application/pdf'],
        });
        if (createBucketError) throw createBucketError;
      }

      const objectPath = `${companySlug}/${randomUUID()}.pdf`;
      const { error: uploadError } = await service.storage.from(tempBucket).upload(
        objectPath,
        Buffer.from(bytes),
        { contentType: 'application/pdf', cacheControl: '60', upsert: false },
      );
      if (uploadError) throw uploadError;
      const { data: publicData } = service.storage.from(tempBucket).getPublicUrl(objectPath);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        ok: true,
        url: publicData.publicUrl,
        object: objectPath,
        filename,
        pages: out.getPageCount(),
        employees: employeeOrder.length,
      });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.status(200).send(Buffer.from(bytes));
  } catch (error: any) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
