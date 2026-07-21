import React, { useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { toast } from 'sonner';

const MARK = 'data-topac-batch-upload';
const BUCKETS = ['documentos-admissionais', 'documentos-funcionarios', 'atestados', 'documentos-ativos'];

const clean = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim();
const norm = (v: unknown) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const digits = (v: unknown) => clean(v).replace(/\D/g, '');
const formatCpf = (v: unknown) => {
  const d = digits(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
};

const fileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error(`Nao foi possivel ler ${file.name}`));
  reader.readAsDataURL(file);
});

let workerPromise: ReturnType<typeof createWorker> | null = null;
const getOcrWorker = () => {
  if (!workerPromise) workerPromise = createWorker('por');
  return workerPromise;
};

const localOcr = async (images: string[], fileName: string) => {
  if (!images.length) return '';
  const worker = await getOcrWorker();
  const parts: string[] = [];
  for (let i = 0; i < images.length; i += 1) {
    toast.loading(`Lendo documento pessoal: ${fileName} (${i + 1}/${images.length})`, { id: 'topac-batch' });
    const result = await worker.recognize(images[i]);
    if (result.data.text) parts.push(result.data.text);
  }
  return parts.join('\n');
};

const findInput = () => Array.from(document.querySelectorAll('input[type="file"]')).find((el) => {
  const input = el as HTMLInputElement;
  const text = input.closest('div')?.textContent?.toLowerCase() || '';
  return text.includes('ficha de solicitacao') || text.includes('documentos pessoais') || text.includes('documentos admissionais');
}) as HTMLInputElement | undefined;

const uploadFile = async (file: File, prefix: string) => {
  const safe = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const path = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
  let lastError = '';
  for (const bucket of BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    lastError = error.message;
    if (!/bucket not found|not found|does not exist/i.test(error.message)) break;
  }
  throw new Error(lastError || `Falha ao arquivar ${file.name}`);
};

type Candidate = { value: string; score: number; source: string };
type Extracted = { nome: string; cpf: string; rg: string; data_nascimento: string; endereco: string };

const validPersonName = (value: string) => {
  const n = norm(value);
  if (value.length < 8 || value.split(/\s+/).length < 3 || /\d/.test(value)) return false;
  if (/REPUBLICA|FEDERATIVA|BRASIL|SECRETARIA|MINISTERIO|TRANSITO|SEGURANCA|POLICIA|DEPARTAMENTO|INSTITUTO|CERTIDAO|CARTEIRA|HABILITACAO|VALIDADE|NASCIMENTO|FILIACAO|ELEITOR|MUNICIPIO|ASSINATURA|DOCUMENTO|BENEFICIARIO|PAGADOR|TELECOM|ESTADO DE|NOME DO/.test(n)) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(value);
};

const toIsoDate = (raw: string) => {
  const m = raw.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (!m) return '';
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1925 || y > new Date().getFullYear() - 14 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const extractFromText = (rawText: string, fileName: string): Extracted => {
  const text = rawText.replace(/\r/g, '\n');
  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  const upper = norm(text);
  let nome = '';
  let cpf = '';
  let rg = '';
  let data_nascimento = '';
  let endereco = '';

  const cpfMatches = text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || [];
  cpf = cpfMatches.map(formatCpf).find(Boolean) || '';

  const labelledNamePatterns = [
    /NOME(?: DO ELEITOR| COMPLETO| DO CONDUTOR| DO TITULAR)?\s*[:\-]?\s*\n?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{8,})/i,
    /1[ºO]?\s*CONJUGE\s*\n?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{8,})/i,
  ];
  for (const pattern of labelledNamePatterns) {
    const match = text.match(pattern)?.[1];
    if (match && validPersonName(clean(match))) { nome = clean(match); break; }
  }

  if (!nome && upper.includes('NOME DO ELEITOR')) {
    const index = lines.findIndex((line) => norm(line).includes('NOME DO ELEITOR'));
    const around = [lines[index + 1], lines[index - 1]].filter(Boolean) as string[];
    nome = around.find(validPersonName) || '';
  }

  if (!nome) {
    const mrz = text.match(/\n([A-Z]{2,})<<([A-Z<]{2,})<+/)?.slice(1);
    if (mrz) {
      const mrzName = `${mrz[1]} ${mrz[2].replace(/<+/g, ' ')}`.replace(/\s+/g, ' ').trim();
      if (validPersonName(mrzName)) nome = mrzName;
    }
  }

  if (!nome) {
    const candidates = lines.filter(validPersonName);
    nome = candidates.sort((a, b) => {
      const score = (v: string) => (v === v.toUpperCase() ? 2 : 0) + Math.min(v.split(' ').length, 5) - (norm(v).includes('LTDA') ? 10 : 0);
      return score(b) - score(a);
    })[0] || '';
  }

  const birthContext = text.match(/(?:DATA\s+DE\s+NASCIMENTO|NASCIMENTO|DT\.?\s*NASC)[^\d]{0,30}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i)?.[1];
  if (birthContext) data_nascimento = toIsoDate(birthContext);
  if (!data_nascimento && /TITULO|CNH|RG|CERTIDAO/i.test(fileName)) {
    const dates = text.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g) || [];
    data_nascimento = dates.map(toIsoDate).find(Boolean) || '';
  }

  const rgPatterns = [
    /(?:RG|REGISTRO\s+GERAL|DOC(?:UMENTO)?\s+DE\s+IDENTIDADE|IDENTIDADE)\s*[:\-]?\s*([0-9]{1,2}[.\s]?[0-9]{3}[.\s]?[0-9]{3}[-\s]?[0-9Xx])/i,
    /([0-9]{2}[.]?[0-9]{3}[.]?[0-9]{3}[-]?[0-9Xx])\s*(?:SSP|SP)/i,
  ];
  for (const pattern of rgPatterns) {
    const match = text.match(pattern)?.[1];
    if (match) { rg = clean(match); break; }
  }

  const addressLine = lines.find((line) => /\b(RUA|R\.|AVENIDA|AV\.|TRAVESSA|ALAMEDA|ESTRADA|RODOVIA)\b/i.test(line) && !/BENEFICIARIO|EVOLUTIONPRO|TELECOM LTDA/i.test(line));
  if (addressLine) {
    const index = lines.indexOf(addressLine);
    const extra = [lines[index + 1], lines[index + 2]].filter((line) => line && !/BENEFICIARIO|VENCIMENTO|VALOR|NOSSO NUMERO/i.test(line)).join(', ');
    endereco = clean(`${addressLine}${extra ? `, ${extra}` : ''}`);
  }

  return { nome, cpf, rg, data_nascimento, endereco };
};

const boost = (field: keyof Extracted, fileName: string) => {
  const n = norm(fileName);
  if (field === 'nome' && /(CNH|RG|TITULO|CERTIDAO|PIS)/.test(n)) return 0.6;
  if (field === 'cpf' && /(CNH|RG|CPF|CERTIDAO|BOLETO)/.test(n)) return 0.7;
  if (field === 'rg' && /(CNH|RG)/.test(n)) return 0.9;
  if (field === 'data_nascimento' && /(CNH|RG|TITULO|CERTIDAO)/.test(n)) return 0.8;
  if (field === 'endereco' && /(BOLETO|COMPROVANTE|ENDERECO|RESIDENCIA)/.test(n)) return 1;
  return 0.1;
};

const choose = (items: Candidate[]) => {
  if (!items.length) return '';
  const grouped = new Map<string, Candidate>();
  for (const item of items) {
    const key = norm(item.value).replace(/[^A-Z0-9]/g, '');
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, score: current.score + item.score + 0.5 } : item);
  }
  return [...grouped.values()].sort((a, b) => b.score - a.score)[0]?.value || '';
};

const classify = (name: string) => {
  const n = norm(name);
  if (n.includes('CNH')) return 'cnh';
  if (n.includes('RG')) return 'rg_cpf';
  if (n.includes('TITULO')) return 'titulo_eleitoral';
  if (n.includes('PIS') || n.includes('CIDADAO')) return 'pis';
  if (n.includes('CERTIDAO')) return 'certidao_casamento';
  if (n.includes('BOLETO') || n.includes('PAGAMENTO')) return 'comprovante_endereco';
  return 'documento_admissional';
};

const processBatch = async (files: File[]) => {
  const fields: Array<keyof Extracted> = ['nome', 'cpf', 'rg', 'data_nascimento', 'endereco'];
  const candidates: Record<keyof Extracted, Candidate[]> = { nome: [], cpf: [], rg: [], data_nascimento: [], endereco: [] };
  const archived: Array<{ file: File; url: string }> = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    toast.loading(`Arquivando e lendo ${i + 1}/${files.length}: ${file.name}`, { id: 'topac-batch' });
    let parsedText = '';
    let images: string[] = [];
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      parsedText = await extractPdfText(bytes).catch(() => '');
      images = (await renderPdfPagesToDataUrls(bytes, 2.2, 2)).pageUrls;
    } else {
      images = [await fileDataUrl(file)];
    }

    const visualText = await localOcr(images, file.name).catch(() => '');
    const fullText = `${parsedText}\n${visualText}`.trim();
    const extracted = extractFromText(fullText, file.name);
    const url = await uploadFile(file, 'pre-cadastro-lote');
    archived.push({ file, url });

    for (const field of fields) {
      const value = clean(extracted[field]);
      if (value) candidates[field].push({ value, score: 1 + boost(field, file.name), source: file.name });
    }
  }

  const result: Extracted = {
    nome: choose(candidates.nome),
    cpf: choose(candidates.cpf),
    rg: choose(candidates.rg),
    data_nascimento: choose(candidates.data_nascimento),
    endereco: choose(candidates.endereco),
  };

  const { data: auth } = await supabase.auth.getUser();
  const payload = {
    status: 'aguardando_validacao',
    nome: result.nome,
    cpf: result.cpf,
    rg: result.rg,
    data_nascimento: result.data_nascimento || null,
    endereco: result.endereco,
    arquivo_ficha_url: archived[0]?.url || '',
    criado_por: auth.user?.id || null,
    dados_extraidos: { lote_documentos: { resultado: result, arquivos: archived.map((a) => a.file.name) } },
    conferencia: { lote_documentos: { status: 'processado_localmente', processado_em: new Date().toISOString() } },
    historico: [{ em: new Date().toISOString(), acao: 'documentos_pessoais_arquivados_e_lidos', quantidade: archived.length }],
  };

  const { data: draft, error } = await (supabase as any).from('pre_cadastros_admissionais').insert(payload).select('id').single();
  if (error) throw error;

  const docs = archived.map(({ file, url }) => ({ pre_cadastro_id: draft.id, tipo_documento: classify(file.name), nome_arquivo: file.name, arquivo_url: url }));
  const { error: docsError } = await (supabase as any).from('pre_cadastro_documentos').insert(docs);
  if (docsError) throw docsError;

  toast.success(`${archived.length} documentos salvos. Nome, CPF, RG, nascimento e endereco foram consolidados.`, { id: 'topac-batch', duration: 6000 });
  window.setTimeout(() => window.location.reload(), 1000);
};

const useBatchUpload = () => {
  useEffect(() => {
    const enhance = () => {
      const input = findInput();
      if (!input) return;
      input.multiple = true;
      input.accept = '.pdf,image/*';
      input.setAttribute(MARK, 'true');
      const label = input.closest('div')?.querySelector('label');
      if (label) label.textContent = 'Documentos pessoais - selecione todos de uma vez';
    };

    const onChange = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.hasAttribute(MARK)) return;
      const files = Array.from(input.files || []);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      try {
        await processBatch(files);
      } catch (error: any) {
        toast.error(`Falha ao processar documentos: ${error?.message || 'erro desconhecido'}`, { id: 'topac-batch', duration: 10000 });
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', onChange, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('change', onChange, true);
    };
  }, []);
};

const PreCadastroAdmissionalPage: React.FC = () => {
  useBatchUpload();
  return <PreCadastroAdmissionalOcrPage />;
};

export default PreCadastroAdmissionalPage;
