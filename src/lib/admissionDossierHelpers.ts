import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { getWorkingDays } from '@/lib/workingDays';
import { parseBankingText } from '@/lib/bankingParser';

export type DossierFields = {
  nome: string; cpf: string; rg: string; data_nascimento: string; endereco: string;
  celular: string; email: string; filiacao: string; escolaridade: string; experiencia: string;
  epi: string; funcao: string;
};
export type DossierRead = { fields: Partial<DossierFields>; banking: ReturnType<typeof parseBankingText>['data']; warnings: string[] };

const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const brToIso = (value: string) => {
  const m = value.match(/(\d{2})[/. -](\d{2})[/. -](\d{4})/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
};
const clean = (value: string) => value.replace(/\s+/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
const field = (text: string, patterns: RegExp[]): string => {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  for (const re of patterns) {
    for (const line of lines) {
      const match = line.match(re);
      if (match?.[1]) return clean(match[1]);
    }
  }
  return '';
};

export const readAdmissionDossier = (raw: string): DossierRead => {
  const text = raw.replace(/\r/g, '').trim();
  const warnings: string[] = [];
  const fields: Partial<DossierFields> = {};
  const find = (...patterns: RegExp[]) => field(text, patterns);
  const name = find(/^(?:nome completo|nome civil|nome do trabalhador)\s*[:\-]?\s*(.+)$/i);
  const cpf = find(/^(?:cpf\s*\/\s*n[uú]mero da cin|cpf do candidato|cpf)\s*[:\-]?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}|\d{11})/i);
  const birth = find(/^(?:nascimento|data de nascimento)\s*[:\-]?\s*(\d{2}[/. -]\d{2}[/. -]\d{4})/i);
  const mother = find(/^(?:filia[cç][aã]o\s*[-:]\s*m[aã]e|nome da m[aã]e)\s*[:\-]?\s*(.+)$/i);
  const father = find(/^(?:filia[cç][aã]o\s*[-:]\s*pai|nome do pai)\s*[:\-]?\s*(.+)$/i);
  const street = find(/^(?:logradouro|rua\s*\/\s*logradouro|endere[cç]o declarado)\s*[:\-]?\s*(.+)$/i);
  const district = find(/^(?:bairro\s*\/\s*cep|bairro)\s*[:\-]?\s*(.+)$/i);
  const city = find(/^(?:cidade\s*\/\s*uf|cidade)\s*[:\-]?\s*(.+)$/i);
  const phone = find(/^(?:celular|telefone celular|whatsapp)\s*[:\-]?\s*(\(?\d{2}\)?\s*9?\d{4,5}[-\s]?\d{4})/i);
  const email = find(/^(?:e-?mail)\s*[:\-]?\s*([^\s@]+@[^\s@]+\.[^\s@]+)/i);
  const role = find(/^(?:cargo pretendido|vaga pretendida|fun[cç][aã]o pretendida)\s*[:\-]?\s*(.+)$/i);
  const school = find(/^(?:escolaridade|forma[cç][aã]o escolar)\s*[:\-]?\s*(.+)$/i);
  const clothes = find(/^(?:medidas de epi|tamanhos de epi)\s*[:\-]?\s*(.+)$/i);
  if (name) fields.nome = name;
  if (cpf) fields.cpf = cpf;
  if (birth) fields.data_nascimento = brToIso(birth);
  if (mother || father) fields.filiacao = [mother ? 'Mãe: ' + mother : '', father ? 'Pai: ' + father : ''].filter(Boolean).join(' | ');
  if (street) fields.endereco = [street, district, city].filter(Boolean).join(' | ');
  if (phone) fields.celular = phone;
  if (email) fields.email = email;
  if (role) fields.funcao = role;
  if (school) fields.escolaridade = school;
  if (clothes) fields.epi = clothes;

  if (/diverg[eê]ncia\s+(?:na\s+)?(?:data|ficha)|endere[cç]o\s+diferente|pend[eê]ncias?\s+de\s+confer[eê]ncia/i.test(norm(text))) {
    warnings.push('Há divergências documentais indicadas no material. Confira nascimento, endereço e vínculos antes de liberar a admissão.');
  }
  if (/assinaturas? digitais?.{0,180}(?:n[aã]o|sem)\s+(?:preserv|valid)/i.test(norm(text))) {
    warnings.push('A compilação não substitui os PDFs originais para validar assinatura digital.');
  }
  const bankText = text.split(/\n/).filter(line =>
    /^\s*(banco|ag[eê]ncia|conta|titular|cpf do titular|chave pix|pix)\b/i.test(line)).join('\n');
  const banking = parseBankingText(bankText).data;
  return { fields, banking, warnings };
};

export const businessDaysForAdmission = (competencia: string, startDate: string, holidays: string[]) => {
  if (!/^\d{4}-\d{2}$/.test(competencia)) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 0;
  if (startDate.slice(0,7) > competencia) return 0;
  if (startDate.slice(0,7) < competencia) return getWorkingDays(competencia, holidays);
  const [year, month] = competencia.split('-').map(Number);
  const holidaySet = new Set(holidays);
  let count = 0;
  for (let d = Number(startDate.slice(8)); d <= new Date(year,month,0).getDate(); d += 1) {
    const date = new Date(year, month - 1, d);
    const iso = competencia + '-' + String(d).padStart(2,'0');
    if (date.getDay() !== 0 && date.getDay() !== 6 && !holidaySet.has(iso)) count++;
  }
  return count;
};

export const benefitAmount = (value: number, days: number) =>
  Math.round((Number(value || 0) * Number(days || 0) + Number.EPSILON) * 100) / 100;

const safe = (value: unknown) => String(value ?? '').replace(/\s+/g,' ').trim() || 'Não informado';

/** PDF composto para uso interno; os arquivos originais são preservados separadamente. */
export const buildAdmissionDossierPdf = async (
  values: Record<string, unknown>,
  attachments: Array<{ url: string; name: string }>,
): Promise<Blob> => {
  const summary = new jsPDF({ format: 'a4', unit: 'mm' });
  summary.setFillColor(19, 14, 42);
  summary.rect(0,0,210,38,'F');
  summary.setTextColor(252,194,36);
  summary.setFontSize(17);
  summary.text('TOPAC RH PRO — DOSSIÊ ADMISSIONAL',15,18);
  summary.setFontSize(10); summary.setTextColor(255,255,255);
  summary.text('Via de conferência • pré-cadastro, não comprova admissão',15,27);
  summary.setTextColor(28,28,40);
  const rows = [
    ['Empresa contratante',values.empresa],['Nome completo',values.nome],['CPF',values.cpf],
    ['RG',values.rg],['Nascimento',values.data_nascimento],['Função',values.funcao],
    ['Salário proposto',values.salario],['Admissão prevista',values.data_admissao],
    ['Contato',values.celular],['E-mail',values.email],['Endereço',values.endereco],
    ['Filiação',values.filiacao],['Escolaridade',values.escolaridade],
    ['EPI',values.epi],['Banco',values.banco],['Agência',values.agencia],
    ['Conta / dígito',values.conta],['Titular',values.titular],['CPF titular',values.cpf_titular],
    ['Chave PIX',values.pix],['VR diário',values.vr_diario],['VT diário',values.vt_diario],
    ['Situação',values.status],
  ];
  let y = 48;
  for (const [key, value] of rows) {
    const lines = summary.splitTextToSize(key + ': ' + safe(value),181);
    if (y + lines.length*5 > 274) { summary.addPage(); y=20; }
    summary.setFont('helvetica','normal');
    summary.setFontSize(10);
    summary.text(lines,15,y);
    y += 5*lines.length+3;
  }
  if (y>261){summary.addPage();y=20;}
  summary.setFontSize(8);
  summary.text(summary.splitTextToSize('Documentos anexados são cópias para consulta. Para verificar assinatura eletrônica de documentos oficiais, utilize o PDF original individual.',180),15,y+7);

  const merged = await PDFDocument.create();
  const summarySource = await PDFDocument.load(summary.output('arraybuffer'));
  (await merged.copyPages(summarySource, summarySource.getPageIndices())).forEach(page => merged.addPage(page));
  for (const attachment of attachments) {
    if (!attachment.url) continue;
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Não foi possível compilar o anexo: ' + attachment.name);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mime = response.headers.get('content-type') || '';
    if (/pdf/i.test(mime) || /\.pdf(?:[?#]|$)/i.test(attachment.name)) {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
      (await merged.copyPages(src,src.getPageIndices())).forEach(page => merged.addPage(page));
    } else {
      const png = /png/i.test(mime) || /\.png$/i.test(attachment.name);
      const img = png ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
      const page = merged.addPage([595.28,841.89]);
      const scale=Math.min(550/img.width,795/img.height);
      page.drawImage(img,{x:(595.28-img.width*scale)/2,y:(841.89-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
    }
  }
  return new Blob([await merged.save() as any],{type:'application/pdf'});
};
