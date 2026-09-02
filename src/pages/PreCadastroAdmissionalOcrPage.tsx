import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, Loader2, Mail, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { CC_OBRIGATORIO, sendEmailWithPdfAttachment } from '@/lib/emailUtils';
import { gerarAutorizacaoExameAdmissionalPdf } from '@/lib/pdfGenerator';
import EmailPdfModal, { type EmailPdfDraft } from '@/components/EmailPdfModal';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { employeeHasInsalubridade, getPericulosidadeAplicavel, isMotoboyRole } from '@/lib/employeeRoleRules';
import { registrarDocumento } from '@/lib/documentoHistorico';

type PreCadastro = {
  id: string;
  status: string;
  empresa_id: string | null;
  empresa_nome: string | null;
  cnpj: string | null;
  nome: string | null;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  data_admissao: string | null;
  funcao: string | null;
  setor_ghe: string | null;
  obra_local: string | null;
  salario: number | null;
  tipo_admissao: string | null;
  jornada: string | null;
  beneficios: string | null;
  insalubridade: string | null;
  filiacao: string | null;
  endereco: string | null;
  escolaridade: string | null;
  experiencia: string | null;
  epi: string | null;
  responsavel_contato: string | null;
  email: string | null;
  celular: string | null;
  vale_refeicao: boolean;
  vale_transporte: boolean;
  exige_toxicologico: boolean;
  arquivo_ficha_url: string | null;
  arquivo_aso_url: string | null;
  arquivo_toxicologico_url: string | null;
  dados_extraidos?: Record<string, unknown> | null;
  conferencia?: Record<string, unknown> | null;
  historico?: unknown[] | null;
  created_at: string;
};

type PreCadastroDocumento = {
  id?: string;
  pre_cadastro_id?: string;
  tipo_documento?: string | null;
  nome_arquivo?: string | null;
  arquivo_url?: string | null;
  created_at?: string | null;
};

type DocumentoConferencia = PreCadastroDocumento & {
  key: string;
  categoria: string;
  nome: string;
  url: string;
  duplicado: boolean;
  selecionado: boolean;
};

type OcrField = { valor?: string | number | null; confianca?: number; observacao?: string };
type OcrResult = { ok?: boolean; confianca_geral?: number; texto_bruto?: string; campos?: Record<string, OcrField>; pendencias?: string[]; log?: string[]; error?: string };
type GeneratedAsoGuide = { blob: Blob; fileName: string; url: string };

type RoleOption = {
  cargo: string;
  salarioBase: number;
  insalubridadeAtiva: boolean;
  insalubridadeValor: number;
  periculosidadeAtiva: boolean;
  periculosidadeValor: number;
};

const statusLabel: Record<string, string> = {
  aguardando_validacao: 'Aguardando validacao',
  aguardando_aso: 'Aguardando ASO',
  documentacao_completa: 'Documentacao completa',
  pronto_para_registro: 'Pronto para registro',
  cadastro_oficial: 'Cadastro oficial',
};

const initialForm: Partial<PreCadastro> = {
  status: 'aguardando_validacao', nome: '', cpf: '', rg: '', funcao: '', setor_ghe: '', obra_local: '', tipo_admissao: 'Admissional',
  jornada: '', beneficios: '', insalubridade: '', filiacao: '', endereco: '', escolaridade: '', experiencia: '', epi: '', responsavel_contato: '',
  email: '', celular: '', vale_refeicao: false, vale_transporte: false, exige_toxicologico: false, arquivo_toxicologico_url: '',
};

const ADMISSION_BUCKETS = ['documentos-admissionais', 'documentos-funcionarios', 'atestados', 'documentos-ativos'];
const CONTABILIDADE_DESTINATARIOS = ['marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br'];
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const LOW_CONFIDENCE = 0.75;

const onlyDigits = (v?: string | null) => String(v || '').replace(/\D/g, '');
const normalizeRole = (value?: string | null) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const isGuincheiro = (value?: string | null) => normalizeRole(value) === 'GUINCHEIRO';
const normalizeDocName = (value?: string | null) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatMoneyEmail = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDateEmail = (value?: string | null) => { const text = String(value || '').trim(); const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : text; };
const yesNo = (value?: boolean | null) => value ? 'Sim' : 'Não';
const insalubridadeYesNo = (value?: string | null) => { const normalized = normalizeRole(value); return !normalized || /^(NAO|NÃO|SEM|0)$/.test(normalized) ? 'Não' : 'Sim'; };
const normalizeDate = (value: unknown) => { const text = String(value || '').trim(); if (!text) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text; const br = text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (!br) return ''; const y = br[3].length === 2 ? `20${br[3]}` : br[3]; return `${y}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`; };
const normalizeMoney = (value: unknown) => { if (typeof value === 'number') return value; const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo')); reader.readAsDataURL(file); });

const OCR_FIELD_LABELS: Record<string, string> = {
  nome: 'Nome completo', cpf: 'CPF', rg: 'RG', data_nascimento: 'Data nascimento', endereco: 'Endereco', telefone: 'Telefone', celular: 'Celular', email: 'E-mail', funcao: 'Funcao/cargo', empresa: 'Empresa', salario: 'Salario', data_admissao: 'Data admissao', vt_endereco: 'VT/endereco residencial', documentos_anexados: 'Documentos anexados', filiacao: 'Filiacao', escolaridade: 'Escolaridade', experiencia: 'Experiencia', epi: 'EPI', beneficios: 'Beneficios', insalubridade: 'Insalubridade', setor_ghe: 'Setor/GHE', obra_local: 'Obra/local', jornada: 'Jornada', responsavel_contato: 'Responsavel/contato',
};
const FIELD_TO_FORM: Record<string, keyof PreCadastro> = {
  nome: 'nome', cpf: 'cpf', rg: 'rg', data_nascimento: 'data_nascimento', endereco: 'endereco', funcao: 'funcao', empresa: 'empresa_nome', salario: 'salario', data_admissao: 'data_admissao', filiacao: 'filiacao', escolaridade: 'escolaridade', experiencia: 'experiencia', epi: 'epi', beneficios: 'beneficios', insalubridade: 'insalubridade', setor_ghe: 'setor_ghe', obra_local: 'obra_local', jornada: 'jornada', responsavel_contato: 'responsavel_contato', email: 'email', celular: 'celular', telefone: 'celular',
};

const FIXED_ROLE_PRESETS: RoleOption[] = [
  { cargo: 'AJUDANTE DE MECANICO', salarioBase: 2100, insalubridadeAtiva: true, insalubridadeValor: 648.40, periculosidadeAtiva: false, periculosidadeValor: 0 },
  { cargo: 'VENDEDOR', salarioBase: 0, insalubridadeAtiva: false, insalubridadeValor: 0, periculosidadeAtiva: false, periculosidadeValor: 0 },
  { cargo: 'REPRESENTANTE', salarioBase: 0, insalubridadeAtiva: false, insalubridadeValor: 0, periculosidadeAtiva: false, periculosidadeValor: 0 },
];

const categoriaPreCadastro = (tipo?: string | null) => {
  const normalizado = normalizeRole(tipo);
  if (normalizado.includes('TOXICOLOG')) return 'TOXICOLOGICO';
  if (normalizado.includes('GUIA') && normalizado.includes('ASO')) return 'GUIA ASO';
  if (normalizado.includes('ASO') || normalizado.includes('EXAME')) return 'ASO';
  if (normalizado.includes('FICHA') || normalizado.includes('DADOS CADASTRAIS') || normalizado.includes('DOCUMENTACAO ADMISSIONAL')) return 'FICHA/DOCUMENTACAO';
  if (normalizado.includes('CONTRATO')) return 'CONTRATO';
  return 'NAO RECONHECIDO';
};

const exclusiveCategory = (categoria: string) => ['ASO', 'GUIA ASO', 'FICHA/DOCUMENTACAO', 'TOXICOLOGICO'].includes(categoria);

const uploadAdmissionFile = async (file: File, prefix: string) => {
  const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const path = `${prefix}/${Date.now()}-${safeName}`;
  const errors: string[] = [];
  for (const bucket of ADMISSION_BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    errors.push(`${bucket}: ${error.message}`);
    if (!/bucket not found|not found|does not exist/i.test(error.message)) break;
  }
  throw new Error(errors.join(' | '));
};

const uploadAdmissionBlob = async (blob: Blob, prefix: string, fileName: string) => {
  const safeName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_.-]+/g, '_');
  const path = `${prefix}/${Date.now()}-${safeName}`;
  for (const bucket of ADMISSION_BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    if (!/bucket not found|not found|does not exist/i.test(error.message)) throw error;
  }
  throw new Error('Nenhum bucket de documentos disponivel');
};

const buildContabilidadeEmailBody = (r: Partial<PreCadastro>) => [
  'Prezados,', '',
  `Segue documentação admissional do colaborador ${r.nome || ''}, CPF ${r.cpf || ''}, para admissão pela empresa ${r.empresa_nome || ''}, função ${r.funcao || ''}.`,
  r.data_admissao ? `Data de admissão/início: ${formatDateEmail(r.data_admissao)}.` : '', '',
  `e-mail: ${r.email || ''}`,
  `cel: ${r.celular || ''}`,
  `Salário: ${formatMoneyEmail(r.salario)}`,
  `Insalubridade: ${insalubridadeYesNo(r.insalubridade)}`,
  `Vr: ${yesNo(r.vale_refeicao)}`,
  `Vt: ${yesNo(r.vale_transporte)}`, '',
  'Documentos anexados conforme pré-cadastro.', '', 'Atenciosamente,',
].join('\n');

const buildExameEmailBody = (r: Partial<PreCadastro>) => [
  'Prezados, bom dia.', '',
  `Solicito, por gentileza, o agendamento do exame ${(r.tipo_admissao || 'Admissional').toLowerCase()} conforme guia ASO anexa.`, '',
  `Nome: ${r.nome || ''}`, `CPF: ${r.cpf || ''}`, `RG: ${r.rg || ''}`,
  `Data de nascimento: ${formatDateEmail(r.data_nascimento)}`, `Empresa: ${r.empresa_nome || ''}`, `CNPJ: ${r.cnpj || ''}`,
  `Funcao: ${r.funcao || ''}`, `Setor/GHE: ${r.setor_ghe || ''}`, `Obra/Local: ${r.obra_local || ''}`,
  `Data de admissao/inicio: ${formatDateEmail(r.data_admissao)}`, r.exige_toxicologico ? 'Exame toxicológico: obrigatório' : '', '',
  'Por favor, confirmar recebimento, data e horario disponivel para atendimento.', '', 'Atenciosamente,', 'Rodrigo De Souza Sabino',
].filter(Boolean).join('\n');

const mimeFromFileName = (fileName: string) => fileName.toLowerCase().endsWith('.png') ? 'image/png' : /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : fileName.toLowerCase().endsWith('.webp') ? 'image/webp' : 'application/pdf';
const fileNameFromUrl = (url: string, fallback: string) => { try { return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || fallback; } catch { return fallback; } };
const buildMigrationBenefits = (emp: any) => [emp.vrAtivo ? `VR ${formatBRL(Number(emp.vrDiario) || 0)}/dia` : '', emp.vaAtivo ? `VA ${formatBRL(Number(emp.vaMensal) || 0)}/mes` : '', emp.vtAtivo ? `VT ${formatBRL(Number(emp.vtDiario) || 0)}/dia` : ''].filter(Boolean).join(' | ');

const PreCadastroAdmissionalOcrPage: React.FC = () => {
  const { companies, employees, refreshData, session, config } = useApp();
  const [rows, setRows] = useState<PreCadastro[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<Partial<PreCadastro>>(initialForm);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [lastFichaFile, setLastFichaFile] = useState<File | null>(null);
  const [lastAsoGuide, setLastAsoGuide] = useState<GeneratedAsoGuide | null>(null);
  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);
  const [migrationEmployeeId, setMigrationEmployeeId] = useState('');
  const [migrationCompanyId, setMigrationCompanyId] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoConferencia[]>([]);
  const [documentosLoading, setDocumentosLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('pre_cadastros_admissionais').select('*').order('created_at', { ascending: false });
    setLoading(false);
    if (error) return toast.error(`Erro ao carregar pre-cadastros: ${error.message}`);
    setRows(data || []);
  };

  const montarConferencia = (docs: PreCadastroDocumento[], current: Partial<PreCadastro>) => {
    const all: PreCadastroDocumento[] = [...docs];
    const addVirtual = (tipo: string, nome: string, url?: string | null) => { if (url && !all.some(d => d.arquivo_url === url)) all.push({ tipo_documento: tipo, nome_arquivo: nome, arquivo_url: url, created_at: current.created_at || null }); };
    addVirtual('ficha_solicitacao_emprego', `Ficha - ${current.nome || 'pré-cadastro'}`, current.arquivo_ficha_url);
    addVirtual('aso', `ASO - ${current.nome || 'pré-cadastro'}`, current.arquivo_aso_url);
    addVirtual('toxicologico', `Toxicológico - ${current.nome || 'pré-cadastro'}`, current.arquivo_toxicologico_url);
    const seenNames = new Set<string>();
    const seenCats = new Set<string>();
    return all.filter(d => d.arquivo_url).map((d, index) => {
      const categoria = categoriaPreCadastro(d.tipo_documento);
      const nome = d.nome_arquivo || fileNameFromUrl(d.arquivo_url || '', categoria);
      const nameKey = normalizeDocName(nome);
      const duplicateByName = !!nameKey && seenNames.has(nameKey);
      const duplicateByCat = exclusiveCategory(categoria) && seenCats.has(categoria);
      const duplicado = duplicateByName || duplicateByCat;
      if (nameKey) seenNames.add(nameKey);
      if (exclusiveCategory(categoria)) seenCats.add(categoria);
      return { ...d, key: d.id || `${categoria}-${index}-${d.arquivo_url}`, categoria, nome, url: d.arquivo_url || '', duplicado, selecionado: !duplicado };
    });
  };

  const carregarDocumentos = async (current = form) => {
    if (!current.id) { setDocumentos([]); return; }
    setDocumentosLoading(true);
    const { data, error } = await (supabase as any).from('pre_cadastro_documentos').select('id, pre_cadastro_id, tipo_documento, nome_arquivo, arquivo_url, created_at').eq('pre_cadastro_id', current.id).order('created_at', { ascending: true });
    setDocumentosLoading(false);
    if (error) return toast.error(`Erro ao carregar documentos: ${error.message}`);
    setDocumentos(montarConferencia(data || [], current));
  };

  useEffect(() => { carregar(); }, []);
  useEffect(() => { const selected = rows.find(r => r.id === selectedId); if (selected) { setForm(selected); setOcrResult((selected.dados_extraidos as OcrResult) || null); carregarDocumentos(selected); } }, [rows, selectedId]);
  useEffect(() => () => { if (lastAsoGuide?.url) URL.revokeObjectURL(lastAsoGuide.url); }, [lastAsoGuide?.url]);

  const filtered = useMemo(() => { const q = search.toLowerCase(); return rows.filter(r => !q || `${r.nome} ${r.cpf} ${r.empresa_nome} ${r.status} ${r.funcao}`.toLowerCase().includes(q)); }, [rows, search]);
  const duplicateCpf = useMemo(() => { const cpf = onlyDigits(form.cpf); return !!cpf && rows.some(r => r.id !== form.id && onlyDigits(r.cpf) === cpf); }, [rows, form.cpf, form.id]);
  const migrationEmployees = useMemo(() => employees.filter(emp => emp.status !== 'excluido' && emp.categoria !== 'socio').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [employees]);
  const migrationEmployee = useMemo(() => employees.find(emp => emp.id === migrationEmployeeId), [employees, migrationEmployeeId]);
  const migrationOriginCompany = migrationEmployee ? companies.find(c => c.id === migrationEmployee.companyId) : null;
  const migrationDestinationCompanies = useMemo(() => companies.filter(c => c.id !== migrationEmployee?.companyId), [companies, migrationEmployee?.companyId]);
  const roleOptions = useMemo<RoleOption[]>(() => {
    const byRole = new Map<string, RoleOption>();
    FIXED_ROLE_PRESETS.forEach(role => byRole.set(normalizeRole(role.cargo), { ...role }));
    employees.filter(emp => emp.categoria !== 'socio' && normalizeRole(emp.cargo)).forEach(emp => {
      const key = normalizeRole(emp.cargo); const existing = byRole.get(key); const salarioBase = Number(emp.salarioBase) || 0; const insalubridadeValor = Number(emp.insalubridadeValor || config.valorInsalubridade || 0); const insalubridadeAtiva = employeeHasInsalubridade(emp); const periculosidadeAtiva = isMotoboyRole(emp.cargo); const periculosidadeValor = getPericulosidadeAplicavel(emp);
      if (!existing) byRole.set(key, { cargo: emp.cargo, salarioBase, insalubridadeAtiva, insalubridadeValor, periculosidadeAtiva, periculosidadeValor });
    });
    return Array.from(byRole.values()).sort((a, b) => a.cargo.localeCompare(b.cargo, 'pt-BR'));
  }, [employees, config.valorInsalubridade]);

  const missingDocs = useMemo(() => {
    const categorias = new Set(documentos.map(d => d.categoria));
    const missing: string[] = [];
    if (!categorias.has('FICHA/DOCUMENTACAO')) missing.push('Ficha/documentação admissional');
    if (!categorias.has('ASO')) missing.push('ASO');
    if ((form.exige_toxicologico || isGuincheiro(form.funcao)) && !categorias.has('TOXICOLOGICO')) missing.push('Toxicológico');
    return missing;
  }, [documentos, form.exige_toxicologico, form.funcao]);
  const selectedDocs = documentos.filter(d => d.selecionado);
  const duplicateDocs = documentos.filter(d => d.duplicado);

  const setCompany = (id: string) => { const company = companies.find(x => x.id === id); setForm(prev => ({ ...prev, empresa_id: id, empresa_nome: company?.name || '', cnpj: company?.cnpj || '' })); };
  const setFuncaoComPadroes = (funcao: string) => setForm(prev => ({ ...prev, funcao, exige_toxicologico: isGuincheiro(funcao) ? true : prev.exige_toxicologico }));
  const novo = () => { setSelectedId(''); setForm(initialForm); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setDocumentos([]); };

  const prepararMigracaoFuncionario = () => {
    const emp = migrationEmployee; const destino = companies.find(c => c.id === migrationCompanyId); const origem = emp ? companies.find(c => c.id === emp.companyId) : null;
    if (!emp || !destino) return toast.error('Selecione o funcionario de origem e a empresa destino.');
    const now = new Date().toISOString();
    setSelectedId(''); setSearch(''); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setDocumentos([]);
    setForm({ status: 'aguardando_validacao', empresa_id: destino.id, empresa_nome: destino.name || '', cnpj: destino.cnpj || '', nome: emp.name || '', cpf: emp.cpf || '', rg: emp.rg || '', data_nascimento: emp.dataNascimento || '', data_admissao: emp.dataAdmissao || '', funcao: emp.cargo || '', setor_ghe: emp.setorGhe || '', obra_local: destino.city || '', salario: Number(emp.salarioBase) || null, tipo_admissao: 'Transferencia entre empresas', jornada: '', beneficios: buildMigrationBenefits(emp), insalubridade: employeeHasInsalubridade(emp) ? `Sim - ${formatBRL(Number(emp.insalubridadeValor || config.valorInsalubridade || 0))}` : isMotoboyRole(emp.cargo) ? `Periculosidade - ${formatBRL(getPericulosidadeAplicavel(emp))}` : 'Nao', filiacao: '', endereco: emp.endereco || '', escolaridade: '', experiencia: emp.observacoes || '', epi: '', responsavel_contato: '', email: emp.email || '', celular: emp.celular || emp.telefone || '', vale_refeicao: !!emp.vrAtivo, vale_transporte: !!emp.vtAtivo, exige_toxicologico: isGuincheiro(emp.cargo), arquivo_ficha_url: '', arquivo_aso_url: '', arquivo_toxicologico_url: '', dados_extraidos: { origem_migracao_funcionario: { funcionario_id: emp.id, empresa_origem_nome: origem?.name || '', empresa_destino_nome: destino.name || '', preparado_em: now } } });
  };

  const salvar = async () => {
    setSaving(true); const payload = { ...form, criado_por: session?.user?.id || null }; const request = form.id ? (supabase as any).from('pre_cadastros_admissionais').update(payload).eq('id', form.id).select('*').single() : (supabase as any).from('pre_cadastros_admissionais').insert(payload).select('*').single(); const { data, error } = await request; setSaving(false); if (error) return toast.error(`Erro ao salvar: ${error.message}`); setSelectedId(data.id); toast.success('Pre-cadastro salvo no banco'); await carregar();
  };

  const mergeOcrIntoForm = (result: OcrResult, arquivoUrl: string) => {
    const campos = result.campos || {}; setForm(prev => { const next: Partial<PreCadastro> = { ...prev, arquivo_ficha_url: arquivoUrl, dados_extraidos: result as Record<string, unknown> }; Object.entries(FIELD_TO_FORM).forEach(([ocrKey, formKey]) => { const raw = campos[ocrKey]?.valor; const value = typeof raw === 'number' ? raw : String(raw || '').trim(); if (value === '' || value === null) return; if (formKey === 'data_nascimento' || formKey === 'data_admissao') { const date = normalizeDate(value); if (date) (next as any)[formKey] = date; } else if (formKey === 'salario') { const money = normalizeMoney(value); if (money !== null) (next as any)[formKey] = money; } else (next as any)[formKey] = value; }); if (isGuincheiro(next.funcao)) next.exige_toxicologico = true; return next; });
  };

  const runFichaOcr = async (file: File, arquivoUrl: string) => {
    setOcrLoading(true); setOcrResult(null);
    try { let text = ''; let images: string[] = []; if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) { const bytes = new Uint8Array(await file.arrayBuffer()); text = await extractPdfText(bytes).catch(() => ''); images = (await renderPdfPagesToDataUrls(bytes, 1.7, 3)).pageUrls; } else images = [await fileToDataUrl(file)]; const { data, error } = await supabase.functions.invoke('ocr-pre-cadastro', { body: { fileName: file.name, mimeType: file.type || 'application/octet-stream', text, images } }); if (error) throw error; const result: OcrResult = data?.data || data || {}; setOcrResult(result); mergeOcrIntoForm(result, arquivoUrl); }
    catch (error: any) { toast.warning(`Ficha anexada, mas o OCR falhou: ${error.message}`); }
    finally { setOcrLoading(false); }
  };

  const uploadFicha = async (file?: File | null) => { if (!file) return; try { setLastFichaFile(file); const url = await uploadAdmissionFile(file, 'fichas'); setForm(prev => ({ ...prev, arquivo_ficha_url: url })); await runFichaOcr(file, url); } catch (error: any) { toast.error(`Erro no upload da ficha: ${error.message}`); } };

  const uploadDocumento = async (tipo_documento: string, file?: File | null) => { if (!file || !form.id) return toast.error('Salve o pre-cadastro antes de anexar documentos'); const url = await uploadAdmissionFile(file, `documentos/${form.id}`); const { error } = await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento, nome_arquivo: file.name, arquivo_url: url }); if (error) throw error; };

  const uploadEmLote = async (files?: FileList | null) => {
    if (!files?.length || !form.id) return toast.error('Salve o pré-cadastro antes de anexar documentos.');
    const lista = Array.from(files); let ok = 0;
    for (let i = 0; i < lista.length; i += 1) { setUploadProgress(`Enviando ${i + 1} de ${lista.length}`); try { await uploadDocumento('documentacao_admissional', lista[i]); ok += 1; } catch (error: any) { toast.error(`${lista[i].name}: ${error.message}`); } }
    setUploadProgress(''); toast.success(`${ok} de ${lista.length} documento(s) enviado(s).`); await carregarDocumentos();
  };

  const uploadASO = async (file?: File | null) => { if (!file || !form.id) return; const url = await uploadAdmissionFile(file, `aso/${form.id}`); await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'aso', nome_arquivo: file.name, arquivo_url: url }); await (supabase as any).from('pre_cadastros_admissionais').update({ arquivo_aso_url: url }).eq('id', form.id); setForm(prev => ({ ...prev, arquivo_aso_url: url })); await carregarDocumentos({ ...form, arquivo_aso_url: url }); };
  const uploadToxicologico = async (file?: File | null) => { if (!file || !form.id) return; const url = await uploadAdmissionFile(file, `toxicologico/${form.id}`); await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'toxicologico', nome_arquivo: file.name, arquivo_url: url }); await (supabase as any).from('pre_cadastros_admissionais').update({ arquivo_toxicologico_url: url, exige_toxicologico: true }).eq('id', form.id); setForm(prev => ({ ...prev, arquivo_toxicologico_url: url, exige_toxicologico: true })); await carregarDocumentos({ ...form, arquivo_toxicologico_url: url, exige_toxicologico: true }); };

  const buildGuiaAsoPdf = () => { if (!form.nome || !form.empresa_nome || !form.cpf || !form.funcao) { toast.error('Informe empresa, nome, CPF e funcao antes de gerar a guia ASO.'); return null; } return gerarAutorizacaoExameAdmissionalPdf({ empresa: form.empresa_nome || '', cnpj: form.cnpj || '', nome: form.nome || '', cpf: form.cpf || '', rg: form.rg || '', funcao: form.funcao || '', dataAdmissao: form.data_admissao || '', dataNascimento: form.data_nascimento || '', setorGhe: form.setor_ghe || '', dataExame: new Date().toISOString().slice(0, 10), tipoExame: form.tipo_admissao || 'Admissional', obraLocal: form.obra_local || '', trabalhoAltura: false, espacoConfinado: false, toxicologico: !!form.exige_toxicologico, responsavelContato: form.responsavel_contato || 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385' }); };
  const gerarGuiaAso = async () => { const pdf = buildGuiaAsoPdf(); if (!pdf) return; const url = URL.createObjectURL(pdf.blob); setLastAsoGuide({ ...pdf, url }); window.open(url, '_blank', 'noopener,noreferrer'); if (form.id) { const stored = await uploadAdmissionBlob(pdf.blob, `guia-aso/${form.id}`, pdf.fileName); await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'guia_aso', nome_arquivo: pdf.fileName, arquivo_url: stored }); await carregarDocumentos(); } };
  const enviarGuiaAso = async () => { const pdf = lastAsoGuide || buildGuiaAsoPdf(); if (!pdf) return; setEmailPdfDraft({ to: ['agendamento@ponteaereaseguranca.com.br'], cc: Array.from(CC_OBRIGATORIO), subject: `Solicitacao de exame - ${form.nome || ''}`, body: buildExameEmailBody(form), attachmentBlob: pdf.blob, attachmentName: pdf.fileName }); };

  const toggleDocumento = (key: string) => setDocumentos(prev => prev.map(d => d.key === key ? { ...d, selecionado: !d.selecionado } : d));
  const selectAll = () => setDocumentos(prev => prev.map(d => ({ ...d, selecionado: true })));
  const clearAll = () => setDocumentos(prev => prev.map(d => ({ ...d, selecionado: false })));
  const selectDuplicates = () => setDocumentos(prev => prev.map(d => ({ ...d, selecionado: d.duplicado })));
  const excluirDocumento = async (doc: DocumentoConferencia) => {
    if (!window.confirm(`Excluir o vínculo do documento ${doc.nome}?`)) return;
    if (doc.id) await (supabase as any).from('pre_cadastro_documentos').delete().eq('id', doc.id);
    const update: Record<string, string> = {};
    if (doc.categoria === 'ASO' && form.arquivo_aso_url === doc.url) update.arquivo_aso_url = '';
    if (doc.categoria === 'TOXICOLOGICO' && form.arquivo_toxicologico_url === doc.url) update.arquivo_toxicologico_url = '';
    if (doc.categoria === 'FICHA/DOCUMENTACAO' && form.arquivo_ficha_url === doc.url) update.arquivo_ficha_url = '';
    if (Object.keys(update).length && form.id) { await (supabase as any).from('pre_cadastros_admissionais').update(update).eq('id', form.id); setForm(prev => ({ ...prev, ...update })); }
    await carregarDocumentos({ ...form, ...update });
  };
  const excluirDuplicadosSelecionados = async () => { for (const doc of documentos.filter(d => d.duplicado && d.selecionado)) await excluirDocumento(doc); };

  const carregarAnexosSelecionados = async () => Promise.all(selectedDocs.map(async doc => { const response = await fetch(doc.url); if (!response.ok) throw new Error(`Nao foi possivel baixar ${doc.nome}`); const attachmentBlob = await response.blob(); return { attachmentBlob, attachmentName: doc.nome, attachmentContentType: attachmentBlob.type || mimeFromFileName(doc.nome), documentId: doc.id, documentName: doc.nome, label: doc.categoria }; }));
  const enviarContabilidade = async () => { if (!selectedDocs.length) return toast.error('Selecione pelo menos um documento.'); if (!window.confirm(`Enviar e-mail automaticamente com ${selectedDocs.length} anexo(s)?`)) return; try { const attachments = await carregarAnexosSelecionados(); const { data: sessionData } = await supabase.auth.getSession(); const authUser = sessionData.session?.user; await sendEmailWithPdfAttachment({ to: CONTABILIDADE_DESTINATARIOS, cc: Array.from(CC_OBRIGATORIO), subject: `Documentação admissional - ${form.nome || ''} - ${form.empresa_nome || ''}`, body: buildContabilidadeEmailBody(form), attachments, senderUserId: authUser?.id, senderName: String(authUser?.user_metadata?.nome_completo || authUser?.email || ''), senderEmail: authUser?.email, moduleOrigin: 'pre-cadastro admissional', documentName: `Documentação admissional - ${form.nome || ''}`, authToken: sessionData.session?.access_token }); toast.success('E-mail enviado automaticamente para a contabilidade.'); } catch (error) { console.error('Falha no envio automático para contabilidade:', error); toast.error(error?.message || 'Não foi possível enviar o e-mail automaticamente.'); } };

  const migrarDocumentosPreCadastro = async (funcionarioId: string) => { if (!form.id || !funcionarioId || !form.empresa_id) return 0; const empresa = companies.find(c => c.id === form.empresa_id); const { data: docs } = await (supabase as any).from('pre_cadastro_documentos').select('*').eq('pre_cadastro_id', form.id); let migrados = 0; for (const doc of docs || []) { if (!doc.arquivo_url) continue; await registrarDocumento({ funcionarioId, funcionarioNome: form.nome || 'Funcionario', companyId: form.empresa_id, empresaNome: empresa?.name || form.empresa_nome || '', tipoDocumento: categoriaPreCadastro(doc.tipo_documento), categoria: categoriaPreCadastro(doc.tipo_documento), origem: 'pre_cadastro', descricao: doc.nome_arquivo || '', arquivoUrl: doc.arquivo_url, nomeArquivo: doc.nome_arquivo || '', dataDocumento: doc.created_at || new Date().toISOString(), geradoPorUserId: session?.user?.id || ZERO_UUID, geradoPorNome: session?.user?.email || 'Sistema', unidade: empresa?.name || form.empresa_nome || '' }); migrados += 1; } return migrados; };
  const aprovarOficial = async () => { if (!form.id || !form.empresa_id || !form.nome) return; const { data: funcionarioId, error } = await (supabase as any).rpc('admin_pre_cadastro_aprovar_oficial', { p_id: form.id }); if (error) return toast.error(error.message); await migrarDocumentosPreCadastro(String(funcionarioId || '')); await Promise.all([carregar(), refreshData()]); };

  return <div className="space-y-5 animate-fade-in">
    <div className="card-premium p-6 gradient-primary text-primary-foreground"><div className="flex items-center gap-4"><div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center"><FileSearch className="w-7 h-7" /></div><div><h1 className="text-2xl font-bold font-display">Pre-cadastro Admissional</h1><p className="text-primary-foreground/70 text-sm">Conferência, documentos, ASO e envio para contabilidade.</p></div></div></div>
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
      <div className="card-premium p-4 space-y-3">
        <div className="flex gap-2"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." /><Button variant="outline" onClick={carregar}><RefreshCw className="w-4 h-4" /></Button></div>
        <Button onClick={novo} className="w-full">Novo pre-cadastro</Button>
        <div className="border-t pt-3 space-y-2"><select value={migrationEmployeeId} onChange={e => setMigrationEmployeeId(e.target.value)} className="w-full border rounded-lg px-3 py-2"><option value="">Funcionario origem</option>{migrationEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select><select value={migrationCompanyId} onChange={e => setMigrationCompanyId(e.target.value)} className="w-full border rounded-lg px-3 py-2"><option value="">Empresa destino</option>{migrationDestinationCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{migrationEmployee && <div className="text-xs text-muted-foreground">Origem: {migrationOriginCompany?.name || '-'}</div>}<Button variant="outline" onClick={prepararMigracaoFuncionario} className="w-full"><ArrowRight className="w-4 h-4 mr-2" />Puxar para pre-ficha</Button></div>
        <div className="space-y-2 max-h-[62vh] overflow-y-auto">{filtered.map(row => <button key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left rounded-xl border p-3 ${selectedId === row.id ? 'border-primary bg-primary/5' : ''}`}><div className="font-semibold text-sm">{row.nome || 'Sem nome'}</div><div className="text-xs text-muted-foreground">{row.empresa_nome || '-'} - {row.cpf || '-'}</div><Badge variant="outline" className="mt-2 text-[10px]">{statusLabel[row.status] || row.status}</Badge></button>)}</div>
      </div>
      <div className="card-premium p-5 space-y-5">
        <div className="flex justify-between"><div><h2 className="text-lg font-bold">Conferencia admissional</h2><p className="text-xs text-muted-foreground">Confira dados e documentos antes do envio.</p></div></div>
        <div className="rounded-xl border border-dashed p-4"><label className="text-sm font-semibold flex gap-2 mb-2"><Upload className="w-4 h-4" />Ficha de Solicitação de Emprego</label><input type="file" accept=".pdf,image/*" onChange={e => uploadFicha(e.target.files?.[0])} />{ocrLoading && <span className="ml-2 text-sm"><Loader2 className="inline w-4 h-4 animate-spin" /> Lendo...</span>}</div>
        {duplicateCpf && <div className="rounded-lg border border-warning bg-warning/10 p-3 text-sm text-warning">CPF já existe em outro pré-cadastro.</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="text-xs">Empresa contratante</label><select value={form.empresa_id || ''} onChange={e => setCompany(e.target.value)} className="w-full border rounded-lg px-3 py-2"><option value="">Selecionar</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <Field label="Nome" value={form.nome} onChange={v => setForm(p => ({ ...p, nome: v }))} /><Field label="CPF" value={form.cpf} onChange={v => setForm(p => ({ ...p, cpf: v }))} /><Field label="RG" value={form.rg} onChange={v => setForm(p => ({ ...p, rg: v }))} /><DateField label="Data nascimento" value={form.data_nascimento} onChange={v => setForm(p => ({ ...p, data_nascimento: v }))} /><DateField label="Data admissao" value={form.data_admissao} onChange={v => setForm(p => ({ ...p, data_admissao: v }))} />
          <div><label className="text-xs">Funcao</label><select value={form.funcao || ''} onChange={e => setFuncaoComPadroes(e.target.value)} className="w-full border rounded-lg px-3 py-2"><option value="">Selecionar</option>{roleOptions.map(r => <option key={r.cargo} value={r.cargo}>{r.cargo}</option>)}</select></div>
          <Field label="Setor/GHE" value={form.setor_ghe} onChange={v => setForm(p => ({ ...p, setor_ghe: v }))} /><Field label="Obra/Local" value={form.obra_local} onChange={v => setForm(p => ({ ...p, obra_local: v }))} /><div><label className="text-xs">Salario</label><Input type="number" value={form.salario || ''} onChange={e => setForm(p => ({ ...p, salario: Number(e.target.value) || null }))} /></div>
          <Field label="E-mail" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} /><Field label="Celular" value={form.celular} onChange={v => setForm(p => ({ ...p, celular: v }))} /><BooleanField label="VR" value={!!form.vale_refeicao} onChange={v => setForm(p => ({ ...p, vale_refeicao: v }))} /><BooleanField label="VT" value={!!form.vale_transporte} onChange={v => setForm(p => ({ ...p, vale_transporte: v }))} /><Field label="Insalubridade" value={form.insalubridade} onChange={v => setForm(p => ({ ...p, insalubridade: v }))} />
          {(isGuincheiro(form.funcao) || form.exige_toxicologico) && <BooleanField label="Exame toxicológico obrigatório" value={!!form.exige_toxicologico} onChange={v => setForm(p => ({ ...p, exige_toxicologico: v }))} />}
        </div>

        <div className="rounded-xl border p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">Conferência de documentos</h3><p className="text-xs text-muted-foreground">Confira faltantes, duplicados e escolha o que será enviado.</p></div><Button size="sm" variant="outline" onClick={() => carregarDocumentos()} disabled={documentosLoading}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2"><Summary label="Total" value={documentos.length} /><Summary label="Selecionados" value={selectedDocs.length} /><Summary label="Duplicados" value={duplicateDocs.length} attention={duplicateDocs.length > 0} /><Summary label="Faltantes" value={missingDocs.length} danger={missingDocs.length > 0} /></div>
          {missingDocs.length > 0 && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><strong>Faltando:</strong> {missingDocs.join(', ')}</div>}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={selectAll}>Selecionar todos</Button><Button size="sm" variant="outline" onClick={clearAll}>Limpar seleção</Button><Button size="sm" variant="outline" onClick={selectDuplicates}>Selecionar duplicados</Button><Button size="sm" variant="destructive" onClick={excluirDuplicadosSelecionados} disabled={!documentos.some(d => d.duplicado && d.selecionado)}><Trash2 className="w-4 h-4 mr-2" />Excluir duplicados selecionados</Button></div>
          <div className="space-y-2">{documentos.map(doc => <div key={doc.key} className={`grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-lg border p-3 ${doc.duplicado ? 'border-warning bg-warning/10' : 'border-border'}`}><input type="checkbox" checked={doc.selecionado} onChange={() => toggleDocumento(doc.key)} /><div><div className="font-medium text-sm">{doc.nome}</div><div className="text-xs text-muted-foreground">{doc.categoria} · {doc.created_at ? new Date(doc.created_at).toLocaleDateString('pt-BR') : 'sem data'}</div><Badge variant="outline" className={`mt-1 ${doc.duplicado ? 'text-warning' : doc.categoria === 'NAO RECONHECIDO' ? 'text-muted-foreground' : 'text-primary'}`}>{doc.duplicado ? 'Possível duplicado' : doc.categoria === 'NAO RECONHECIDO' ? 'Não reconhecido' : 'OK'}</Badge></div><div className="flex gap-2"><a href={doc.url} target="_blank" rel="noreferrer" className="text-sm underline">Abrir</a><button onClick={() => excluirDocumento(doc)} className="text-destructive"><Trash2 className="w-4 h-4" /></button></div></div>)}{!documentosLoading && documentos.length === 0 && <div className="text-sm text-muted-foreground">Nenhum documento anexado.</div>}</div>
          <div className="flex flex-wrap gap-2 items-center"><label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer"><Upload className="w-4 h-4" />Selecionar vários documentos<input multiple type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadEmLote(e.target.files)} /></label>{uploadProgress && <span className="text-sm text-primary">{uploadProgress}</span>}<label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer">Subir ASO<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadASO(e.target.files?.[0])} /></label>{(isGuincheiro(form.funcao) || form.exige_toxicologico) && <label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer">Subir Toxicológico<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadToxicologico(e.target.files?.[0])} /></label>}</div>
        </div>

        <div className="flex flex-wrap gap-2"><Button onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" />Salvar</Button><Button onClick={gerarGuiaAso} variant="outline"><FileSearch className="w-4 h-4 mr-2" />Gerar Guia ASO</Button><Button onClick={enviarGuiaAso} variant="outline"><Mail className="w-4 h-4 mr-2" />Enviar guia ASO</Button><Button onClick={enviarContabilidade} disabled={selectedDocs.length === 0} variant="outline"><ArrowRight className="w-4 h-4 mr-2" />E-mail contabilidade ({selectedDocs.length})</Button><Button onClick={aprovarOficial}><CheckCircle2 className="w-4 h-4 mr-2" />Aprovar cadastro oficial</Button></div>
      </div>
    </div>
    <EmailPdfModal open={!!emailPdfDraft} draft={emailPdfDraft} onOpenChange={open => { if (!open) setEmailPdfDraft(null); }} />
  </div>;
};

const Field = ({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><Input value={value || ''} onChange={e => onChange(e.target.value)} /></div>;
const DateField = ({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} /></div>;
const BooleanField = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><select value={value ? 'sim' : 'nao'} onChange={e => onChange(e.target.value === 'sim')} className="w-full border rounded-lg px-3 py-2 bg-background"><option value="nao">Não</option><option value="sim">Sim</option></select></div>;
const Summary = ({ label, value, attention, danger }: { label: string; value: number; attention?: boolean; danger?: boolean }) => <div className={`rounded-lg border p-3 ${danger ? 'border-destructive bg-destructive/10' : attention ? 'border-warning bg-warning/10' : ''}`}><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>;

export default PreCadastroAdmissionalOcrPage;
