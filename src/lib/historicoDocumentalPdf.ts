import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

type Doc = {
  id: string;
  funcionario_id?: string;
  company_id?: string;
  funcionario_nome?: string;
  empresa_nome?: string;
  tipo_documento?: string;
  categoria?: string;
  competencia?: string;
  descricao?: string;
  observacao?: string;
  data_documento?: string;
  created_at?: string;
  origem?: string;
};

type EpiItem = { nome?: string; grupo?: string; codigo?: string; ca?: string; tamanho?: string; quantidade?: number; observacao?: string };
type EpiDelivery = {
  id: string; funcionario_id: string; company_id: string; funcionario_nome: string;
  cargo?: string; empresa_nome: string; data_prevista?: string; data_entrega?: string;
  proxima_reposicao?: string; status: string; itens?: EpiItem[];
  termo_responsabilidade?: string;
};

const text = (value: unknown) => String(value ?? '').replace(/[\x00-\x1f]+/g, ' ').trim();
const date = (value?: string | null) => {
  if (!value) return 'Não informado';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? [match[3], match[2], match[1]].join('/') : value;
};
const safe = (value: unknown) => text(value) || 'Não informado';

const pdfWriter = (doc: jsPDF) => {
  const left = 17;
  const right = 193;
  const width = right - left;
  let y = 19;
  const ensure = (height: number) => {
    if (y + height < 274) return;
    doc.addPage();
    y = 19;
  };
  const title = (value: string) => {
    ensure(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const lines = doc.splitTextToSize(value, width);
    doc.text(lines, left, y);
    y += lines.length * 6 + 10;
    doc.setDrawColor(110);
    doc.line(left, y - 7, right, y - 7);
  };
  const line = (label: string, value: unknown) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(label + ': ' + safe(value), width);
    ensure(lines.length * 4.6 + 3);
    doc.text(lines, left, y);
    y += lines.length * 4.6 + 3;
  };
  const paragraph = (label: string, value: unknown) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    ensure(6);
    doc.text(label, left, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(safe(value), width);
    ensure(lines.length * 4.6 + 5);
    doc.text(lines, left, y);
    y += lines.length * 4.6 + 5;
  };
  const section = (value: string) => {
    ensure(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(value, left, y);
    y += 7;
  };
  const finish = (recordId: string) => {
    ensure(17);
    doc.setDrawColor(160);
    doc.line(left, y, right, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const footer = doc.splitTextToSize(
      'Registro interno TOPAC RH PRO: ' + safe(recordId) + '. Esta via não substitui o arquivo original, assinatura ou prova de recebimento.',
      width,
    );
    doc.text(footer, left, y);
    return doc.output('blob');
  };
  return { title, line, paragraph, section, finish };
};

const findEpiDelivery = async (doc: Doc): Promise<EpiDelivery | null> => {
  const query = (supabase as any).from('epi_entregas').select(
    'id,funcionario_id,company_id,funcionario_nome,cargo,empresa_nome,data_prevista,data_entrega,proxima_reposicao,status,itens,termo_responsabilidade',
  );
  // O ID da ficha está vinculado ao documento original; registros de efetivação
  // também registram o ID na observação e não se confundem com outras fichas.
  const match = String(doc.observacao || '').match(/\b(?:Ficha EPI|ficha)\s+([0-9a-f-]{36})\b/i);
  const filter = match ? query.eq('id', match[1]) : query.eq('documento_funcionario_id', doc.id);
  const { data, error } = await filter
    .eq('funcionario_id', doc.funcionario_id)
    .eq('company_id', doc.company_id)
    .maybeSingle();
  if (error) throw new Error('Não foi possível consultar a ficha original: ' + error.message);
  return data || null;
};

/** A ficha sem arquivo é reconstruída com dados reais; os demais registros
 * produzem EXTRATO, não um falso documento original ou documento assinado. */
export const buildHistoricDocumentPdf = async (
  doc: Doc,
  funcionario: { name?: string; cargo?: string; cpf?: string; registro?: string } | undefined,
  company: { name?: string; cnpj?: string } | undefined,
): Promise<Blob> => {
  if (doc.origem === 'payroll_portal') {
    throw new Error('O documento protegido não possui arquivo disponível. Consulte o módulo de Assinatura Digital.');
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const w = pdfWriter(pdf);
  const title = safe(doc.tipo_documento || doc.categoria || 'Documento');
  const isEpi = /\bepi\b/i.test((doc.tipo_documento || '') + ' ' + (doc.categoria || ''));
  const delivery = isEpi && doc.funcionario_id && doc.company_id ? await findEpiDelivery(doc) : null;

  if (delivery) {
    w.title('FICHA DE EPI - VIA RECONSTITUÍDA');
    w.paragraph('Identificação desta via', 'Reconstrução a partir dos dados gravados na ficha do sistema. Não é cópia de original assinado.');
    w.line('Empresa', delivery.empresa_nome || company?.name);
    w.line('CNPJ', company?.cnpj);
    w.line('Funcionário', delivery.funcionario_nome || funcionario?.name);
    w.line('Função', delivery.cargo || funcionario?.cargo);
    w.line('CPF', funcionario?.cpf);
    w.line('Matrícula', funcionario?.registro);
    w.line('Competência do registro', doc.competencia);
    w.line('Data prevista', date(delivery.data_prevista));
    w.line('Entrega efetivada', delivery.status === 'entregue' ? date(delivery.data_entrega) : 'NÃO CONFIRMADA');
    w.line('Próxima reposição', delivery.proxima_reposicao ? date(delivery.proxima_reposicao) : 'Não definida');
    w.line('Identificação da ficha', delivery.id);
    w.section('Materiais registrados na ficha');
    if (Array.isArray(delivery.itens) && delivery.itens.length) {
      delivery.itens.forEach((item, i) => {
        w.paragraph(String(i + 1) + '. ' + safe(item.nome || item.codigo || 'Material'),
          'Grupo: ' + safe(item.grupo) + ' | CA: ' + safe(item.ca) +
          ' | Tamanho: ' + safe(item.tamanho) + ' | Quantidade: ' + safe(item.quantidade) +
          ' | Observação: ' + safe(item.observacao));
      });
    } else w.paragraph('Materiais', 'Nenhum item disponível no registro da entrega.');
    if (delivery.termo_responsabilidade) w.paragraph('Termo registrado no sistema', delivery.termo_responsabilidade);
    w.paragraph('Situação da assinatura', 'Esta via não comprova assinatura nem recebimento. Consulte o documento original assinado quando disponível.');
    return w.finish(doc.id);
  }

  w.title('EXTRATO DO REGISTRO DOCUMENTAL');
  w.paragraph('Natureza do arquivo', 'O histórico contém este registro, mas não possui arquivo original vinculado. Este PDF é um extrato dos metadados disponíveis, e não reprodução nem substituição do original.');
  w.line('Documento', title);
  w.line('Funcionário', doc.funcionario_nome || funcionario?.name);
  w.line('Empresa', doc.empresa_nome || company?.name);
  w.line('Competência', doc.competencia);
  w.line('Data do registro', date(doc.data_documento || doc.created_at));
  w.paragraph('Descrição registrada', doc.descricao);
  w.paragraph('Observação registrada', doc.observacao);
  return w.finish(doc.id);
};
