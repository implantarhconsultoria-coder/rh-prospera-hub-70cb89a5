import fs from 'node:fs';

const file = 'src/pages/PreCadastroAdmissionalOcrPage.tsx';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('REENVIAR BOAS-VINDAS') && source.includes('<AdmissionWelcomeDialog')) {
  console.log('[admission-welcome] fluxo já aplicado');
  process.exit(0);
}

const replaceRequired = (before, after, label) => {
  if (!source.includes(before)) throw new Error(`[admission-welcome] ponto não localizado: ${label}`);
  source = source.replace(before, after);
};

replaceRequired(
  "import { INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE, openAssistedWhatsApp } from '@/lib/assistedWhatsApp';",
  "import { INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE, normalizeAssistedWhatsAppPhone, openAssistedWhatsApp } from '@/lib/assistedWhatsApp';\nimport AdmissionWelcomeDialog from '@/components/AdmissionWelcomeDialog';\nimport { admissionWelcomeEventData, buildAdmissionWelcome, isAdmissionWelcomeEligible, type AdmissionWelcomeSummary } from '@/lib/admissionWelcome';",
  'imports',
);

replaceRequired(
  '  created_at: string;\n};',
  '  aprovado_em?: string | null;\n  aprovado_por?: string | null;\n  funcionario_id?: string | null;\n  created_at: string;\n};',
  'campos de aprovação do pré-cadastro',
);

replaceRequired(
  "  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);",
  "  const [emailPdfDraft, setEmailPdfDraft] = useState<EmailPdfDraft | null>(null);\n  const [welcomeOpen, setWelcomeOpen] = useState(false);\n  const [welcomeSummary, setWelcomeSummary] = useState<AdmissionWelcomeSummary | null>(null);\n  const [welcomeError, setWelcomeError] = useState<string | null>(null);\n  const [welcomePhone, setWelcomePhone] = useState('');",
  'estado do modal',
);

const approvalStart = source.indexOf('  const aprovarOficial = async () => {');
const approvalEnd = approvalStart >= 0 ? source.indexOf('\n\n  // pre-cadastro-workflow-v2', approvalStart) : -1;
if (approvalStart < 0 || approvalEnd < 0) throw new Error('[admission-welcome] função de aprovação oficial não localizada');

const approvalBlock = `  const registrarBoasVindasEvento = async (tipo: 'boas_vindas_preparada' | 'boas_vindas_whatsapp_aberto' | 'boas_vindas_copiada', summary: AdmissionWelcomeSummary) => {
    const userId = session?.user?.id || null;
    const { error } = await (supabase as any).from('pre_cadastro_eventos').insert({
      pre_cadastro_id: summary.preCadastroId,
      tipo,
      descricao: tipo === 'boas_vindas_preparada' ? 'Mensagem de boas-vindas preparada pelo RH.' : tipo === 'boas_vindas_whatsapp_aberto' ? 'WhatsApp assistido aberto com a mensagem de boas-vindas.' : 'Mensagem de boas-vindas copiada pelo RH.',
      dados: admissionWelcomeEventData(summary, userId),
      created_by: userId,
    });
    if (error) console.error('[admission-welcome] falha ao registrar histórico', error);
  };

  const prepararBoasVindas = async (preCadastroId: string) => {
    if (!preCadastroId) return;
    const { data: pre, error: preError } = await (supabase as any).from('pre_cadastros_admissionais')
      .select('id,nome,empresa_id,empresa_nome,celular,jornada,data_admissao,aprovado_em,funcionario_id')
      .eq('id', preCadastroId).maybeSingle();
    if (preError || !pre) { toast.error(preError?.message || 'Pré-cadastro não encontrado.'); return; }
    if (!isAdmissionWelcomeEligible(pre.aprovado_em, pre.funcionario_id)) { toast.error('As boas-vindas só ficam disponíveis após a aprovação oficial e vínculo ao funcionário.'); return; }

    const { data: employee, error: employeeError } = await (supabase as any).from('funcionarios')
      .select('id,nome,empresa_id,company_id,celular,telefone,data_admissao,vr_ativo,vr_diario,vt_ativo,vt_diario')
      .eq('id', pre.funcionario_id).maybeSingle();
    if (employeeError || !employee) { toast.error(employeeError?.message || 'Funcionário oficial não encontrado.'); return; }

    const companyName = companies.find(c => c.id === (employee.empresa_id || employee.company_id || pre.empresa_id))?.name || pre.empresa_nome || 'TOPAC';
    const result = buildAdmissionWelcome({
      preCadastroId: pre.id,
      candidateName: employee.nome || pre.nome || '',
      companyName,
      dataAdmissao: employee.data_admissao || pre.data_admissao || '',
      jornada: pre.jornada,
      vrAtivo: Boolean(employee.vr_ativo),
      vrDiario: Number(employee.vr_diario || 0),
      vtAtivo: Boolean(employee.vt_ativo),
      vtDiario: Number(employee.vt_diario || 0),
    });

    setWelcomeOpen(true);
    if (!result.ok) {
      setWelcomeSummary(null);
      setWelcomePhone('');
      setWelcomeError(result.error);
      toast.error(result.error);
      return;
    }

    const phoneCandidates = [employee.celular, employee.telefone, pre.celular].filter(Boolean);
    const validPhone = phoneCandidates.find((value: unknown) => normalizeAssistedWhatsAppPhone(value)) || phoneCandidates[0] || '';
    setWelcomeSummary(result.summary);
    setWelcomeError(null);
    setWelcomePhone(String(validPhone || ''));
    await registrarBoasVindasEvento('boas_vindas_preparada', result.summary);
  };

  const enviarBoasVindasWhatsApp = async () => {
    if (!welcomeSummary) return;
    const result = openAssistedWhatsApp(welcomePhone, welcomeSummary.message);
    if (!result.ok) {
      toast.error(result.reason === 'invalid_phone' ? INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE : 'Não foi possível abrir o WhatsApp.');
      return;
    }
    await registrarBoasVindasEvento('boas_vindas_whatsapp_aberto', welcomeSummary);
    toast.success('WhatsApp aberto com a mensagem de boas-vindas preparada.');
  };

  const copiarBoasVindas = async () => {
    if (!welcomeSummary) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(welcomeSummary.message);
      else {
        const area = document.createElement('textarea');
        area.value = welcomeSummary.message;
        area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select();
        const copied = document.execCommand('copy');
        area.remove();
        if (!copied) throw new Error('copy_failed');
      }
      await registrarBoasVindasEvento('boas_vindas_copiada', welcomeSummary);
      toast.success('Mensagem de boas-vindas copiada.');
    } catch { toast.error('Não foi possível copiar a mensagem.'); }
  };

  const aprovarOficial = async () => {
    if (!form.id || !form.empresa_id || !form.nome) return;
    const { data: funcionarioId, error } = await (supabase as any).rpc('admin_pre_cadastro_aprovar_oficial', { p_id: form.id });
    if (error) return toast.error(error.message);
    await migrarDocumentosPreCadastro(String(funcionarioId || ''));
    await prepararBoasVindas(form.id);
    await Promise.all([carregar(), refreshData()]);
  };`;

source = source.slice(0, approvalStart) + approvalBlock + source.slice(approvalEnd);

replaceRequired(
  '<div className="flex flex-wrap gap-2"><Button onClick={enviarContabilidade} disabled={selectedDocs.length === 0} variant="outline"><ArrowRight className="mr-2 h-4 w-4" />E-mail contabilidade ({selectedDocs.length})</Button><Button onClick={aprovarOficial}><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar cadastro oficial</Button></div>',
  '<div className="flex flex-wrap gap-2"><Button onClick={enviarContabilidade} disabled={selectedDocs.length === 0} variant="outline"><ArrowRight className="mr-2 h-4 w-4" />E-mail contabilidade ({selectedDocs.length})</Button>{isAdmissionWelcomeEligible(form.aprovado_em, form.funcionario_id) ? <Button type="button" variant="outline" onClick={() => form.id && void prepararBoasVindas(form.id)}><MessageCircle className="mr-2 h-4 w-4" />REENVIAR BOAS-VINDAS</Button> : <Button onClick={aprovarOficial}><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar cadastro oficial</Button>}</div>',
  'ação de aprovação/reenviar',
);

replaceRequired(
  '    <EmailPdfModal open={!!emailPdfDraft} draft={emailPdfDraft} onOpenChange={open => { if (!open) setEmailPdfDraft(null); }} />',
  '    <AdmissionWelcomeDialog open={welcomeOpen} onOpenChange={setWelcomeOpen} summary={welcomeSummary} error={welcomeError} onWhatsApp={() => void enviarBoasVindasWhatsApp()} onCopy={() => void copiarBoasVindas()} />\n    <EmailPdfModal open={!!emailPdfDraft} draft={emailPdfDraft} onOpenChange={open => { if (!open) setEmailPdfDraft(null); }} />',
  'modal de boas-vindas',
);

fs.writeFileSync(file, source);
console.log('[admission-welcome] boas-vindas + benefícios proporcionais + reenvio aplicados');
