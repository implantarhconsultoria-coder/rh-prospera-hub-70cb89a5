import fs from 'node:fs';

const patchFile = (file, transform, label) => {
  if (!fs.existsSync(file)) throw new Error(`[assisted-whatsapp] arquivo ausente: ${file}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
  console.log(`[assisted-whatsapp] ${label}${after === before ? ' (já aplicado)' : ''}`);
};

const replaceRequired = (source, from, to, label) => {
  if (!source.includes(from)) throw new Error(`[assisted-whatsapp] anchor não encontrado: ${label}`);
  return source.replace(from, to);
};

patchFile('src/components/payroll/PendingPayrollSignatures.tsx', (source) => {
  let text = source;

  if (!text.includes("from '@/lib/assistedWhatsApp'")) {
    text = replaceRequired(
      text,
      "import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';",
      "import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';\nimport { toast } from 'sonner';\nimport { INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE, normalizeAssistedWhatsAppPhone, openAssistedWhatsApp } from '@/lib/assistedWhatsApp';",
      'import helper na assinatura',
    );
  }

  text = text.replace(/\nconst normalizeWhatsappPhone = \(value: unknown\) => \{[\s\S]*?\n\};\n/, '\n');
  text = text.replace(
    "const PendingPayrollSignatures: React.FC<PendingPayrollSignaturesProps> = ({ companyId, autoOpen = false }) => {",
    "const PendingPayrollSignatures: React.FC<PendingPayrollSignaturesProps> = ({ companyId, competencia, autoOpen = false }) => {",
  );
  text = text.replace('whatsappPhone: normalizeWhatsappPhone(phoneRaw),', 'whatsappPhone: normalizeAssistedWhatsAppPhone(phoneRaw),');

  if (!text.includes(".eq('company_id', companyId)\n        .eq('competencia', competencia)")) {
    text = replaceRequired(
      text,
      ".eq('company_id', companyId)\n        .order('competencia', { ascending: false })",
      ".eq('company_id', companyId)\n        .eq('competencia', competencia)\n        .order('competencia', { ascending: false })",
      'filtro empresa + competência',
    );
  }
  text = text.replace('  }, [companyId]);', '  }, [companyId, competencia]);');

  if (!text.includes("const [bulkOpenedForId, setBulkOpenedForId]")) {
    text = replaceRequired(
      text,
      "  const [bulkIndex, setBulkIndex] = useState(0);",
      "  const [bulkIndex, setBulkIndex] = useState(0);\n  const [bulkOpenedForId, setBulkOpenedForId] = useState('');",
      'estado de retorno do WhatsApp',
    );
  }

  if (!text.includes('ASSISTED_WHATSAPP_UNIFIED_V1')) {
    const start = text.indexOf('  const sendWhatsApp = useCallback(');
    const end = text.indexOf('  useEffect(() => {\n    if (!autoOpen', start);
    if (start < 0 || end < 0) throw new Error('[assisted-whatsapp] bloco de envio em massa não encontrado');

    const block = `  // ASSISTED_WHATSAPP_UNIFIED_V1\n  const recordWhatsAppEvent = useCallback(async (employee: PendingEmployee, eventType: 'WHATSAPP_ABERTO' | 'WHATSAPP_CONTATO_PULADO' | 'WHATSAPP_FLUXO_AVANCADO') => {\n    try {\n      const { data: sessionData } = await supabase.auth.getSession();\n      const token = sessionData.session?.access_token;\n      if (!token) return;\n      await fetch('/api/payroll-admin', {\n        method: 'POST',\n        headers: { 'content-type': 'application/json', authorization: \`Bearer \${token}\` },\n        body: JSON.stringify({\n          action: 'assisted-whatsapp-event',\n          company_id: companyId,\n          employee_id: employee.employee_id,\n          event_type: eventType,\n          competencia,\n          document_ids: employee.documents.map(doc => doc.document_id),\n          context: 'assinatura_digital',\n        }),\n      });\n    } catch (error) {\n      console.warn('[assisted-whatsapp-event]', error);\n    }\n  }, [companyId, competencia]);\n\n  const buildSignatureMessage = useCallback((employee: PendingEmployee) => {\n    const comp = competenceLabel(competencia || employee.documents[0]?.competencia || '');\n    return [\n      \`Olá, \${employee.name}.\`,\n      '',\n      \`Identificamos documento(s) pendente(s) de assinatura referente(s) ao fechamento de \${comp}.\`,\n      '',\n      'Acesse o link abaixo para visualizar e realizar sua assinatura:',\n      '',\n      portalUrl,\n      '',\n      'TOPAC RH PRO',\n    ].join('\\n');\n  }, [competencia, portalUrl]);\n\n  const sendWhatsApp = useCallback((employee: PendingEmployee) => {\n    const result = openAssistedWhatsApp(employee.phoneRaw, buildSignatureMessage(employee));\n    if (!result.ok) {\n      toast.error(result.reason === 'invalid_phone'\n        ? INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE\n        : 'Não foi possível abrir o WhatsApp neste navegador. Tente novamente.');\n      return false;\n    }\n    void recordWhatsAppEvent(employee, 'WHATSAPP_ABERTO');\n    return true;\n  }, [buildSignatureMessage, recordWhatsAppEvent]);\n\n  const withoutPhone = pending.filter(item => !item.whatsappPhone).length;\n  const totalDocuments = useMemo(() => pending.reduce((sum, item) => sum + item.documents.length, 0), [pending]);\n  const bulkDone = pending.length > 0 && bulkIndex >= pending.length;\n  const currentBulk = bulkIndex < pending.length ? pending[bulkIndex] : null;\n\n  const startBulk = useCallback(() => {\n    setBulkIndex(0);\n    setBulkOpenedForId('');\n    setBulkOpen(true);\n  }, []);\n\n  const sendCurrentBulk = useCallback(() => {\n    if (!currentBulk) return;\n    if (sendWhatsApp(currentBulk)) setBulkOpenedForId(currentBulk.employee_id);\n  }, [currentBulk, sendWhatsApp]);\n\n  const advanceBulk = useCallback((eventType: 'WHATSAPP_CONTATO_PULADO' | 'WHATSAPP_FLUXO_AVANCADO') => {\n    if (!currentBulk) return;\n    void recordWhatsAppEvent(currentBulk, eventType);\n    setBulkOpenedForId('');\n    setBulkIndex(index => Math.min(index + 1, pending.length));\n  }, [currentBulk, pending.length, recordWhatsAppEvent]);\n\n`;
    text = text.slice(0, start) + block + text.slice(end);
  }

  text = text.replace(
    '`${pending.length} funcionário(s) com ${totalDocuments} documento(s) realmente liberado(s) e ainda não assinado(s). O mês selecionado não interfere nesta cobrança.`',
    '`${pending.length} funcionário(s) com ${totalDocuments} documento(s) realmente liberado(s) e ainda não assinado(s) na competência ${competenceLabel(competencia)}.`',
  );
  text = text.replaceAll('disabled={loading || validPending.length === 0}', 'disabled={loading || pending.length === 0}');
  text = text.replaceAll('disabled={validPending.length === 0}', 'disabled={pending.length === 0}');
  text = text.replaceAll('Enviar em massa ({validPending.length})', 'Enviar em massa ({pending.length})');
  text = text.replaceAll('validPending.length', 'pending.length');
  text = text.replace(
    'Nenhum pendente possui telefone válido para WhatsApp.',
    'Nenhum documento pendente foi localizado para esta empresa e competência.',
  );
  text = text.replace(
    '<Button size="sm" onClick={() => sendWhatsApp(employee)} disabled={!employee.whatsappPhone} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500" title={employee.whatsappPhone ? `Enviar lembrete para ${employee.name}` : \'Funcionário sem telefone válido cadastrado\'}>\n                  <MessageCircle className="mr-2 h-4 w-4" />{employee.whatsappPhone ? \'Enviar WhatsApp\' : \'Sem telefone\'}\n                </Button>',
    '<Button size="sm" onClick={() => void sendWhatsApp(employee)} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500" title={employee.whatsappPhone ? `Abrir WhatsApp para ${employee.name}` : INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE}>\n                  <MessageCircle className="mr-2 h-4 w-4" />{employee.whatsappPhone ? \'Enviar WhatsApp\' : \'Telefone inválido\'}\n                </Button>',
  );

  const oldBulkButtons = '<Button className="w-full bg-emerald-600 text-white hover:bg-emerald-500" onClick={sendCurrentBulk}><Send className="mr-2 h-4 w-4" />Abrir WhatsApp e avançar</Button>\n              <Button variant="outline" className="w-full" onClick={() => setBulkIndex(index => Math.min(index + 1, pending.length))}>Pular este contato</Button>';
  const newBulkButtons = `{!currentBulk.whatsappPhone && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE}</p>}\n              {bulkOpenedForId === currentBulk.employee_id ? (\n                <>\n                  <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => advanceBulk('WHATSAPP_FLUXO_AVANCADO')}><Send className="mr-2 h-4 w-4" />Próximo contato</Button>\n                  <Button variant="outline" className="w-full" onClick={sendCurrentBulk}><MessageCircle className="mr-2 h-4 w-4" />Abrir WhatsApp novamente</Button>\n                </>\n              ) : (\n                <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-500" onClick={sendCurrentBulk}><Send className="mr-2 h-4 w-4" />Abrir WhatsApp</Button>\n              )}\n              <Button variant="outline" className="w-full" onClick={() => advanceBulk('WHATSAPP_CONTATO_PULADO')}>Pular este contato</Button>`;
  if (text.includes(oldBulkButtons)) text = text.replace(oldBulkButtons, newBulkButtons);

  return text;
}, 'assinatura digital reutiliza WhatsApp assistido por empresa + competência');

patchFile('api/payroll-admin.ts', (source) => {
  if (source.includes("action === 'assisted-whatsapp-event'")) return source;
  const anchor = "    if (['release-send','resend-link','manual-reminder','discard-unmatched-receipts'].includes(action)) {";
  const insertion = `    if (action === 'assisted-whatsapp-event') {\n      const companyId = String(body.company_id || '').trim();\n      const employeeId = String(body.employee_id || '').trim();\n      const eventType = String(body.event_type || '').trim();\n      const allowedEvents = new Set(['WHATSAPP_ABERTO', 'WHATSAPP_CONTATO_PULADO', 'WHATSAPP_FLUXO_AVANCADO']);\n      if (!companyId || !employeeId || !allowedEvents.has(eventType)) return sendJson(res, { ok: false, error: 'invalid_assisted_whatsapp_event' }, 400);\n      await assertAdminArchiveAccess(service, companyId, isAdmin);\n      await addEvent(service, {\n        company_id: companyId,\n        employee_id: employeeId,\n        event_type: eventType,\n        actor_type: 'ADMIN',\n        actor_user_id: user.id,\n        payload: {\n          competencia: String(body.competencia || ''),\n          document_ids: Array.isArray(body.document_ids) ? body.document_ids.map(String) : [],\n          context: String(body.context || 'assinatura_digital'),\n          assisted: true,\n          provider_confirmation: false,\n        },\n      });\n      return sendJson(res, { ok: true, recorded: eventType });\n    }\n\n`;
  return replaceRequired(source, anchor, insertion + anchor, 'histórico assistido da assinatura');
}, 'histórico real de abertura/pulo/avanço do WhatsApp na assinatura');

patchFile('src/pages/PreCadastroAdmissionalOcrPage.tsx', (source) => {
  let text = source;

  if (!text.includes("from '@/lib/assistedWhatsApp'")) {
    text = replaceRequired(
      text,
      "import { registrarDocumento } from '@/lib/documentoHistorico';",
      "import { registrarDocumento } from '@/lib/documentoHistorico';\nimport { INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE, openAssistedWhatsApp } from '@/lib/assistedWhatsApp';",
      'import helper no pré-cadastro',
    );
  }

  if (!text.includes('  public_token?: string | null;')) {
    text = replaceRequired(text, 'type PreCadastro = {\n  id: string;', 'type PreCadastro = {\n  id: string;\n  public_token?: string | null;', 'token público no tipo');
  }

  if (!text.includes('const enviarDocumentosAoCandidato = async')) {
    const anchor = '  const enviarAsoCandidato = async () => {';
    const insertion = `  const registrarEventoWhatsAppPreCadastro = async (tipo: string, descricao: string, dados: Record<string, unknown>) => {\n    if (!form.id) return;\n    try {\n      const { error } = await (supabase as any).from('pre_cadastro_eventos').insert({\n        pre_cadastro_id: form.id,\n        tipo,\n        descricao,\n        dados: { ...dados, assisted: true, provider_confirmation: false },\n        created_by: session?.user?.id || null,\n      });\n      if (error) console.warn('[pre-cadastro-whatsapp-event]', error);\n    } catch (error) {\n      console.warn('[pre-cadastro-whatsapp-event]', error);\n    }\n  };\n\n  const enviarDocumentosAoCandidato = async () => {\n    if (!form.id) return toast.error('Selecione e salve o pré-cadastro primeiro.');\n    const token = String(form.public_token || '').trim();\n    if (!token) return toast.error('Não foi possível localizar o link individual deste pré-cadastro.');\n    const link = \`${typeof window !== 'undefined' ? window.location.origin : 'https://topacrh.pro'}/pre-cadastro?token=\${encodeURIComponent(token)}\`;\n    const nome = String(form.nome || 'Candidato').trim();\n    const mensagem = [\n      \`Olá, \${nome}.\`,\n      '',\n      'Segue o link para preenchimento e envio dos seus documentos admissionais:',\n      '',\n      link,\n      '',\n      'TOPAC RH PRO',\n    ].join('\\n');\n    const result = openAssistedWhatsApp(form.celular, mensagem);\n    if (!result.ok) {\n      return toast.error(result.reason === 'invalid_phone' ? INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE : 'Não foi possível abrir o WhatsApp neste navegador. Tente novamente.');\n    }\n    void registrarEventoWhatsAppPreCadastro('whatsapp_aberto_documentos_candidato', 'WhatsApp aberto com link individual do pré-cadastro preparado para envio manual.', { link, telefone: result.phone });\n    toast.info('WhatsApp aberto com a mensagem e o link do candidato prontos para envio.');\n  };\n\n`;
    text = replaceRequired(text, anchor, insertion + anchor, 'envio dos documentos ao candidato');
  }

  if (!text.includes('ASSISTED_WHATSAPP_ASO_V1')) {
    const start = text.indexOf('  const enviarAsoCandidato = async () => {');
    const endMarker = "    void 'data-topac-aso-pdf-share';\n  };";
    const endAt = text.indexOf(endMarker, start);
    if (start < 0 || endAt < 0) throw new Error('[assisted-whatsapp] função enviarAsoCandidato não encontrada');
    const end = endAt + endMarker.length;
    const replacement = `  // ASSISTED_WHATSAPP_ASO_V1\n  const enviarAsoCandidato = async () => {\n    if (!form.id) return toast.error('Selecione e salve o pré-cadastro primeiro.');\n    if (!asoAgendamentoConfirmado || !asoConfirmacao.data_exame) return toast.error('Confirme e salve a data do agendamento antes de enviar ao funcionário.');\n\n    const dataConfirmada = String(asoConfirmacao.data_exame || '').trim();\n    const enderecoConfirmado = String(asoConfirmacao.local || '').trim();\n    if (!dataConfirmada) return toast.error('A data confirmada do exame não está persistida. Confirme o agendamento antes de enviar.');\n    if (!enderecoConfirmado) return toast.error('O endereço do agendamento não está disponível na ficha confirmada.');\n\n    const { data: guia, error } = await (supabase as any).from('pre_cadastro_documentos')\n      .select('arquivo_url,nome_arquivo,created_at').eq('pre_cadastro_id', form.id).eq('tipo_documento', 'guia_aso')\n      .order('created_at', { ascending: false }).limit(1).maybeSingle();\n    if (error) return toast.error(\`Não foi possível localizar a guia ASO: \${error.message}\`);\n    if (!guia?.arquivo_url) return toast.error('Gere a Guia ASO antes de enviar ao funcionário.');\n\n    const nome = String(form.nome || 'Funcionário').trim();\n    const mensagem = [\n      \`\${saudacaoCapitalizada()}, \${nome}.\`,\n      '',\n      'Segue a ficha de agendamento do seu exame admissional.',\n      '',\n      \`Data: \${formatDateEmail(dataConfirmada)}\`,\n      'Horário: 07h30',\n      \`Local: \${enderecoConfirmado}\`,\n      '',\n      'O atendimento é realizado por ordem de chegada.',\n      '',\n      'Recomendamos chegar com antecedência devido à demanda de pessoas, para agilizar seu atendimento.',\n      '',\n      \`Guia do exame: \${guia.arquivo_url}\`,\n      '',\n      'TOPAC RH PRO',\n    ].join('\\n');\n\n    const result = openAssistedWhatsApp(form.celular, mensagem);\n    if (!result.ok) {\n      return toast.error(result.reason === 'invalid_phone' ? INVALID_ASSISTED_WHATSAPP_PHONE_MESSAGE : 'Não foi possível abrir o WhatsApp neste navegador. Tente novamente.');\n    }\n    void registrarEventoWhatsAppPreCadastro('whatsapp_aberto_agendamento_aso', 'WhatsApp aberto com o agendamento ASO preparado para envio manual.', {\n      telefone: result.phone,\n      data_exame: dataConfirmada,\n      horario: '07h30',\n      local: enderecoConfirmado,\n      guia_url: guia.arquivo_url,\n    });\n    toast.info('WhatsApp aberto com o agendamento pronto para envio.');\n  };`;
    text = text.slice(0, start) + replacement + text.slice(end);
  }

  const fichaButtonAnchor = '<Printer className="mr-2 h-4 w-4" />Abrir / imprimir ficha preenchida</Button>';
  if (!text.includes('Enviar documentos ao candidato</Button>')) {
    text = replaceRequired(
      text,
      fichaButtonAnchor,
      `${fichaButtonAnchor}<Button type="button" onClick={() => void enviarDocumentosAoCandidato()} variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Enviar documentos ao candidato</Button>`,
      'botão WhatsApp do pré-cadastro',
    );
  }

  text = text.replace(
    '<Button type="button" onClick={() => void enviarAsoCandidato()} variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Enviar agendamento ao funcionário</Button>',
    '<Button type="button" onClick={() => void enviarAsoCandidato()} variant="outline" disabled={!asoAgendamentoConfirmado || !asoConfirmacao.data_exame}><MessageCircle className="mr-2 h-4 w-4" />Enviar agendamento ao funcionário</Button>',
  );
  text = text.replace(
    'Após receber a confirmação da clínica, clique em <strong>Confirmar agendamento</strong>. Se faltar data ou confirmação, o sistema exibirá o motivo em vez de deixar o botão sem resposta.',
    'Informe a data do exame e clique em <strong>Confirmar agendamento</strong>. O envio ao funcionário só é liberado depois que a data e o endereço estiverem persistidos.',
  );

  return text;
}, 'pré-cadastro e ASO ligados ao mesmo WhatsApp assistido');
