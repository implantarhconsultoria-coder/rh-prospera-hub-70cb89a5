import React, { useEffect } from 'react';
import { createWorker, type Worker } from 'tesseract.js';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { toast } from 'sonner';

const MARK = 'data-topac-batch-upload';
const BUCKETS = ['documentos-admissionais', 'documentos-funcionarios', 'atestados', 'documentos-ativos'];
const OCR_TIMEOUT = 22000;

const clean = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim();
const norm = (v: unknown) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const digits = (v: unknown) => clean(v).replace(/\D/g, '');
const formatCpf = (v: unknown) => {
  const d = digits(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
};
const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

const fileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error(`Nao foi possivel ler ${file.name}`));
  reader.readAsDataURL(file);
});

let worker: Worker | null = null;
let workerStarting: Promise<Worker> | null = null;
const getWorker = async () => {
  if (worker) return worker;
  if (!workerStarting) {
    workerStarting = createWorker('por', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text' && typeof message.progress === 'number') {
          toast.loading(`Lendo dados do documento: ${Math.round(message.progress * 100)}%`, { id: 'topac-batch' });
        }
      },
    }).then((created) => {
      worker = created;
      return created;
    });
  }
  return workerStarting;
};

const resetWorker = async () => {
  const current = worker;
  worker = null;
  workerStarting = null;
  if (current) await current.terminate().catch(() => undefined);
};

const recognizeWithTimeout = async (image: string, fileName: string) => {
  toast.loading(`Lendo dados pessoais em ${fileName}...`, { id: 'topac-batch' });
  const task = (async () => {
    const activeWorker = await getWorker();
    const result = await activeWorker.recognize(image);
    return result.data.text || '';
  })();
  const timeout = new Promise<string>((_, reject) => window.setTimeout(() => reject(new Error('Tempo limite da leitura atingido')), OCR_TIMEOUT));
  try {
    return await Promise.race([task, timeout]);
  } catch {
    await resetWorker();
    return '';
  }
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

type Candidate = { value: string; score: number };
type Extracted = { nome: string; cpf: string; rg: string; data_nascimento: string; endereco: string };
type Prepared = { file: File; url: string; text: string; image: string };

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
  let nome = '';
  let cpf = '';
  let rg = '';
  let data_nascimento = '';
  let endereco = '';

  cpf = (text.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g) || []).map(formatCpf).find(Boolean) || '';

  const namePatterns = [
    /NOME(?: DO ELEITOR| COMPLETO| DO CONDUTOR| DO TITULAR)?\s*[:\-]?\s*\n?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{8,})/i,
    /1[ºO]?\s*CONJUGE\s*\n?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{8,})/i,
    /NOME E SOBRENOME\s*\n?([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' ]{8,})/i,
  ];
  for (const pattern of namePatterns) {
    const match = clean(text.match(pattern)?.[1]);
    if (validPersonName(match)) { nome = match; break; }
  }
  if (!nome) {
    const mrz = text.match(/\n([A-Z]{2,})<<([A-Z<]{2,})<+/)?.slice(1);
    if (mrz) {
      const candidate = `${mrz[1]} ${mrz[2].replace(/<+/g, ' ')}`.replace(/\s+/g, ' ').trim();
      if (validPersonName(candidate)) nome = candidate;
    }
  }
  if (!nome) nome = lines.filter(validPersonName).sort((a, b) => b.split(' ').length - a.split(' ').length)[0] || '';

  const birth = text.match(/(?:DATA\s+DE\s+NASCIMENTO|NASCIMENTO|DT\.?\s*NASC)[^\d]{0,40}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i)?.[1];
  if (birth) data_nascimento = toIsoDate(birth);
  if (!data_nascimento && /(CNH|RG|TITULO|CERTIDAO)/i.test(fileName)) {
    data_nascimento = (text.match(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\b/g) || []).map(toIsoDate).find(Boolean) || '';
  }

  const rgPatterns = [
    /(?:RG|REGISTRO\s+GERAL|DOC(?:UMENTO)?\s+DE\s+IDENTIDADE|IDENTIDADE)\s*[:\-]?\s*([0-9]{1,2}[.\s]?[0-9]{3}[.\s]?[0-9]{3}[-\s]?[0-9Xx])/i,
    /([0-9]{2}[.]?[0-9]{3}[.]?[0-9]{3}[-]?[0-9Xx])\s*(?:SSP|SP)/i,
  ];
  for (const pattern of rgPatterns) {
    const match = clean(text.match(pattern)?.[1]);
    if (match) { rg = match; break; }
  }

  const addressLine = lines.find((line) => /\b(RUA|R\.|AVENIDA|AV\.|TRAVESSA|ALAMEDA|ESTRADA|RODOVIA)\b/i.test(line) && !/BENEFICIARIO|EVOLUTIONPRO|TELECOM LTDA/i.test(line));
  if (addressLine) {
    const index = lines.indexOf(addressLine);
    const extra = [lines[index + 1], lines[index + 2]].filter((line) => line && !/BENEFICIARIO|VENCIMENTO|VALOR|NOSSO NUMERO/i.test(line)).join(', ');
    endereco = clean(`${addressLine}${extra ? `, ${extra}` : ''}`);
  }

  return { nome, cpf, rg, data_nascimento, endereco };
};

const score = (field: keyof Extracted, fileName: string) => {
  const n = norm(fileName);
  if (field === 'nome' && /(CNH|RG|TITULO|CERTIDAO|PIS)/.test(n)) return 2;
  if (field === 'cpf' && /(CNH|RG|CPF|CERTIDAO)/.test(n)) return 2.2;
  if (field === 'rg' && /(CNH|RG)/.test(n)) return 2.5;
  if (field === 'data_nascimento' && /(CNH|RG|TITULO|CERTIDAO)/.test(n)) return 2.3;
  if (field === 'endereco' && /(BOLETO|COMPROVANTE|ENDERECO|RESIDENCIA)/.test(n)) return 3;
  return 1;
};

const choose = (items: Candidate[]) => items.sort((a, b) => b.score - a.score)[0]?.value || '';

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

const prepareFile = async (file: File, index: number, total: number): Promise<Prepared> => {
  toast.loading(`Salvando documento ${index + 1}/${total}: ${file.name}`, { id: 'topac-batch' });
  const urlPromise = uploadFile(file, 'pre-cadastro-lote');
  let text = '';
  let image = '';
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = await extractPdfText(bytes).catch(() => '');
    const shouldRender = /(CNH|RG|CPF|TITULO|CERTIDAO|BOLETO|PAGAMENTO|COMPROVANTE)/i.test(file.name) || text.length < 80;
    if (shouldRender) image = (await renderPdfPagesToDataUrls(bytes, 1.55, 1)).pageUrls[0] || '';
  } else {
    image = await fileDataUrl(file);
  }
  return { file, url: await urlPromise, text, image };
};

const processBatch = async (files: File[]) => {
  toast.loading(`Salvando ${files.length} documentos...`, { id: 'topac-batch' });
  const prepared: Prepared[] = [];
  for (let i = 0; i < files.length; i += 1) {
    prepared.push(await prepareFile(files[i], i, files.length));
    await pause();
  }

  const identity = prepared.find((item) => /CNH/i.test(item.file.name))
    || prepared.find((item) => /RG|CPF/i.test(item.file.name))
    || prepared.find((item) => /CERTIDAO|TITULO/i.test(item.file.name));
  if (identity?.image) identity.text += `\n${await recognizeWithTimeout(identity.image, identity.file.name)}`;

  const address = prepared.find((item) => /BOLETO|PAGAMENTO|COMPROVANTE|ENDERECO|RESIDENCIA/i.test(item.file.name));
  if (address?.image && !/\b(RUA|AVENIDA|AV\.|TRAVESSA|ESTRADA|RODOVIA)\b/i.test(address.text)) {
    address.text += `\n${await recognizeWithTimeout(address.image, address.file.name)}`;
  }

  const fields: Array<keyof Extracted> = ['nome', 'cpf', 'rg', 'data_nascimento', 'endereco'];
  const candidates: Record<keyof Extracted, Candidate[]> = { nome: [], cpf: [], rg: [], data_nascimento: [], endereco: [] };
  for (const item of prepared) {
    const extracted = extractFromText(item.text, item.file.name);
    for (const field of fields) {
      const value = clean(extracted[field]);
      if (value) candidates[field].push({ value, score: score(field, item.file.name) });
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
    arquivo_ficha_url: prepared[0]?.url || '',
    criado_por: auth.user?.id || null,
    dados_extraidos: { lote_documentos: { resultado: result, arquivos: prepared.map((item) => item.file.name) } },
    conferencia: { lote_documentos: { status: 'processado_sem_bloqueio', processado_em: new Date().toISOString() } },
    historico: [{ em: new Date().toISOString(), acao: 'documentos_pessoais_salvos_e_consolidados', quantidade: prepared.length }],
  };

  const { data: draft, error } = await (supabase as any).from('pre_cadastros_admissionais').insert(payload).select('id').single();
  if (error) throw error;
  const docs = prepared.map(({ file, url }) => ({ pre_cadastro_id: draft.id, tipo_documento: classify(file.name), nome_arquivo: file.name, arquivo_url: url }));
  const { error: docsError } = await (supabase as any).from('pre_cadastro_documentos').insert(docs);
  if (docsError) throw docsError;

  toast.success(`${prepared.length} documentos salvos. Cadastro criado para conferencia.`, { id: 'topac-batch', duration: 5000 });
  window.setTimeout(() => window.location.reload(), 900);
};

const useBatchUpload = () => {
  useEffect(() => {
    let running = false;
    const enhance = () => {
      const input = findInput();
      if (!input) return;
      input.multiple = true;
      input.accept = '.pdf,image/*';
      input.setAttribute(MARK, 'true');
      input.disabled = running;
      const label = input.closest('div')?.querySelector('label');
      if (label) label.textContent = running ? 'Processando documentos...' : 'Documentos pessoais - selecione todos de uma vez';
    };

    const onChange = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.hasAttribute(MARK) || running) return;
      const files = Array.from(input.files || []);
      if (!files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      running = true;
      enhance();
      try {
        await processBatch(files);
      } catch (error: any) {
        toast.error(`Falha ao processar documentos: ${error?.message || 'erro desconhecido'}`, { id: 'topac-batch', duration: 10000 });
      } finally {
        running = false;
        enhance();
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', onChange, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('change', onChange, true);
      void resetWorker();
    };
  }, []);
};

const PreCadastroAdmissionalPage: React.FC = () => {
  useBatchUpload();
  return <PreCadastroAdmissionalOcrPage />;
};

export default PreCadastroAdmissionalPage;
