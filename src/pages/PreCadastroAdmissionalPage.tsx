import React, { useEffect } from 'react';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';
import PreCadastroInteligente from '@/components/PreCadastroInteligente';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { toast } from 'sonner';

const MARK = 'data-topac-batch-upload';
const SYNTHETIC = 'data-topac-synthetic-change';
const DELETE_MARK = 'data-topac-delete-ready';
const GREETING_MARK = 'data-topac-greeting-ready';
const BUCKETS = ['documentos-admissionais', 'documentos-funcionarios', 'atestados', 'documentos-ativos'];

const saudacaoAtual = () => {
  const hora = new Date().getHours();
  if (hora < 12) return 'bom dia';
  if (hora < 18) return 'boa tarde';
  return 'boa noite';
};

type Campo = { valor?: string | number | null; confianca?: number };
type Ocr = { campos?: Record<string, Campo>; pendencias?: string[] };
type Candidate = { value: string; score: number; source: string };

const clean = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim();
const norm = (v: unknown) => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const cpfDigits = (v: unknown) => clean(v).replace(/\D/g, '');
const formatCpf = (v: unknown) => {
  const d = cpfDigits(v);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
};
const fileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error(`Nao foi possivel ler ${file.name}`));
  reader.readAsDataURL(file);
});

const findInput = () => Array.from(document.querySelectorAll('input[type="file"]')).find((el) => {
  const input = el as HTMLInputElement;
  const text = input.closest('div')?.textContent?.toLowerCase() || '';
  return text.includes('ficha de solicitacao') || text.includes('documentos pessoais para leitura');
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

const readDocument = async (file: File): Promise<Ocr> => {
  let text = '';
  let images: string[] = [];
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = await extractPdfText(bytes).catch(() => '');
    images = (await renderPdfPagesToDataUrls(bytes, 1.8, 2)).pageUrls;
  } else {
    images = [await fileDataUrl(file)];
  }
  const { data, error } = await supabase.functions.invoke('ocr-pre-cadastro', {
    body: { fileName: file.name, mimeType: file.type || 'application/octet-stream', text, images },
  });
  if (error) throw error;
  return (data?.data || data || {}) as Ocr;
};

const sourceBoost = (field: string, fileName: string) => {
  const n = norm(fileName);
  if (field === 'rg' && /(RG|CNH)/.test(n)) return 0.45;
  if (field === 'cpf' && /(CPF|RG|CNH|CERTIDAO|BOLETO)/.test(n)) return 0.35;
  if (field === 'nome' && /(RG|CNH|TITULO|CERTIDAO|PIS)/.test(n)) return 0.35;
  if (field === 'data_nascimento' && /(RG|CNH|TITULO|CERTIDAO)/.test(n)) return 0.4;
  if (field === 'endereco' && /(BOLETO|ENDERECO|RESIDENCIA|COMPROVANTE)/.test(n)) return 0.55;
  return 0;
};

const validValue = (field: string, raw: unknown) => {
  const value = clean(raw);
  if (!value) return '';
  const n = norm(value);
  if (/HTTP|WWW|QR.?CODE|VALIDA|AUTENTICIDADE|ORIENTACOES/.test(n)) return '';
  if (field === 'nome') {
    if (value.split(' ').length < 2 || /\d/.test(value) || /NOME DO|DATA DE|ELEITOR|PAGADOR|BENEFICIARIO/.test(n)) return '';
    return value;
  }
  if (field === 'cpf') return formatCpf(value);
  if (field === 'rg') return /\d/.test(value) && value.length >= 6 ? value : '';
  if (field === 'data_nascimento') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  if (field === 'endereco') {
    if (/EVOLUTIONPRO|TELECOM LTDA|BENEFICIARIO/.test(n)) return '';
    return /(RUA|AVENIDA|AV\.|ESTRADA|RODOVIA|TRAVESSA|ALAMEDA|CEP|\d{5}-?\d{3})/.test(n) ? value : '';
  }
  return value;
};

const choose = (list: Candidate[]) => {
  if (!list.length) return '';
  const grouped = new Map<string, Candidate>();
  for (const item of list) {
    const key = norm(item.value).replace(/\W/g, '');
    const current = grouped.get(key);
    grouped.set(key, current ? { ...current, score: current.score + item.score + 0.25 } : item);
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
  const fields = ['nome', 'cpf', 'rg', 'data_nascimento', 'endereco'];
  const candidates: Record<string, Candidate[]> = Object.fromEntries(fields.map((f) => [f, []]));
  const archived: Array<{ file: File; url: string }> = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    toast.loading(`Arquivando e lendo ${i + 1}/${files.length}: ${file.name}`, { id: 'topac-batch' });
    const [url, ocr] = await Promise.all([
      uploadFile(file, 'pre-cadastro-lote'),
      readDocument(file),
    ]);
    archived.push({ file, url });
    for (const field of fields) {
      const value = validValue(field, ocr.campos?.[field]?.valor);
      if (!value) continue;
      const confidence = Number(ocr.campos?.[field]?.confianca || 0.65);
      candidates[field].push({ value, score: confidence + sourceBoost(field, file.name), source: file.name });
    }
  }

  const result = Object.fromEntries(fields.map((f) => [f, choose(candidates[f])]));
  const { data: auth } = await supabase.auth.getUser();
  const payload = {
    status: 'aguardando_validacao',
    nome: result.nome || '',
    cpf: result.cpf || '',
    rg: result.rg || '',
    data_nascimento: result.data_nascimento || null,
    endereco: result.endereco || '',
    arquivo_ficha_url: archived[0]?.url || '',
    criado_por: auth.user?.id || null,
    dados_extraidos: { lote_documentos: { resultado: result, arquivos: archived.map((a) => a.file.name) } },
    conferencia: { lote_documentos: { status: 'processado', processado_em: new Date().toISOString() } },
    historico: [{ em: new Date().toISOString(), acao: 'lote_documentos_arquivado_e_processado', quantidade: archived.length }],
  };

  const { data: draft, error } = await (supabase as any)
    .from('pre_cadastros_admissionais')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;

  const docs = archived.map(({ file, url }) => ({
    pre_cadastro_id: draft.id,
    tipo_documento: classify(file.name),
    nome_arquivo: file.name,
    arquivo_url: url,
  }));
  const { error: docsError } = await (supabase as any).from('pre_cadastro_documentos').insert(docs);
  if (docsError) throw docsError;

  toast.success(`${archived.length} documentos arquivados. Cadastro preenchido com os dados encontrados.`, { id: 'topac-batch', duration: 5000 });
  window.setTimeout(() => window.location.reload(), 900);
};

const aplicarSaudacaoEmail = () => {
  const dialogos = Array.from(document.querySelectorAll('[role="dialog"]')) as HTMLElement[];
  for (const dialogo of dialogos) {
    if (!dialogo.textContent?.includes('Enviar PDF por e-mail')) continue;
    const textarea = dialogo.querySelector('textarea') as HTMLTextAreaElement | null;
    if (!textarea || textarea.hasAttribute(GREETING_MARK)) continue;
    const atualizado = textarea.value.replace(/Prezados,\s*(bom dia|boa tarde|boa noite)\./i, `Prezados, ${saudacaoAtual()}.`);
    if (atualizado !== textarea.value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, atualizado);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
    textarea.setAttribute(GREETING_MARK, 'true');
  }
};

const excluirPreCadastroPeloCard = async (card: HTMLButtonElement) => {
  const texto = card.textContent || '';
  const cpfMatch = texto.match(/\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11}/);
  const cpf = cpfDigits(cpfMatch?.[0] || '');
  const nomeVisivel = clean(card.querySelector('.font-semibold')?.textContent || '');
  if (!cpf) {
    toast.error('Nao foi possivel identificar o CPF deste pre-cadastro.');
    return;
  }
  const confirmar = window.confirm(`Excluir este pre-cadastro${nomeVisivel ? ` de ${nomeVisivel}` : ''}? Esta acao remove tambem os anexos vinculados.`);
  if (!confirmar) return;

  const { data, error } = await (supabase as any)
    .from('pre_cadastros_admissionais')
    .select('id,nome,cpf,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    toast.error(`Erro ao localizar pre-cadastro: ${error.message}`);
    return;
  }

  const candidatos = (data || []).filter((row: any) => cpfDigits(row.cpf) === cpf);
  const alvo = candidatos.find((row: any) => {
    const nomeBanco = clean(row.nome);
    return nomeVisivel === 'Sem nome informado' ? !nomeBanco : norm(nomeBanco) === norm(nomeVisivel);
  }) || candidatos[0];

  if (!alvo?.id) {
    toast.error('Pre-cadastro nao encontrado para exclusao.');
    return;
  }

  const { error: docsError } = await (supabase as any).from('pre_cadastro_documentos').delete().eq('pre_cadastro_id', alvo.id);
  if (docsError) {
    toast.error(`Erro ao excluir anexos: ${docsError.message}`);
    return;
  }
  const { error: deleteError } = await (supabase as any).from('pre_cadastros_admissionais').delete().eq('id', alvo.id);
  if (deleteError) {
    toast.error(`Erro ao excluir pre-cadastro: ${deleteError.message}`);
    return;
  }

  toast.success('Pre-cadastro excluido com sucesso.');
  window.setTimeout(() => window.location.reload(), 500);
};

const adicionarBotoesExcluir = () => {
  const cards = Array.from(document.querySelectorAll('button.w-full.text-left.rounded-xl')) as HTMLButtonElement[];
  for (const card of cards) {
    if (card.hasAttribute(DELETE_MARK)) continue;
    card.setAttribute(DELETE_MARK, 'true');
    card.style.position = 'relative';
    const excluir = document.createElement('span');
    excluir.setAttribute('role', 'button');
    excluir.setAttribute('tabindex', '0');
    excluir.textContent = 'Excluir';
    excluir.className = 'absolute right-3 bottom-2 text-[11px] font-semibold text-destructive hover:underline';
    const executar = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      void excluirPreCadastroPeloCard(card);
    };
    excluir.addEventListener('click', executar);
    excluir.addEventListener('keydown', (event) => {
      const keyboard = event as KeyboardEvent;
      if (keyboard.key === 'Enter' || keyboard.key === ' ') executar(event);
    });
    card.appendChild(excluir);
  }
};

const useBatchUpload = () => {
  useEffect(() => {
    const enhance = () => {
      const input = findInput();
      if (input) {
        input.multiple = true;
        input.accept = '.pdf,image/*';
        input.setAttribute(MARK, 'true');
        const label = input.closest('div')?.querySelector('label');
        if (label) label.textContent = 'Documentos admissionais - selecione todos de uma vez';
      }
      aplicarSaudacaoEmail();
      adicionarBotoesExcluir();
    };

    const onChange = async (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.hasAttribute(MARK) || input.hasAttribute(SYNTHETIC)) return;
      const files = Array.from(input.files || []);
      if (files.length <= 1) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      try {
        await processBatch(files);
      } catch (error: any) {
        toast.error(`Falha no lote: ${error?.message || 'erro desconhecido'}`, { id: 'topac-batch', duration: 8000 });
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
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <PreCadastroInteligente />
      </div>
      <PreCadastroAdmissionalOcrPage />
    </div>
  );
};

export default PreCadastroAdmissionalPage;