import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, FileText, Loader2, Mail, MessageCircle, Printer, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { CC_OBRIGATORIO } from '@/lib/emailUtils';
import { gerarAutorizacaoExameAdmissionalPdf, gerarFichaSolicitacaoEmpregoPdf, getAsoClinicCommunicationInfo } from '@/lib/pdfGenerator';
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
const CONTABILIDADE_DESTINATARIOS = ['marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br', ''];
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
const saudacaoAtual = () => { const hora = new Date().getHours(); return hora < 12 ? 'bom dia' : hora < 18 ? 'boa tarde' : 'boa noite'; };
const saudacaoCapitalizada = () => { const s = saudacaoAtual(); return s.charAt(0).toUpperCase() + s.slice(1); };
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
  if (/DOCUMENTACAO[_ ]UNIFICADA|DOCUMENTOS[_ ]UNIFICADOS|ARQUIVO[_ ]UNICO/.test(normalizado)) return 'DOCUMENTACAO UNIFICADA';
  if (normalizado.includes('FICHA') && normalizado.includes('FSE')) return 'FICHA PREENCHIDA';
  if (normalizado.includes('FICHA') && normalizado.includes('FSE')) return 'FICHA PREENCHIDA';
  if (normalizado.includes('FICHA') || normalizado.includes('DADOS CADASTRAIS') || normalizado.includes('DOCUMENTACAO ADMISSIONAL')) return 'FICHA/DOCUMENTACAO';
  if (normalizado.includes('CONTRATO')) return 'CONTRATO';
  return 'NAO RECONHECIDO';
};

const exclusiveCategory = (categoria: string) => ['ASO', 'GUIA ASO', 'FICHA/DOCUMENTACAO', 'FICHA PREENCHIDA', 'TOXICOLOGICO'].includes(categoria);

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
  `Prezados, ${saudacaoAtual()}.`, '',
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
  const [asoExamDate, setAsoExamDate] = useState('');
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
  useEffect(() => {
    const preId = new URLSearchParams(window.location.search).get('pre');
    if (preId && rows.some(row => row.id === preId)) setSelectedId(preId);
  }, [rows]);
  useEffect(() => { const selected = rows.find(r => r.id === selectedId); if (selected) { setForm(selected); setAsoExamDate(''); setOcrResult((selected.dados_extraidos as OcrResult) || null); carregarDocumentos(selected); } }, [rows, selectedId]);
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
    const unificado = categorias.has('DOCUMENTACAO UNIFICADA');
    const missing: string[] = [];
    if (!unificado && !categorias.has('FICHA/DOCUMENTACAO')) missing.push('Ficha/documentação admissional');
    if (!unificado && !categorias.has('ASO')) missing.push('ASO');
    if (!unificado && (form.exige_toxicologico || isGuincheiro(form.funcao)) && !categorias.has('TOXICOLOGICO')) missing.push('Toxicológico');
    return missing;
  }, [documentos, form.exige_toxicologico, form.funcao]);
  const selectedDocs = documentos.filter(d => d.selecionado);
  const duplicateDocs = documentos.filter(d => d.duplicado);

  const setCompany = (id: string) => { const company = companies.find(x => x.id === id); setForm(prev => ({ ...prev, empresa_id: id, empresa_nome: company?.name || '', cnpj: company?.cnpj || '' })); };
  const setFuncaoComPadroes = (funcao: string) => setForm(prev => ({ ...prev, funcao, exige_toxicologico: isGuincheiro(funcao) ? true : prev.exige_toxicologico }));
  const novo = () => { setSelectedId(''); setForm(initialForm); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setAsoExamDate(''); setDocumentos([]); };

  const prepararMigracaoFuncionario = () => {
    const emp = migrationEmployee; const destino = companies.find(c => c.id === migrationCompanyId); const origem = emp ? companies.find(c => c.id === emp.companyId) : null;
    if (!emp || !destino) return toast.error('Selecione o funcionario de origem e a empresa destino.');
    const now = new Date().toISOString();
    setSelectedId(''); setSearch(''); setOcrResult(null); setLastFichaFile(null); setLastAsoGuide(null); setAsoExamDate(''); setDocumentos([]);
    setForm({ status: 'aguardando_validacao', empresa_id: destino.id, empresa_nome: destino.name || '', cnpj: destino.cnpj || '', nome: emp.name || '', cpf: emp.cpf || '', rg: emp.rg || '', data_nascimento: emp.dataNascimento || '', data_admissao: emp.dataAdmissao || '', funcao: emp.cargo || '', setor_ghe: emp.setorGhe || '', obra_local: destino.city || '', salario: Number(emp.salarioBase) || null, tipo_admissao: 'Transferencia entre empresas', jornada: '', beneficios: buildMigrationBenefits(emp), insalubridade: employeeHasInsalubridade(emp) ? `Sim - ${formatBRL(Number(emp.insalubridadeValor || config.valorInsalubridade || 0))}` : isMotoboyRole(emp.cargo) ? `Periculosidade - ${formatBRL(getPericulosidadeAplicavel(emp))}` : 'Nao', filiacao: '', endereco: emp.endereco || '', escolaridade: '', experiencia: emp.observacoes || '', epi: '', responsavel_contato: '', email: emp.email || '', celular: emp.celular || emp.telefone || '', vale_refeicao: !!emp.vrAtivo, vale_transporte: !!emp.vtAtivo, exige_toxicologico: isGuincheiro(emp.cargo), arquivo_ficha_url: '', arquivo_aso_url: '', arquivo_toxicologico_url: '', dados_extraidos: { origem_migracao_funcionario: { funcionario_id: emp.id, empresa_origem_nome: origem?.name || '', empresa_destino_nome: destino.name || '', preparado_em: now } } });
  };

  const salvar = async () => {
    setSaving(true); const payload = { ...form, criado_por: session?.user?.id || null }; const request = form.id ? (supabase as any).from('pre_cadastros_admissionais').update(payload).eq('id', form.id).select('*').limit(1) : (supabase as any).from('pre_cadastros_admissionais').insert(payload).select('*').limit(1); const { data: rows, error } = await request; setSaving(false); if (error) return toast.error(`Erro ao salvar: ${error.message}`); const data = rows?.[0]; if (!data?.id) return toast.error('Erro ao salvar: o pré-cadastro não retornou um registro válido.'); setSelectedId(data.id); toast.success('Pre-cadastro salvo no banco'); await carregar();
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

  const uploadUnificado = async (file?: File | null) => {
    if (!file || !form.id) return toast.error('Salve o pré-cadastro antes de anexar documentos.');
    if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) return toast.error('Para documentação unificada, envie um arquivo PDF.');
    try {
      setUploadProgress('Enviando PDF único com a documentação...');
      await uploadDocumento('documentacao_unificada', file);
      setUploadProgress('');
      toast.success('PDF único anexado. Ele pode conter documentos admissionais e ASO e não bloqueia a finalização.');
      await carregarDocumentos();
    } catch (error: any) {
      setUploadProgress('');
      toast.error(error?.message || 'Não foi possível anexar o PDF único.');
    }
  };

  const uploadASO = async (file?: File | null) => {
    if (!file || !form.id) return;
    const url = await uploadAdmissionFile(file, `aso/${form.id}`);
    await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'aso', nome_arquivo: file.name, arquivo_url: url });
    await (supabase as any).from('pre_cadastros_admissionais').update({ arquivo_aso_url: url }).eq('id', form.id);
    setForm(prev => ({ ...prev, arquivo_aso_url: url }));
    await carregarDocumentos({ ...form, arquivo_aso_url: url });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sessão administrativa não encontrada.');
      const response = await fetch('/api/pre-cadastro-contabilidade', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ preCadastroId: form.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Falha ao enviar para contabilidade.');
      toast.success('ASO recebido. Documentação enviada automaticamente à contabilidade.');
      await carregar();
    } catch (error: any) {
      toast.error(`ASO salvo, mas o envio automático à contabilidade falhou: ${error?.message || 'tente novamente'}`);
    }
  };
  const uploadToxicologico = async (file?: File | null) => { if (!file || !form.id) return; const url = await uploadAdmissionFile(file, `toxicologico/${form.id}`); await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'toxicologico', nome_arquivo: file.name, arquivo_url: url }); await (supabase as any).from('pre_cadastros_admissionais').update({ arquivo_toxicologico_url: url, exige_toxicologico: true }).eq('id', form.id); setForm(prev => ({ ...prev, arquivo_toxicologico_url: url, exige_toxicologico: true })); await carregarDocumentos({ ...form, arquivo_toxicologico_url: url, exige_toxicologico: true }); };

  const buildGuiaAsoPdf = () => { if (!asoExamDate) { toast.error('Selecione a data do exame antes de gerar a guia ASO.'); return null; } if (!form.nome || !form.empresa_nome || !form.cpf || !form.funcao) { toast.error('Informe empresa, nome, CPF e funcao antes de gerar a guia ASO.'); return null; } return gerarAutorizacaoExameAdmissionalPdf({ empresa: form.empresa_nome || '', cnpj: form.cnpj || '', nome: form.nome || '', cpf: form.cpf || '', rg: form.rg || '', funcao: form.funcao || '', dataAdmissao: form.data_admissao || '', dataNascimento: form.data_nascimento || '', setorGhe: form.setor_ghe || '', dataExame: asoExamDate, tipoExame: form.tipo_admissao || 'Admissional', obraLocal: form.obra_local || '', trabalhoAltura: false, espacoConfinado: false, toxicologico: !!form.exige_toxicologico, responsavelContato: form.responsavel_contato || 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385' }); };
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
  const enviarContabilidade = async () => {
    if (!selectedDocs.length) return toast.error('Selecione pelo menos um documento.');
    try {
      const attachments = await carregarAnexosSelecionados();
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData.session?.user;
      setEmailPdfDraft({
        to: CONTABILIDADE_DESTINATARIOS,
        cc: Array.from(CC_OBRIGATORIO),
        subject: `Documentação admissional - ${form.nome || ''} - ${form.empresa_nome || ''}`,
        body: buildContabilidadeEmailBody(form),
        attachments,
        checklistItems: selectedDocs.map(doc => ({ label: doc.nome, found: true, detail: doc.categoria })),
        missingWarnings: missingDocs.length ? [`Pendências informativas: ${missingDocs.join(', ')}. Elas não bloqueiam este envio nem a finalização do pré-cadastro.`] : [],
        senderUserId: authUser?.id,
        senderName: String(authUser?.user_metadata?.nome_completo || authUser?.email || ''),
        senderEmail: authUser?.email,
        moduleOrigin: 'pre-cadastro admissional',
        documentName: `Documentação admissional - ${form.nome || ''}`,
      });
    } catch (error: any) {
      console.error('Falha ao preparar e-mail para contabilidade:', error);
      toast.error(error?.message || 'Não foi possível preparar o e-mail para a contabilidade.');
    }
  };

  const migrarDocumentosPreCadastro = async (funcionarioId: string) => { if (!form.id || !funcionarioId || !form.empresa_id) return 0; const empresa = companies.find(c => c.id === form.empresa_id); const { data: docs } = await (supabase as any).from('pre_cadastro_documentos').select('*').eq('pre_cadastro_id', form.id); let migrados = 0; for (const doc of docs || []) { if (!doc.arquivo_url) continue; await registrarDocumento({ funcionarioId, funcionarioNome: form.nome || 'Funcionario', companyId: form.empresa_id, empresaNome: empresa?.name || form.empresa_nome || '', tipoDocumento: categoriaPreCadastro(doc.tipo_documento), categoria: categoriaPreCadastro(doc.tipo_documento), origem: 'pre_cadastro', descricao: doc.nome_arquivo || '', arquivoUrl: doc.arquivo_url, nomeArquivo: doc.nome_arquivo || '', dataDocumento: doc.created_at || new Date().toISOString(), geradoPorUserId: session?.user?.id || ZERO_UUID, geradoPorNome: session?.user?.email || 'Sistema', unidade: empresa?.name || form.empresa_nome || '' }); migrados += 1; } return migrados; };
  const aprovarOficial = async () => { if (!form.id || !form.empresa_id || !form.nome) return; const { data: funcionarioId, error } = await (supabase as any).rpc('admin_pre_cadastro_aprovar_oficial', { p_id: form.id }); if (error) return toast.error(error.message); await migrarDocumentosPreCadastro(String(funcionarioId || '')); await Promise.all([carregar(), refreshData()]); };

  // pre-cadastro-workflow-v2
  const fseDigital = (((form.dados_extraidos as any)?.fse_digital || {}) as Record<string, any>);
  const fichaFseArquivada = documentos.find(doc => normalizeRole(doc.tipo_documento).includes('FICHA_FSE_PREENCHIDA'));
  const dadosAsoAtuais = () => ({
    empresa: form.empresa_nome || '', cnpj: form.cnpj || '', nome: form.nome || '', cpf: form.cpf || '', rg: form.rg || '',
    funcao: form.funcao || '', dataAdmissao: form.data_admissao || '', dataNascimento: form.data_nascimento || '', setorGhe: form.setor_ghe || '',
    dataExame: asoExamDate || '', tipoExame: form.tipo_admissao || 'Admissional', obraLocal: form.obra_local || '', trabalhoAltura: false,
    espacoConfinado: false, toxicologico: !!form.exige_toxicologico, responsavelContato: form.responsavel_contato || 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385',
  });
  const asoClinicInfo = getAsoClinicCommunicationInfo(dadosAsoAtuais());

  const gerarFichaPreenchida = async () => {
    if (fichaFseArquivada?.url) { window.open(fichaFseArquivada.url, '_blank', 'noopener,noreferrer'); return; }
    if (!form.id || !Object.keys(fseDigital).length) { toast.error('A ficha digital preenchida pelo candidato ainda não está disponível.'); return; }
    try {
      const pdf = gerarFichaSolicitacaoEmpregoPdf({ empresa: form.empresa_nome || 'TOPAC', funcao: form.funcao || '', fse: fseDigital });
      const localUrl = URL.createObjectURL(pdf.blob);
      window.open(localUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(localUrl), 60000);
      const stored = await uploadAdmissionBlob(pdf.blob, `ficha-fse/${form.id}`, pdf.fileName);
      await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'ficha_fse_preenchida', nome_arquivo: pdf.fileName, arquivo_url: stored });
      toast.success('Ficha preenchida arquivada em PDF junto aos documentos.');
      await carregarDocumentos();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível gerar a ficha preenchida.'); }
  };

  const enviarAsoCandidato = async () => {
    if (!form.id) return toast.error('Selecione e salve o pré-cadastro primeiro.');
    const telefone = onlyDigits(form.celular);
    if (telefone.length < 10) return toast.error('Informe o celular/WhatsApp do candidato.');
    const { data: guia, error } = await (supabase as any).from('pre_cadastro_documentos')
      .select('arquivo_url,nome_arquivo,created_at').eq('pre_cadastro_id', form.id).eq('tipo_documento', 'guia_aso')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return toast.error(`Não foi possível localizar a guia ASO: ${error.message}`);
    if (!guia?.arquivo_url) return toast.error('Gere a Guia ASO antes de enviar ao candidato.');
    const tipoNormalizado = normalizeRole(form.tipo_admissao);
    const tipoTexto = tipoNormalizado.includes('DEMISSIONAL') ? 'demissional' : tipoNormalizado.includes('PERIOD') ? 'periódico' : tipoNormalizado.includes('RETORNO') ? 'de retorno ao trabalho' : tipoNormalizado.includes('MUDANCA') ? 'de mudança de função' : 'admissional';
    const primeiroNome = String(form.nome || '').trim().split(/\s+/)[0];
    const horario = asoClinicInfo.horarios.join(' ');
    const mensagem = [
      saudacaoCapitalizada() + (primeiroNome ? ', ' + primeiroNome : '') + '!',
      '',
      `Segue a ficha de agendamento do exame ${tipoTexto}.`,
      asoExamDate ? `Data: ${formatDateEmail(asoExamDate)}` : '',
      `Endereço: ${asoClinicInfo.local}`,
      `Horário de atendimento: ${horario}`,
      '',
      `Guia do exame: ${guia.arquivo_url}`,
      '',
      'Após realizar o exame, por favor, me dê um OK por aqui para agilizarmos o processo.',
      'Não precisa retirar o resultado/ASO na clínica; a própria clínica nos envia diretamente.',
    ].filter(Boolean).join('\n');
    const numero = telefone.startsWith('55') ? telefone : `55${telefone}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener,noreferrer');
  };

  return <div className="space-y-4 animate-fade-in pb-8">
    <div className="card-premium overflow-hidden border border-primary/15">
      <div className="flex flex-col gap-3 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15"><FileSearch className="h-5 w-5 text-primary" /></div><div><h1 className="text-xl font-bold">Pré-cadastro Admissional</h1><p className="text-sm text-muted-foreground">Contratação, ficha do candidato, ASO, documentos e finalização em um único fluxo.</p></div></div>
        <div className="flex flex-wrap gap-2"><Button onClick={novo} variant="outline">Novo pré-cadastro</Button><Button onClick={salvar} disabled={saving}><Save className="mr-2 h-4 w-4" />Salvar</Button></div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[330px_minmax(0,1fr)] items-start">
      <aside className="card-premium p-4 space-y-3 2xl:sticky 2xl:top-4">
        <div><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Candidatos</div><div className="mt-2 flex gap-2"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome ou CPF..." /><Button size="icon" variant="outline" onClick={carregar}><RefreshCw className="h-4 w-4" /></Button></div></div>
        <details className="rounded-xl border bg-muted/20 p-3"><summary className="cursor-pointer text-sm font-semibold">Transferência entre empresas</summary><div className="mt-3 space-y-2"><select value={migrationEmployeeId} onChange={e => setMigrationEmployeeId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Funcionário origem</option>{migrationEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select><select value={migrationCompanyId} onChange={e => setMigrationCompanyId(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Empresa destino</option>{migrationDestinationCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{migrationEmployee && <div className="text-xs text-muted-foreground">Origem: {migrationOriginCompany?.name || '-'}</div>}<Button variant="outline" onClick={prepararMigracaoFuncionario} className="w-full"><ArrowRight className="mr-2 h-4 w-4" />Puxar para pré-ficha</Button></div></details>
        <div className="max-h-[66vh] space-y-2 overflow-y-auto pr-1">{filtered.map(row => <button key={row.id} data-pre-cadastro-id={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left rounded-xl border p-3 transition ${selectedId === row.id ? 'border-primary bg-primary/10 shadow-sm' : 'border-border hover:border-primary/30 hover:bg-muted/30'}`}><div className="pr-12 text-sm font-semibold">{row.nome || 'Sem nome informado'}</div><div className="mt-1 text-xs text-muted-foreground">{row.empresa_nome || 'Empresa pendente'} • {row.cpf || 'CPF pendente'}</div><Badge variant="outline" className="mt-2 text-[10px]">{statusLabel[row.status] || row.status}</Badge></button>)}{!loading && !filtered.length && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum pré-cadastro encontrado.</div>}</div>
      </aside>

      <main className="min-w-0 space-y-4">
        <div className="card-premium p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="text-lg font-bold">Conferencia admissional</h2><p className="text-sm text-muted-foreground">{form.nome ? <><strong className="text-foreground">{form.nome}</strong> • {form.empresa_nome || 'selecione a empresa'} • {form.funcao || 'selecione o cargo'}</> : 'Selecione um candidato ao lado ou crie um novo pré-cadastro.'}</p></div>{form.status && <Badge variant="outline">{statusLabel[form.status] || form.status}</Badge>}</div>
        </div>

        {duplicateCpf && <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning"><AlertTriangle className="mr-2 inline h-4 w-4" />CPF já existe em outro pré-cadastro. Confira antes de aprovar.</div>}

        <section className="card-premium p-5 space-y-4">
          <div><div className="text-xs font-bold uppercase tracking-wider text-primary">1. Contratação</div><h3 className="mt-1 text-base font-bold">Dados que o RH confirma</h3><p className="text-xs text-muted-foreground">Empresa, cargo, salário, benefícios e datas ficam concentrados aqui.</p></div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div><label className="text-xs text-muted-foreground">Empresa contratante</label><select value={form.empresa_id || ''} onChange={e => setCompany(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"><option value="">Selecionar empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="text-xs text-muted-foreground">Funcao</label><select value={form.funcao || ''} onChange={e => setFuncaoComPadroes(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2"><option value="">Selecionar cargo</option>{roleOptions.map(r => <option key={r.cargo} value={r.cargo}>{r.cargo}</option>)}</select></div>
            <div><label className="text-xs text-muted-foreground">Salario</label><Input type="number" value={form.salario || ''} onChange={e => setForm(p => ({ ...p, salario: Number(e.target.value) || null }))} /></div>
            <DateField label="Data admissao" value={form.data_admissao} onChange={v => setForm(p => ({ ...p, data_admissao: v }))} />
            <div><label className="text-xs text-muted-foreground">Data do exame / ASO</label><Input type="date" value={asoExamDate} onChange={e => { setAsoExamDate(e.target.value); setLastAsoGuide(null); }} /></div>
            <Field label="Tipo admissao" value={form.tipo_admissao} onChange={v => setForm(p => ({ ...p, tipo_admissao: v }))} />
            <Field label="Nome" value={form.nome} onChange={v => setForm(p => ({ ...p, nome: v }))} /><Field label="CPF" value={form.cpf} onChange={v => setForm(p => ({ ...p, cpf: v }))} /><Field label="RG" value={form.rg} onChange={v => setForm(p => ({ ...p, rg: v }))} />
            <DateField label="Data nascimento" value={form.data_nascimento} onChange={v => setForm(p => ({ ...p, data_nascimento: v }))} /><Field label="E-mail" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} /><Field label="Celular / WhatsApp" value={form.celular} onChange={v => setForm(p => ({ ...p, celular: v }))} />
            <Field label="Setor/GHE" value={form.setor_ghe} onChange={v => setForm(p => ({ ...p, setor_ghe: v }))} /><Field label="Obra/Local" value={form.obra_local} onChange={v => setForm(p => ({ ...p, obra_local: v }))} /><Field label="Insalubridade" value={form.insalubridade} onChange={v => setForm(p => ({ ...p, insalubridade: v }))} />
            <BooleanField label="VR" value={!!form.vale_refeicao} onChange={v => setForm(p => ({ ...p, vale_refeicao: v }))} /><BooleanField label="VT" value={!!form.vale_transporte} onChange={v => setForm(p => ({ ...p, vale_transporte: v }))} />{(isGuincheiro(form.funcao) || form.exige_toxicologico) && <BooleanField label="Toxicológico obrigatório" value={!!form.exige_toxicologico} onChange={v => setForm(p => ({ ...p, exige_toxicologico: v }))} />}
          </div>
          <details className="rounded-xl border bg-muted/15 p-3"><summary className="cursor-pointer text-sm font-semibold">Ver dados complementares</summary><div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Jornada" value={form.jornada} onChange={v => setForm(p => ({ ...p, jornada: v }))} /><Field label="Filiação" value={form.filiacao} onChange={v => setForm(p => ({ ...p, filiacao: v }))} /><Field label="Escolaridade" value={form.escolaridade} onChange={v => setForm(p => ({ ...p, escolaridade: v }))} /><div className="md:col-span-2 xl:col-span-3"><Field label="Endereço" value={form.endereco} onChange={v => setForm(p => ({ ...p, endereco: v }))} /></div><div className="md:col-span-2 xl:col-span-3"><Field label="Experiência" value={form.experiencia} onChange={v => setForm(p => ({ ...p, experiencia: v }))} /></div><Field label="EPI" value={form.epi} onChange={v => setForm(p => ({ ...p, epi: v }))} /><Field label="Benefícios" value={form.beneficios} onChange={v => setForm(p => ({ ...p, beneficios: v }))} /><Field label="Responsável/Contato" value={form.responsavel_contato} onChange={v => setForm(p => ({ ...p, responsavel_contato: v }))} /></div></details>
        </section>

        <section className="card-premium p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-primary">2. Ficha do candidato</div><h3 className="mt-1 text-base font-bold">Ficha FSE-2026 preenchida</h3><p className="text-xs text-muted-foreground">Ao concluir pelo link, a ficha vira PDF e fica arquivada junto aos documentos. Também pode ser aberta para impressão.</p></div><div id="topac-pre-cadastro-fse-slot" className="min-w-[210px]" /></div>
          <div className="flex flex-wrap gap-2"><Button onClick={() => void gerarFichaPreenchida()} variant="outline" disabled={!Object.keys(fseDigital).length && !fichaFseArquivada}><Printer className="mr-2 h-4 w-4" />Abrir / imprimir ficha preenchida</Button>{fichaFseArquivada && <Badge className="bg-emerald-500/10 text-emerald-600">PDF arquivado</Badge>}{!fichaFseArquivada && Object.keys(fseDigital).length > 0 && <Badge variant="outline">Ficha pronta para gerar</Badge>}</div>
        </section>

        <section className="card-premium p-5 space-y-4">
          <div><div className="text-xs font-bold uppercase tracking-wider text-primary">3. ASO e comunicação</div><h3 className="mt-1 text-base font-bold">Guia do exame</h3><p className="text-xs text-muted-foreground">A guia usa a data escolhida acima e pode ser enviada à clínica e ao candidato.</p></div>
          <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-xl border bg-muted/15 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Clínica / atendimento</div><div className="mt-2 text-sm font-semibold">{asoClinicInfo.local}</div><div className="mt-2 space-y-1 text-xs text-muted-foreground">{asoClinicInfo.horarios.map((linha, i) => <div key={i}>{linha}</div>)}</div></div><div className="rounded-xl border bg-muted/15 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mensagem ao candidato</div><p className="mt-2 text-sm text-muted-foreground">Saudação automática por horário + tipo do exame + endereço + horário. O candidato recebe o link da própria guia e confirma com um OK após o atendimento.</p></div></div>
          <div className="flex flex-wrap gap-2"><Button onClick={gerarGuiaAso}><FileSearch className="mr-2 h-4 w-4" />Gerar Guia ASO</Button><Button onClick={enviarGuiaAso} variant="outline"><Mail className="mr-2 h-4 w-4" />Enviar guia à clínica</Button><Button onClick={() => void enviarAsoCandidato()} variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Enviar ASO ao candidato</Button></div>
        </section>

        <section className="card-premium p-5 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold uppercase tracking-wider text-primary">4. Documentos</div><h3 className="mt-1 text-base font-bold">Arquivo admissional</h3><p className="text-xs text-muted-foreground">Ficha preenchida, documentos pessoais, guia ASO, ASO recebido e toxicológico ficam na mesma conferência.</p></div><Button size="sm" variant="outline" onClick={() => carregarDocumentos()} disabled={documentosLoading}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Summary label="Total" value={documentos.length} /><Summary label="Selecionados" value={selectedDocs.length} /><Summary label="Duplicados" value={duplicateDocs.length} attention={duplicateDocs.length > 0} /><Summary label="Pendências" value={missingDocs.length} attention={missingDocs.length > 0} /></div>
          {missingDocs.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><strong>Pendência informativa:</strong> {missingDocs.join(', ')}. Isso não bloqueia a continuidade.</div>}
          <div className="flex flex-wrap items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"><Upload className="h-4 w-4" />Documentos separados<input multiple type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadEmLote(e.target.files)} /></label><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm"><FileText className="h-4 w-4" />PDF único<input type="file" accept=".pdf" className="hidden" onChange={e => uploadUnificado(e.target.files?.[0])} /></label><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">Subir ASO<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadASO(e.target.files?.[0])} /></label>{(isGuincheiro(form.funcao) || form.exige_toxicologico) && <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">Subir Toxicológico<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadToxicologico(e.target.files?.[0])} /></label>}{uploadProgress && <span className="text-sm text-primary">{uploadProgress}</span>}</div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={selectAll}>Selecionar todos</Button><Button size="sm" variant="outline" onClick={clearAll}>Limpar seleção</Button><Button size="sm" variant="outline" onClick={selectDuplicates}>Selecionar duplicados</Button><Button size="sm" variant="destructive" onClick={excluirDuplicadosSelecionados} disabled={!documentos.some(d => d.duplicado && d.selecionado)}><Trash2 className="mr-2 h-4 w-4" />Excluir duplicados</Button></div>
          <div className="space-y-2">{documentos.map(doc => <div key={doc.key} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-3 ${doc.duplicado ? 'border-warning bg-warning/10' : 'border-border bg-background/50'}`}><input type="checkbox" checked={doc.selecionado} onChange={() => toggleDocumento(doc.key)} /><div className="min-w-0"><div className="truncate text-sm font-medium">{doc.nome}</div><div className="text-xs text-muted-foreground">{doc.categoria} • {doc.created_at ? new Date(doc.created_at).toLocaleDateString('pt-BR') : 'sem data'}</div></div><div className="flex items-center gap-2"><a href={doc.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline">Abrir</a><button onClick={() => excluirDocumento(doc)} className="text-destructive"><Trash2 className="h-4 w-4" /></button></div></div>)}{!documentosLoading && documentos.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhum documento anexado.</div>}</div>
        </section>

        <section className="card-premium p-5 space-y-4">
          <div><div className="text-xs font-bold uppercase tracking-wider text-primary">5. Finalização</div><h3 className="mt-1 text-base font-bold">Contabilidade e cadastro oficial</h3><p className="text-xs text-muted-foreground">Revise a seleção dos documentos antes de concluir.</p></div>
          <div className="flex flex-wrap gap-2"><Button onClick={enviarContabilidade} disabled={selectedDocs.length === 0} variant="outline"><ArrowRight className="mr-2 h-4 w-4" />E-mail contabilidade ({selectedDocs.length})</Button><Button onClick={aprovarOficial}><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar cadastro oficial</Button></div>
        </section>
      </main>
    </div>
    <EmailPdfModal open={!!emailPdfDraft} draft={emailPdfDraft} onOpenChange={open => { if (!open) setEmailPdfDraft(null); }} />
  </div>;
};

const Field = ({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><Input value={value || ''} onChange={e => onChange(e.target.value)} /></div>;
const DateField = ({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} /></div>;
const BooleanField = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><select value={value ? 'sim' : 'nao'} onChange={e => onChange(e.target.value === 'sim')} className="w-full border rounded-lg px-3 py-2 bg-background"><option value="nao">Não</option><option value="sim">Sim</option></select></div>;
const Summary = ({ label, value, attention, danger }: { label: string; value: number; attention?: boolean; danger?: boolean }) => <div className={`rounded-lg border p-3 ${danger ? 'border-destructive bg-destructive/10' : attention ? 'border-warning bg-warning/10' : ''}`}><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>;

export default PreCadastroAdmissionalOcrPage;
