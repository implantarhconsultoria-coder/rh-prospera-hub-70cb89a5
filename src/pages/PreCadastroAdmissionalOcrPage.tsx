import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CheckCircle2, FileSearch, Loader2, Mail, RefreshCw, Save, Upload } from 'lucide-react';
import { CC_OBRIGATORIO } from '@/lib/emailUtils';
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

type OcrField = { valor?: string | number | null; confianca?: number; observacao?: string };
type OcrResult = { ok?: boolean; confianca_geral?: number; texto_bruto?: string; campos?: Record<string, OcrField>; pendencias?: string[]; log?: string[]; error?: string };
type GeneratedAsoGuide = { blob: Blob; fileName: string; url: string };
type PreCadastroDocumento = {
  id?: string;
  pre_cadastro_id?: string;
  tipo_documento?: string | null;
  nome_arquivo?: string | null;
  arquivo_url?: string | null;
  created_at?: string | null;
};

const statusLabel: Record<string, string> = {
  aguardando_validacao: 'Aguardando validacao',
  aguardando_aso: 'Aguardando ASO',
  documentacao_completa: 'Documentacao completa',
  pronto_para_registro: 'Pronto para registro',
  cadastro_oficial: 'Cadastro oficial',
};

const initialForm: Partial<PreCadastro> = {
  status: 'aguardando_validacao',
  nome: '',
  cpf: '',
  rg: '',
  funcao: '',
  setor_ghe: '',
  obra_local: '',
  tipo_admissao: 'Admissional',
  jornada: '',
  beneficios: '',
  insalubridade: '',
  filiacao: '',
  endereco: '',
  escolaridade: '',
  experiencia: '',
  epi: '',
  responsavel_contato: '',
  email: '',
  celular: '',
  vale_refeicao: false,
  vale_transporte: false,
  exige_toxicologico: false,
  arquivo_toxicologico_url: '',
};

const ADMISSION_BUCKETS = ['documentos-admissionais', 'documentos-funcionarios', 'atestados', 'documentos-ativos'];
const LOW_CONFIDENCE = 0.75;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const CONTABILIDADE_DESTINATARIOS = ['marisa@aatconsultoria.com.br', 'dp@aatconsultoria.com.br', 'lucilene@aatconsultoria.com.br'];

const onlyDigits = (v?: string | null) => String(v || '').replace(/\D/g, '');
const normalizeRole = (value?: string | null) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const isGuincheiro = (value?: string | null) => normalizeRole(value) === 'GUINCHEIRO';
const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatMoneyEmail = (value?: number | null) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatDateEmail = (value?: string | null) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
};
const yesNo = (value?: boolean | null) => value ? 'Sim' : 'Não';
const insalubridadeYesNo = (value?: string | null) => {
  const normalized = normalizeRole(value);
  if (!normalized || /^(NAO|NÃO|SEM|0)$/.test(normalized)) return 'Não';
  return 'Sim';
};
const normalizeDate = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!br) return '';
  const y = br[3].length === 2 ? `20${br[3]}` : br[3];
  return `${y}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
};
const normalizeMoney = (value: unknown) => {
  if (typeof value === 'number') return value;
  const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo'));
  reader.readAsDataURL(file);
});

const OCR_FIELD_LABELS: Record<string, string> = {
  nome: 'Nome completo', cpf: 'CPF', rg: 'RG', data_nascimento: 'Data nascimento', endereco: 'Endereco', telefone: 'Telefone', celular: 'Celular', email: 'E-mail', funcao: 'Funcao/cargo', empresa: 'Empresa', salario: 'Salario', data_admissao: 'Data admissao', vt_endereco: 'VT/endereco residencial', documentos_anexados: 'Documentos anexados', filiacao: 'Filiacao', escolaridade: 'Escolaridade', experiencia: 'Experiencia', epi: 'EPI', beneficios: 'Beneficios', insalubridade: 'Insalubridade', setor_ghe: 'Setor/GHE', obra_local: 'Obra/local', jornada: 'Jornada', responsavel_contato: 'Responsavel/contato',
};
const FIELD_TO_FORM: Record<string, keyof PreCadastro> = {
  nome: 'nome', cpf: 'cpf', rg: 'rg', data_nascimento: 'data_nascimento', endereco: 'endereco', funcao: 'funcao', empresa: 'empresa_nome', salario: 'salario', data_admissao: 'data_admissao', filiacao: 'filiacao', escolaridade: 'escolaridade', experiencia: 'experiencia', epi: 'epi', beneficios: 'beneficios', insalubridade: 'insalubridade', setor_ghe: 'setor_ghe', obra_local: 'obra_local', jornada: 'jornada', responsavel_contato: 'responsavel_contato', email: 'email', celular: 'celular', telefone: 'celular',
};

type RoleOption = {
  cargo: string;
  salarioBase: number;
  insalubridadeAtiva: boolean;
  insalubridadeValor: number;
  periculosidadeAtiva: boolean;
  periculosidadeValor: number;
};

const FIXED_ROLE_PRESETS: RoleOption[] = [
  { cargo: 'AJUDANTE DE MECANICO', salarioBase: 2100, insalubridadeAtiva: true, insalubridadeValor: 648.40, periculosidadeAtiva: false, periculosidadeValor: 0 },
  { cargo: 'VENDEDOR', salarioBase: 0, insalubridadeAtiva: false, insalubridadeValor: 0, periculosidadeAtiva: false, periculosidadeValor: 0 },
  { cargo: 'REPRESENTANTE', salarioBase: 0, insalubridadeAtiva: false, insalubridadeValor: 0, periculosidadeAtiva: false, periculosidadeValor: 0 },
];

const formatInsalubridade = (value: number) => `Sim - ${formatBRL(value)}`;
const formatPericulosidade = (value: number) => `Periculosidade - ${formatBRL(value)}`;

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
  const errors: string[] = [];
  for (const bucket of ADMISSION_BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    errors.push(`${bucket}: ${error.message}`);
    if (!/bucket not found|not found|does not exist/i.test(error.message)) break;
  }
  throw new Error(errors.join(' | '));
};

const categoriaPreCadastro = (tipo?: string | null) => {
  const normalizado = normalizeRole(tipo);
  if (normalizado.includes('TOXICOLOG')) return 'TOXICOLOGICO';
  if (normalizado.includes('ASO') || normalizado.includes('EXAME')) return 'ASO';
  if (normalizado.includes('CONTRATO')) return 'CONTRATO';
  return 'DOCUMENTACAO ADMISSIONAL';
};

const getTipoExameSolicitado = (r: Partial<PreCadastro>) => String(r.tipo_admissao || 'Admissional').trim() || 'Admissional';
const buildExameEmailBody = (r: Partial<PreCadastro>) => {
  const tipoExame = getTipoExameSolicitado(r).toLowerCase();
  return [
    'Prezados, bom dia.', '',
    `Solicito, por gentileza, o agendamento do exame ${tipoExame} conforme guia ASO anexa.`, '',
    `Nome: ${r.nome || ''}`,
    `CPF: ${r.cpf || ''}`,
    `RG: ${r.rg || ''}`,
    `Data de nascimento: ${formatDateEmail(r.data_nascimento)}`,
    `Empresa: ${r.empresa_nome || ''}`,
    `CNPJ: ${r.cnpj || ''}`,
    `Funcao: ${r.funcao || ''}`,
    `Setor/GHE: ${r.setor_ghe || ''}`,
    `Obra/Local: ${r.obra_local || ''}`,
    `Data de admissao/inicio: ${formatDateEmail(r.data_admissao)}`,
    r.exige_toxicologico ? 'Exame toxicológico: obrigatório' : '',
    '', `Escopo: exame ${tipoExame} ocupacional para liberacao do colaborador no processo de pre-cadastro TOPAC.`,
    '', 'Por favor, confirmar recebimento, data e horario disponivel para atendimento.',
    '', 'Atenciosamente,', 'Rodrigo De Souza Sabino',
  ].filter(Boolean).join('\n');
};

const buildContabilidadeEmailBody = (r: Partial<PreCadastro>) => [
  'Prezados,',
  '',
  `Segue documentação admissional do colaborador ${r.nome || ''}, CPF ${r.cpf || ''}, para admissão pela empresa ${r.empresa_nome || ''}, função ${r.funcao || ''}.`,
  r.data_admissao ? `Data de admissão/início: ${formatDateEmail(r.data_admissao)}.` : '',
  '',
  `e-mail: ${r.email || ''}`,
  `cel: ${r.celular || ''}`,
  `Salário: ${formatMoneyEmail(r.salario)}`,
  `Insalubridade: ${insalubridadeYesNo(r.insalubridade)}`,
  `Vr: ${yesNo(r.vale_refeicao)}`,
  `Vt: ${yesNo(r.vale_transporte)}`,
  '',
  'Documentos anexados conforme pré-cadastro.',
  '',
  'Atenciosamente,',
].join('\n');

const mimeFromFileName = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/pdf';
};
const fileNameFromUrl = (url: string, fallback: string) => {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split('/').pop() || '').trim() || fallback;
  } catch {
    return fallback;
  }
};
const buildMigrationBenefits = (emp: any) => [
  emp.vrAtivo ? `VR ${formatBRL(Number(emp.vrDiario) || 0)}/dia` : '',
  emp.vaAtivo ? `VA ${formatBRL(Number(emp.vaMensal) || 0)}/mes` : '',
  emp.vtAtivo ? `VT ${formatBRL(Number(emp.vtDiario) || 0)}/dia` : '',
].filter(Boolean).join(' | ');

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

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('pre_cadastros_admissionais').select('*').order('created_at', { ascending: false });
    setLoading(false);
    if (error) { toast.error(`Erro ao carregar pre-cadastros: ${error.message}`); return; }
    setRows(data || []);
  };

  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    const onRefresh = () => carregar();
    window.addEventListener('topac:refresh-current', onRefresh);
    return () => window.removeEventListener('topac:refresh-current', onRefresh);
  }, []);
  useEffect(() => {
    const selected = rows.find(r => r.id === selectedId);
    if (selected) {
      setForm(selected);
      setOcrResult((selected.dados_extraidos as OcrResult) || null);
    }
  }, [rows, selectedId]);
  useEffect(() => () => { if (lastAsoGuide?.url) URL.revokeObjectURL(lastAsoGuide.url); }, [lastAsoGuide?.url]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => !q || `${r.nome} ${r.cpf} ${r.empresa_nome} ${r.status} ${r.funcao}`.toLowerCase().includes(q));
  }, [rows, search]);
  const duplicateCpf = useMemo(() => {
    const cpf = onlyDigits(form.cpf);
    return !!cpf && rows.some(r => r.id !== form.id && onlyDigits(r.cpf) === cpf);
  }, [rows, form.cpf, form.id]);
  const migrationEmployees = useMemo(() => employees.filter(emp => emp.status !== 'excluido' && emp.categoria !== 'socio').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [employees]);
  const migrationEmployee = useMemo(() => employees.find(emp => emp.id === migrationEmployeeId), [employees, migrationEmployeeId]);
  const migrationOriginCompany = migrationEmployee ? companies.find(c => c.id === migrationEmployee.companyId) : null;
  const migrationDestinationCompanies = useMemo(() => companies.filter(c => c.id !== migrationEmployee?.companyId), [companies, migrationEmployee?.companyId]);
  const roleOptions = useMemo<RoleOption[]>(() => {
    const byRole = new Map<string, RoleOption>();
    FIXED_ROLE_PRESETS.forEach(role => byRole.set(normalizeRole(role.cargo), { ...role }));
    employees.filter(emp => emp.categoria !== 'socio' && normalizeRole(emp.cargo)).forEach(emp => {
      const key = normalizeRole(emp.cargo);
      const existing = byRole.get(key);
      const salarioBase = Number(emp.salarioBase) || 0;
      const insalubridadeValor = Number(emp.insalubridadeValor || config.valorInsalubridade || 0);
      const insalubridadeAtiva = employeeHasInsalubridade(emp);
      const periculosidadeAtiva = isMotoboyRole(emp.cargo);
      const periculosidadeValor = getPericulosidadeAplicavel(emp);
      if (!existing) {
        byRole.set(key, { cargo: emp.cargo, salarioBase, insalubridadeAtiva, insalubridadeValor, periculosidadeAtiva, periculosidadeValor });
        return;
      }
      if (salarioBase && !FIXED_ROLE_PRESETS.some(role => normalizeRole(role.cargo) === key)) existing.salarioBase = salarioBase;
      if (insalubridadeAtiva) { existing.insalubridadeAtiva = true; existing.insalubridadeValor = insalubridadeValor || existing.insalubridadeValor; }
      if (periculosidadeAtiva) { existing.periculosidadeAtiva = true; existing.periculosidadeValor = periculosidadeValor || existing.periculosidadeValor; }
    });
    return Array.from(byRole.values()).sort((a, b) => a.cargo.localeCompare(b.cargo, 'pt-BR'));
  }, [employees, config.valorInsalubridade]);
  const roleByName = useMemo(() => new Map(roleOptions.map(role => [normalizeRole(role.cargo), role])), [roleOptions]);

  const setCompany = (id: string) => {
    const company = companies.find(x => x.id === id);
    setForm(prev => ({ ...prev, empresa_id: id, empresa_nome: company?.name || '', cnpj: company?.cnpj || '' }));
  };
  const setFuncaoComPadroes = (funcao: string) => {
    setForm(prev => ({ ...prev, funcao, exige_toxicologico: isGuincheiro(funcao) ? true : prev.exige_toxicologico }));
  };
  const novo = () => {
    setSelectedId('');
    setForm(initialForm);
    setOcrResult(null);
    setLastFichaFile(null);
    setLastAsoGuide(null);
  };

  const prepararMigracaoFuncionario = () => {
    const emp = migrationEmployee;
    const destino = companies.find(c => c.id === migrationCompanyId);
    const origem = emp ? companies.find(c => c.id === emp.companyId) : null;
    if (!emp || !destino) { toast.error('Selecione o funcionario de origem e a empresa destino.'); return; }
    const insalubridadeAtiva = employeeHasInsalubridade(emp);
    const periculosidadeAtiva = isMotoboyRole(emp.cargo);
    const periculosidadeValor = getPericulosidadeAplicavel(emp);
    const now = new Date().toISOString();
    if (lastAsoGuide?.url) URL.revokeObjectURL(lastAsoGuide.url);
    setSelectedId('');
    setSearch('');
    setOcrResult(null);
    setLastFichaFile(null);
    setLastAsoGuide(null);
    setForm({
      status: 'aguardando_validacao',
      empresa_id: destino.id,
      empresa_nome: destino.name || '',
      cnpj: destino.cnpj || '',
      nome: emp.name || '',
      cpf: emp.cpf || '',
      rg: emp.rg || '',
      data_nascimento: emp.dataNascimento || '',
      data_admissao: emp.dataAdmissao || '',
      funcao: emp.cargo || '',
      setor_ghe: emp.setorGhe || '',
      obra_local: destino.city || '',
      salario: Number(emp.salarioBase) || null,
      tipo_admissao: 'Transferencia entre empresas',
      jornada: '',
      beneficios: buildMigrationBenefits(emp),
      insalubridade: insalubridadeAtiva ? formatInsalubridade(Number(emp.insalubridadeValor || config.valorInsalubridade || 0)) : periculosidadeAtiva ? formatPericulosidade(periculosidadeValor) : 'Nao',
      filiacao: '',
      endereco: emp.endereco || '',
      escolaridade: '',
      experiencia: emp.observacoes || '',
      epi: '',
      responsavel_contato: '',
      email: emp.email || '',
      celular: emp.celular || emp.telefone || '',
      vale_refeicao: !!emp.vrAtivo,
      vale_transporte: !!emp.vtAtivo,
      exige_toxicologico: isGuincheiro(emp.cargo),
      arquivo_ficha_url: '',
      arquivo_aso_url: '',
      arquivo_toxicologico_url: '',
      dados_extraidos: { origem_migracao_funcionario: { funcionario_id: emp.id, funcionario_nome: emp.name, empresa_origem_id: emp.companyId, empresa_origem_nome: origem?.name || '', empresa_destino_id: destino.id, empresa_destino_nome: destino.name || '', preparado_em: now } },
      conferencia: { migracao_empresa: { status: 'pre_ficha_pre_preenchida', empresa_origem: origem?.name || '', empresa_destino: destino.name || '', funcionario_origem_id: emp.id, preparado_em: now } },
      historico: [{ em: now, acao: 'pre_ficha_migracao_empresa_pre_preenchida', funcionario_origem_id: emp.id, empresa_origem_nome: origem?.name || '', empresa_destino_nome: destino.name || '' }],
    });
    toast.success(`Pre-ficha preenchida para migrar ${emp.name} para ${destino.name}. Confira e salve.`);
  };

  const salvar = async () => {
    setSaving(true);
    const payload = { ...form, criado_por: session?.user?.id || null };
    const request = form.id
      ? (supabase as any).from('pre_cadastros_admissionais').update(payload).eq('id', form.id).select('*').single()
      : (supabase as any).from('pre_cadastros_admissionais').insert(payload).select('*').single();
    const { data, error } = await request;
    setSaving(false);
    if (error) { toast.error(`Erro ao salvar: ${error.message}`); return; }
    toast.success('Pre-cadastro salvo no banco');
    setSelectedId(data.id);
    await carregar();
  };

  const mergeOcrIntoForm = (result: OcrResult, arquivoUrl: string) => {
    const campos = result.campos || {};
    setForm(prev => {
      const next: Partial<PreCadastro> = {
        ...prev,
        arquivo_ficha_url: arquivoUrl,
        status: prev.status || 'aguardando_validacao',
        dados_extraidos: result as Record<string, unknown>,
        conferencia: { ...(prev.conferencia || {}), ocr_ficha: { campos, pendencias: result.pendencias || [], confianca_geral: result.confianca_geral || 0, processado_em: new Date().toISOString() } },
        historico: [...((Array.isArray(prev.historico) ? prev.historico : []) as unknown[]), { em: new Date().toISOString(), acao: 'ocr_ficha_processado', confianca_geral: result.confianca_geral || 0, pendencias: result.pendencias || [] }],
      };
      Object.entries(FIELD_TO_FORM).forEach(([ocrKey, formKey]) => {
        const raw = campos[ocrKey]?.valor;
        const value = typeof raw === 'number' ? raw : String(raw || '').trim();
        if (value === '' || value === null) return;
        if (formKey === 'data_nascimento' || formKey === 'data_admissao') {
          const date = normalizeDate(value);
          if (date) (next as any)[formKey] = date;
          return;
        }
        if (formKey === 'salario') {
          const money = normalizeMoney(value);
          if (money !== null) (next as any)[formKey] = money;
          return;
        }
        (next as any)[formKey] = value;
      });
      if (isGuincheiro(next.funcao)) next.exige_toxicologico = true;
      return next;
    });
  };

  const runFichaOcr = async (file: File, arquivoUrl: string) => {
    setOcrLoading(true);
    setOcrResult(null);
    try {
      let text = '';
      let images: string[] = [];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        text = await extractPdfText(bytes).catch(() => '');
        images = (await renderPdfPagesToDataUrls(bytes, 1.7, 3)).pageUrls;
      } else {
        images = [await fileToDataUrl(file)];
      }
      const { data, error } = await supabase.functions.invoke('ocr-pre-cadastro', { body: { fileName: file.name, mimeType: file.type || 'application/octet-stream', text, images } });
      if (error) throw error;
      const result: OcrResult = data?.data || data || {};
      setOcrResult(result);
      mergeOcrIntoForm(result, arquivoUrl);
      const lowCount = Object.values(result.campos || {}).filter(field => Number(field?.confianca || 0) < LOW_CONFIDENCE).length;
      if (lowCount > 0) toast.warning(`Ficha lida com ${lowCount} campo(s) para revisar antes de aprovar.`);
      else toast.success('Ficha lida por OCR. Confira e salve a conferencia.');
    } catch (error: any) {
      const fallback: OcrResult = { ok: false, error: error?.message || 'OCR indisponivel', pendencias: ['Leitura automatica falhou. Preenchimento manual assistido liberado.'], log: ['Arquivo anexado e mantido em standby para conferencia manual.'] };
      setOcrResult(fallback);
      setForm(prev => ({ ...prev, arquivo_ficha_url: arquivoUrl, status: prev.status || 'aguardando_validacao', dados_extraidos: fallback as Record<string, unknown>, historico: [...((Array.isArray(prev.historico) ? prev.historico : []) as unknown[]), { em: new Date().toISOString(), acao: 'ocr_ficha_falhou', erro: fallback.error }] }));
      toast.warning('Ficha anexada, mas o OCR falhou. Complete os campos manualmente e salve.');
    } finally {
      setOcrLoading(false);
    }
  };

  const uploadFicha = async (file?: File | null) => {
    if (!file) return;
    try {
      setLastFichaFile(file);
      const url = await uploadAdmissionFile(file, 'fichas');
      setForm(prev => ({ ...prev, arquivo_ficha_url: url, status: prev.status || 'aguardando_validacao' }));
      toast.success('Ficha anexada. Iniciando leitura OCR.');
      await runFichaOcr(file, url);
    } catch (error: any) {
      toast.error(`Erro no upload da ficha: ${error.message}`);
    }
  };

  const uploadDocumento = async (tipo_documento: string, file?: File | null) => {
    if (!file || !form.id) { toast.error('Salve o pre-cadastro antes de anexar documentos'); return; }
    try {
      const url = await uploadAdmissionFile(file, `documentos/${form.id}`);
      const { error } = await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento, nome_arquivo: file.name, arquivo_url: url });
      if (error) throw error;
      toast.success('Documento anexado');
    } catch (error: any) {
      toast.error(`Erro ao anexar documento: ${error.message}`);
    }
  };

  const uploadToxicologico = async (file?: File | null) => {
    if (!file || !form.id) { toast.error('Salve o pre-cadastro antes de anexar o toxicológico'); return; }
    try {
      const url = await uploadAdmissionFile(file, `toxicologico/${form.id}`);
      const { error: docError } = await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'toxicologico', nome_arquivo: file.name, arquivo_url: url });
      if (docError) throw docError;
      const { error: rowError } = await (supabase as any).from('pre_cadastros_admissionais').update({ arquivo_toxicologico_url: url, exige_toxicologico: true }).eq('id', form.id);
      if (rowError) throw rowError;
      setForm(prev => ({ ...prev, arquivo_toxicologico_url: url, exige_toxicologico: true }));
      toast.success('Exame toxicológico anexado ao pré-cadastro.');
      await carregar();
    } catch (error: any) {
      toast.error(`Erro ao salvar toxicológico: ${error.message}`);
    }
  };

  const buildGuiaAsoPdf = () => {
    if (!form.nome || !form.empresa_nome || !form.cpf || !form.funcao) {
      toast.error('Informe empresa, nome, CPF e funcao antes de gerar a guia ASO.');
      return null;
    }
    return gerarAutorizacaoExameAdmissionalPdf({
      empresa: form.empresa_nome || '',
      cnpj: form.cnpj || '',
      nome: form.nome || '',
      cpf: form.cpf || '',
      rg: form.rg || '',
      funcao: form.funcao || '',
      dataAdmissao: form.data_admissao || '',
      dataNascimento: form.data_nascimento || '',
      setorGhe: form.setor_ghe || '',
      dataExame: new Date().toISOString().slice(0, 10),
      tipoExame: form.tipo_admissao || 'Admissional',
      obraLocal: form.obra_local || '',
      trabalhoAltura: false,
      espacoConfinado: false,
      toxicologico: !!form.exige_toxicologico,
      responsavelContato: form.responsavel_contato || 'ROBSON CHAFI SERVILIO - CEL 11 94292-0385',
    });
  };

  const arquivarGuiaAso = async (pdf: { blob: Blob; fileName: string }) => {
    if (!form.id) return '';
    const url = await uploadAdmissionBlob(pdf.blob, `guia-aso/${form.id}`, pdf.fileName);
    await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'guia_aso_audiolife', nome_arquivo: pdf.fileName, arquivo_url: url });
    return url;
  };

  const gerarGuiaAso = async () => {
    const pdf = buildGuiaAsoPdf();
    if (!pdf) return null;
    const url = URL.createObjectURL(pdf.blob);
    setLastAsoGuide(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return { ...pdf, url }; });
    window.open(url, '_blank', 'noopener,noreferrer');
    if (form.id) {
      try { await arquivarGuiaAso(pdf); toast.success('Guia ASO gerada, aberta e arquivada no pre-cadastro.'); }
      catch (error: any) { toast.warning(`Guia aberta, mas nao foi arquivada: ${error.message || 'erro desconhecido'}`); }
    } else {
      toast.success('Guia ASO gerada e aberta. Salve o pre-cadastro para arquivar.');
    }
    return pdf;
  };

  const enviarGuiaAso = async () => {
    const existingGuide = lastAsoGuide;
    const pdf = existingGuide || buildGuiaAsoPdf();
    if (!pdf) return;
    if (!existingGuide) {
      const url = URL.createObjectURL(pdf.blob);
      setLastAsoGuide(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return { ...pdf, url }; });
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    const tipoExameSolicitado = getTipoExameSolicitado(form).toLowerCase();
    setEmailPdfDraft({
      to: ['agendamento@ponteaereaseguranca.com.br'],
      cc: Array.from(CC_OBRIGATORIO),
      subject: `Solicitacao de exame ${tipoExameSolicitado} - ${form.nome || ''} - ${form.empresa_nome || ''}`,
      body: buildExameEmailBody(form),
      attachmentBlob: pdf.blob,
      attachmentName: pdf.fileName,
      afterSend: async () => {
        if (form.id && !existingGuide) await arquivarGuiaAso(pdf);
        if (form.id) {
          await (supabase as any).rpc('admin_pre_cadastro_marcar_exame_enviado', { p_id: form.id });
          await carregar();
        }
      },
    });
  };

  const uploadASO = async (file?: File | null) => {
    if (!file || !form.id) { toast.error('Salve o pre-cadastro antes de anexar ASO'); return; }
    try {
      const url = await uploadAdmissionFile(file, `aso/${form.id}`);
      await (supabase as any).from('pre_cadastro_documentos').insert({ pre_cadastro_id: form.id, tipo_documento: 'aso', nome_arquivo: file.name, arquivo_url: url });
      const { error } = await (supabase as any).rpc('admin_pre_cadastro_marcar_aso_recebido', { p_id: form.id, p_arquivo_url: url });
      if (error) throw error;
      toast.success('ASO recebido. Documentacao completa para registro.');
      await carregar();
    } catch (error: any) {
      toast.error(`Erro ao salvar ASO: ${error.message}`);
    }
  };

  const carregarDocumentosContabilidade = async () => {
    const documentos: PreCadastroDocumento[] = [];
    const urlsAdicionadas = new Set<string>();
    const adicionarDocumento = (documento: PreCadastroDocumento) => {
      const url = documento.arquivo_url || '';
      if (!url || urlsAdicionadas.has(url)) return;
      urlsAdicionadas.add(url);
      documentos.push(documento);
    };
    if (form.id) {
      const { data, error } = await (supabase as any).from('pre_cadastro_documentos').select('id, pre_cadastro_id, tipo_documento, nome_arquivo, arquivo_url, created_at').eq('pre_cadastro_id', form.id).order('created_at', { ascending: true });
      if (error) throw error;
      (data || []).forEach(adicionarDocumento);
    }
    adicionarDocumento({ tipo_documento: 'ficha_solicitacao_emprego', nome_arquivo: `Ficha de solicitacao de emprego - ${form.nome || 'pre-cadastro'}.pdf`, arquivo_url: form.arquivo_ficha_url || '' });
    adicionarDocumento({ tipo_documento: 'aso', nome_arquivo: `ASO - ${form.nome || 'pre-cadastro'}.pdf`, arquivo_url: form.arquivo_aso_url || '' });
    adicionarDocumento({ tipo_documento: 'toxicologico', nome_arquivo: `Toxicológico - ${form.nome || 'pre-cadastro'}.pdf`, arquivo_url: form.arquivo_toxicologico_url || '' });
    return Promise.all(documentos.map(async documento => {
      const url = documento.arquivo_url || '';
      const fallbackName = `${categoriaPreCadastro(documento.tipo_documento)} - ${form.nome || 'pre-cadastro'}.pdf`;
      const attachmentName = documento.nome_arquivo || fileNameFromUrl(url, fallbackName);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Nao foi possivel baixar o anexo ${attachmentName}`);
      const attachmentBlob = await response.blob();
      return {
        attachmentBlob,
        attachmentName,
        attachmentContentType: attachmentBlob.type || mimeFromFileName(attachmentName),
        documentId: documento.id,
        documentName: attachmentName,
        label: categoriaPreCadastro(documento.tipo_documento),
      };
    }));
  };

  const enviarContabilidade = async () => {
    try {
      const attachments = await carregarDocumentosContabilidade();
      if (!attachments.length) { toast.error('Não há documentos anexados neste pré-cadastro.'); return; }
      setEmailPdfDraft({
        to: CONTABILIDADE_DESTINATARIOS,
        cc: Array.from(CC_OBRIGATORIO),
        subject: `Documentação admissional - ${form.nome || ''} - ${form.empresa_nome || ''}`,
        body: buildContabilidadeEmailBody(form),
        attachments,
        moduleOrigin: 'pre-cadastro admissional',
        documentName: `Documentação admissional - ${form.nome || ''}`,
        afterSend: async () => {
          if (!form.id) return;
          const { error } = await (supabase as any).rpc('admin_pre_cadastro_preparar_contabilidade', { p_id: form.id });
          if (error) throw error;
          await carregar();
        },
      });
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao preparar e-mail para contabilidade.');
    }
  };

  const migrarDocumentosPreCadastro = async (funcionarioId: string) => {
    if (!form.id || !funcionarioId || !form.empresa_id) return 0;
    const empresa = companies.find(c => c.id === form.empresa_id);
    const { data: docs, error } = await (supabase as any).from('pre_cadastro_documentos').select('*').eq('pre_cadastro_id', form.id);
    if (error) throw error;
    let migrados = 0;
    for (const doc of docs || []) {
      if (!doc.arquivo_url) continue;
      const { data: existente } = await (supabase as any).from('documentos_funcionario').select('id').eq('funcionario_id', funcionarioId).eq('arquivo_url', doc.arquivo_url).maybeSingle();
      if (existente?.id) continue;
      await registrarDocumento({
        funcionarioId,
        funcionarioNome: form.nome || 'Funcionario',
        companyId: form.empresa_id,
        empresaNome: empresa?.name || form.empresa_nome || '',
        tipoDocumento: categoriaPreCadastro(doc.tipo_documento),
        categoria: categoriaPreCadastro(doc.tipo_documento),
        origem: 'pre_cadastro',
        descricao: `Documento migrado do pre-cadastro: ${doc.nome_arquivo || doc.tipo_documento || 'arquivo'}`,
        observacao: `Origem: pre-cadastro admissional (${doc.tipo_documento || 'documento'})`,
        arquivoUrl: doc.arquivo_url,
        nomeArquivo: doc.nome_arquivo || '',
        dataDocumento: doc.created_at || new Date().toISOString(),
        geradoPorUserId: session?.user?.id || ZERO_UUID,
        geradoPorNome: session?.user?.email || 'Sistema',
        unidade: empresa?.name || form.empresa_nome || '',
      });
      migrados += 1;
    }
    return migrados;
  };

  const aprovarOficial = async () => {
    if (!form.id) return;
    if (!form.empresa_id || !form.nome) { toast.error('Empresa e nome sao obrigatorios'); return; }
    const { data: funcionarioId, error } = await (supabase as any).rpc('admin_pre_cadastro_aprovar_oficial', { p_id: form.id });
    if (error) { toast.error(`Erro ao aprovar: ${error.message}`); return; }
    try {
      const migrados = await migrarDocumentosPreCadastro(String(funcionarioId || ''));
      toast.success(`Cadastro oficial criado/atualizado em Funcionarios. Documentos migrados: ${migrados}.`);
    } catch (error: any) {
      toast.warning(`Cadastro oficial aprovado, mas os anexos nao foram migrados automaticamente: ${error.message || 'erro desconhecido'}`);
    }
    await Promise.all([carregar(), refreshData()]);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center"><FileSearch className="w-7 h-7" /></div>
          <div><h1 className="text-2xl font-bold font-display">Pre-cadastro Admissional</h1><p className="text-primary-foreground/70 text-sm">Ficha, exame, documentos, ASO, toxicológico e aprovacao antes da base oficial.</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
        <div className="card-premium p-4 space-y-3">
          <div className="flex gap-2"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome, CPF, empresa, status..." /><Button variant="outline" onClick={carregar} disabled={loading}><RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} /></Button></div>
          <Button onClick={novo} className="w-full gradient-accent text-accent-foreground">Novo pre-cadastro</Button>
          <div className="border-t pt-3 space-y-2">
            <div><div className="text-sm font-semibold">Migrar funcionario</div><p className="text-xs text-muted-foreground">Puxa dados do cadastro atual para uma pre-ficha em outra empresa.</p></div>
            <select value={migrationEmployeeId} onChange={e => { setMigrationEmployeeId(e.target.value); setMigrationCompanyId(''); }} className="w-full border rounded-lg px-3 py-2 text-sm bg-background"><option value="">Funcionario origem</option>{migrationEmployees.map(emp => { const empresa = companies.find(c => c.id === emp.companyId); return <option key={emp.id} value={emp.id}>{emp.name} - {empresa?.name || 'Empresa atual'}</option>; })}</select>
            <select value={migrationCompanyId} onChange={e => setMigrationCompanyId(e.target.value)} disabled={!migrationEmployee} className="w-full border rounded-lg px-3 py-2 text-sm bg-background disabled:opacity-60"><option value="">Empresa destino</option>{migrationDestinationCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            {migrationEmployee && <div className="text-[11px] text-muted-foreground">Origem: {migrationOriginCompany?.name || 'Empresa atual'} - CPF {migrationEmployee.cpf || 'pendente'}</div>}
            <Button type="button" variant="outline" onClick={prepararMigracaoFuncionario} className="w-full"><ArrowRight className="w-4 h-4 mr-2" />Puxar para pre-ficha</Button>
          </div>
          <div className="space-y-2 max-h-[62vh] overflow-y-auto">
            {filtered.map(row => <button key={row.id} onClick={() => setSelectedId(row.id)} className={`w-full text-left rounded-xl border p-3 hover:bg-muted/40 ${selectedId === row.id ? 'border-primary bg-primary/5' : 'border-border'}`}><div className="font-semibold text-sm">{row.nome || 'Sem nome informado'}</div><div className="text-xs text-muted-foreground">{row.empresa_nome || 'Empresa pendente'} - {row.cpf || 'CPF pendente'}</div><Badge variant="outline" className="mt-2 text-[10px]">{statusLabel[row.status] || row.status}</Badge></button>)}
            {filtered.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">Nenhum pre-cadastro encontrado.</div>}
          </div>
        </div>
        <div className="card-premium p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Conferencia admissional</h2><p className="text-xs text-muted-foreground">Nada entra em Funcionarios antes da aprovacao final.</p></div><Badge className="bg-warning/20 text-warning">{statusLabel[String(form.status)] || form.status || 'Aguardando validacao'}</Badge></div>
          <div className="rounded-xl border border-dashed border-primary/40 p-4">
            <label className="text-sm font-semibold flex items-center gap-2 mb-2"><Upload className="w-4 h-4" /> Ficha de Solicitacao de Emprego</label>
            <input type="file" accept=".pdf,image/*" onChange={e => uploadFicha(e.target.files?.[0])} className="text-sm" />
            {form.arquivo_ficha_url && <a href={form.arquivo_ficha_url} target="_blank" className="block mt-2 text-xs text-primary underline">Abrir ficha anexada</a>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{ocrLoading && <span className="inline-flex items-center gap-2 text-primary"><Loader2 className="w-3 h-3 animate-spin" /> Lendo PDF/imagem com OCR...</span>}{!ocrLoading && ocrResult?.confianca_geral !== undefined && <Badge variant="outline">OCR {(Number(ocrResult.confianca_geral || 0) * 100).toFixed(0)}%</Badge>}{lastFichaFile && !ocrLoading && <Button type="button" size="sm" variant="outline" onClick={() => form.arquivo_ficha_url && runFichaOcr(lastFichaFile, form.arquivo_ficha_url)}><RefreshCw className="w-3 h-3 mr-1" /> Reler ficha</Button>}</div>
          </div>
          {ocrResult && <div className={`rounded-xl border p-4 space-y-3 ${ocrResult.ok === false ? 'border-warning bg-warning/10' : 'border-primary/30 bg-primary/5'}`}><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-sm flex items-center gap-2">{ocrResult.ok === false && <AlertTriangle className="w-4 h-4 text-warning" />}Conferencia OCR da ficha</div><p className="text-xs text-muted-foreground">Campos com baixa confianca ficam marcados para revisao manual antes da aprovacao oficial.</p></div>{ocrResult.ok !== false && <Badge className="bg-primary/15 text-primary">Standby</Badge>}</div>{ocrResult.error && <div className="text-sm text-warning">{ocrResult.error}</div>}{Object.keys(ocrResult.campos || {}).length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">{Object.entries(ocrResult.campos || {}).map(([key, field]) => { const confidence = Number(field?.confianca || 0); const low = confidence < LOW_CONFIDENCE; return <div key={key} className={`rounded-lg border p-2 ${low ? 'border-warning/50 bg-warning/10' : 'border-border bg-background/60'}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">{OCR_FIELD_LABELS[key] || key}</span><Badge variant="outline" className={low ? 'text-warning border-warning/50' : ''}>{Math.round(confidence * 100)}%</Badge></div><div className="mt-1 text-sm font-medium break-words">{String(field?.valor || '-')}</div>{low && <div className="mt-1 text-[11px] text-warning">Revisar antes de salvar.</div>}</div>; })}</div>}{(ocrResult.pendencias || []).length > 0 && <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">{(ocrResult.pendencias || []).map((p, idx) => <div key={`${p}-${idx}`}>- {p}</div>)}</div>}</div>}
          {duplicateCpf && <div className="rounded-lg border border-warning bg-warning/10 p-3 text-sm text-warning">CPF ja existe em outro pre-cadastro. Confira antes de aprovar.</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Empresa contratante</label><select value={form.empresa_id || ''} onChange={e => setCompany(e.target.value)} className="w-full border rounded-lg px-3 py-2 bg-background"><option value="">Selecionar empresa</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <Field label="Nome" value={form.nome} onChange={value => setForm(prev => ({ ...prev, nome: value }))} />
            <Field label="CPF" value={form.cpf} onChange={value => setForm(prev => ({ ...prev, cpf: value }))} />
            <Field label="RG" value={form.rg} onChange={value => setForm(prev => ({ ...prev, rg: value }))} />
            <DateField label="Data nascimento" value={form.data_nascimento} onChange={value => setForm(prev => ({ ...prev, data_nascimento: value }))} />
            <DateField label="Data admissao/inicio" value={form.data_admissao} onChange={value => setForm(prev => ({ ...prev, data_admissao: value }))} />
            <div><label className="text-xs text-muted-foreground">Funcao</label><select value={form.funcao || ''} onChange={e => setFuncaoComPadroes(e.target.value)} className="w-full border rounded-lg px-3 py-2 bg-background"><option value="">Selecionar funcao</option>{form.funcao && !roleByName.has(normalizeRole(form.funcao)) && <option value={form.funcao}>{form.funcao}</option>}{roleOptions.map(role => <option key={normalizeRole(role.cargo)} value={role.cargo}>{role.cargo}{role.salarioBase > 0 ? ` - ${formatBRL(role.salarioBase)}` : ''}{role.insalubridadeAtiva ? ' - insalubridade' : role.periculosidadeAtiva ? ' - periculosidade' : ''}</option>)}</select></div>
            <Field label="Setor/GHE" value={form.setor_ghe} onChange={value => setForm(prev => ({ ...prev, setor_ghe: value }))} />
            <Field label="Obra/Local" value={form.obra_local} onChange={value => setForm(prev => ({ ...prev, obra_local: value }))} />
            <div><label className="text-xs text-muted-foreground">Salario</label><Input type="number" value={form.salario || ''} onChange={e => setForm(prev => ({ ...prev, salario: Number(e.target.value) || null }))} /></div>
            <Field label="E-mail" value={form.email} onChange={value => setForm(prev => ({ ...prev, email: value }))} />
            <Field label="Celular" value={form.celular} onChange={value => setForm(prev => ({ ...prev, celular: value }))} />
            <BooleanField label="VR" value={!!form.vale_refeicao} onChange={value => setForm(prev => ({ ...prev, vale_refeicao: value }))} />
            <BooleanField label="VT" value={!!form.vale_transporte} onChange={value => setForm(prev => ({ ...prev, vale_transporte: value }))} />
            <Field label="Tipo admissao" value={form.tipo_admissao} onChange={value => setForm(prev => ({ ...prev, tipo_admissao: value }))} />
            <Field label="Jornada" value={form.jornada} onChange={value => setForm(prev => ({ ...prev, jornada: value }))} />
            <Field label="Filiacao" value={form.filiacao} onChange={value => setForm(prev => ({ ...prev, filiacao: value }))} />
            <Field label="Escolaridade" value={form.escolaridade} onChange={value => setForm(prev => ({ ...prev, escolaridade: value }))} />
            <Field label="Responsavel/Contato" value={form.responsavel_contato} onChange={value => setForm(prev => ({ ...prev, responsavel_contato: value }))} />
            <div className="md:col-span-3"><Field label="Endereco" value={form.endereco} onChange={value => setForm(prev => ({ ...prev, endereco: value }))} /></div>
            <div className="md:col-span-3"><Field label="Experiencia" value={form.experiencia} onChange={value => setForm(prev => ({ ...prev, experiencia: value }))} /></div>
            <Field label="EPI" value={form.epi} onChange={value => setForm(prev => ({ ...prev, epi: value }))} />
            <Field label="Beneficios" value={form.beneficios} onChange={value => setForm(prev => ({ ...prev, beneficios: value }))} />
            <Field label="Insalubridade" value={form.insalubridade} onChange={value => setForm(prev => ({ ...prev, insalubridade: value }))} />
          </div>
          {isGuincheiro(form.funcao) && <label className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"><input type="checkbox" checked={!!form.exige_toxicologico} onChange={e => setForm(prev => ({ ...prev, exige_toxicologico: e.target.checked }))} /><span><strong>Exame toxicológico obrigatório</strong><span className="block text-xs text-muted-foreground">Será marcado na guia ASO e incluído nos documentos da admissão.</span></span></label>}
          {form.arquivo_toxicologico_url && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><a href={form.arquivo_toxicologico_url} target="_blank" rel="noreferrer" className="text-primary underline">Abrir exame toxicológico anexado</a></div>}
          {lastAsoGuide && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex flex-wrap items-center gap-3"><span className="font-medium">Guia ASO pronta:</span><a href={lastAsoGuide.url} target="_blank" rel="noreferrer" className="text-primary underline">{lastAsoGuide.fileName}</a><Button size="sm" variant="outline" onClick={enviarGuiaAso}><Mail className="w-4 h-4 mr-2" />Enviar guia por e-mail</Button></div>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar conferencia'}</Button>
            <Button onClick={gerarGuiaAso} variant="outline"><FileSearch className="w-4 h-4 mr-2" />Gerar Guia ASO</Button>
            <Button onClick={enviarGuiaAso} variant="outline"><Mail className="w-4 h-4 mr-2" />Enviar guia ASO</Button>
            <label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer hover:bg-muted">Anexar documentos<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadDocumento('documentacao_admissional', e.target.files?.[0])} /></label>
            <label className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm cursor-pointer hover:bg-muted">Subir ASO<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadASO(e.target.files?.[0])} /></label>
            {isGuincheiro(form.funcao) && <label className="inline-flex items-center gap-2 rounded-md border border-warning/50 px-4 py-2 text-sm cursor-pointer hover:bg-warning/10">Subir Toxicológico<input type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadToxicologico(e.target.files?.[0])} /></label>}
            <Button onClick={enviarContabilidade} variant="outline"><ArrowRight className="w-4 h-4 mr-2" />E-mail contabilidade</Button>
            <Button onClick={aprovarOficial} className="gradient-accent text-accent-foreground"><CheckCircle2 className="w-4 h-4 mr-2" />Aprovar cadastro oficial</Button>
          </div>
        </div>
      </div>
      <EmailPdfModal open={!!emailPdfDraft} draft={emailPdfDraft} onOpenChange={open => { if (!open) setEmailPdfDraft(null); }} />
    </div>
  );
};

const Field = ({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><Input value={value || ''} onChange={e => onChange(e.target.value)} /></div>;
const DateField = ({ label, value, onChange }: { label: string; value?: string | null; onChange: (value: string) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} /></div>;
const BooleanField = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => <div><label className="text-xs text-muted-foreground">{label}</label><select value={value ? 'sim' : 'nao'} onChange={e => onChange(e.target.value === 'sim')} className="w-full border rounded-lg px-3 py-2 bg-background"><option value="sim">Sim</option><option value="nao">Não</option></select></div>;

export default PreCadastroAdmissionalOcrPage;
