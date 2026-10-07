import fs from 'node:fs';

const file = 'src/pages/PreCadastroAdmissionalOcrPage.tsx';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('const asoConfirmacao = (((form.conferencia as any)?.aso_agendamento')) {
  console.log('[ASO appointment patch] Already applied.');
  process.exit(0);
}

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) {
    throw new Error(`[ASO appointment patch] Anchor not found: ${label}`);
  }
  source = source.replace(from, to);
};

replaceOnce(
  "useEffect(() => { const selected = rows.find(r => r.id === selectedId); if (selected) { setForm(selected); setAsoExamDate(''); setOcrResult((selected.dados_extraidos as OcrResult) || null); carregarDocumentos(selected); } }, [rows, selectedId]);",
  "useEffect(() => { const selected = rows.find(r => r.id === selectedId); if (selected) { setForm(selected); setAsoExamDate(String((selected.conferencia as any)?.aso_agendamento?.data_exame || '')); setOcrResult((selected.dados_extraidos as OcrResult) || null); carregarDocumentos(selected); } }, [rows, selectedId]);",
  'restore confirmed ASO date',
);

const clinicInfoAnchor = "  const asoClinicInfo = getAsoClinicCommunicationInfo(dadosAsoAtuais());\n";
const clinicInfoReplacement = [
  "  const asoClinicInfo = getAsoClinicCommunicationInfo(dadosAsoAtuais());",
  "  const asoConfirmacao = (((form.conferencia as any)?.aso_agendamento || {}) as Record<string, any>);",
  "  const asoAgendamentoConfirmado = Boolean(",
  "    asoConfirmacao.confirmado &&",
  "    asoConfirmacao.data_exame &&",
  "    asoConfirmacao.data_exame === asoExamDate",
  "  );",
  "",
  "  const confirmarAgendamentoAso = async () => {",
  "    if (!form.id) return toast.error('Selecione e salve o pré-cadastro primeiro.');",
  "    if (!asoExamDate) return toast.error('Informe a data confirmada do exame.');",
  "    if (!asoClinicInfo.local) return toast.error('O endereço da clínica não está disponível na ficha.');",
  "",
  "    const conferenciaAtual = ((form.conferencia || {}) as Record<string, any>);",
  "    const conferenciaAtualizada = {",
  "      ...conferenciaAtual,",
  "      aso_agendamento: {",
  "        ...(conferenciaAtual.aso_agendamento || {}),",
  "        confirmado: true,",
  "        confirmado_em: new Date().toISOString(),",
  "        data_exame: asoExamDate,",
  "        local: asoClinicInfo.local,",
  "        horarios: asoClinicInfo.horarios,",
  "      },",
  "    };",
  "",
  "    const { error } = await (supabase as any)",
  "      .from('pre_cadastros_admissionais')",
  "      .update({ conferencia: conferenciaAtualizada })",
  "      .eq('id', form.id);",
  "",
  "    if (error) return toast.error(`Erro ao confirmar agendamento: ${error.message}`);",
  "    setForm(prev => ({ ...prev, conferencia: conferenciaAtualizada }));",
  "    toast.success('Agendamento confirmado. Envio ao funcionário liberado.');",
  "    await carregar();",
  "  };",
  "",
].join('\n');
replaceOnce(clinicInfoAnchor, clinicInfoReplacement, 'ASO confirmation state and action');

replaceOnce(
  "  const enviarAsoCandidato = async () => {\n    if (!form.id) return toast.error('Selecione e salve o pré-cadastro primeiro.');\n    const telefone = onlyDigits(form.celular);",
  "  const enviarAsoCandidato = async () => {\n    if (!form.id) return toast.error('Selecione e salve o pré-cadastro primeiro.');\n    if (!asoAgendamentoConfirmado) return toast.error('Confirme o agendamento da clínica antes de enviar ao funcionário.');\n    const telefone = onlyDigits(form.celular);",
  'block WhatsApp before confirmation',
);

const oldMessageSetup = "    const primeiroNome = String(form.nome || '').trim().split(/\\s+/)[0];\n    const horario = asoClinicInfo.horarios.join(' ');\n    const mensagem = [";
const newMessageSetup = [
  "    const primeiroNome = String(form.nome || '').trim().split(/\\s+/)[0];",
  "    const dataConfirmada = String(asoConfirmacao.data_exame || asoExamDate || '');",
  "    const enderecoConfirmado = String(asoConfirmacao.local || asoClinicInfo.local || '').trim();",
  "    const horariosConfirmados = Array.isArray(asoConfirmacao.horarios) && asoConfirmacao.horarios.length",
  "      ? asoConfirmacao.horarios",
  "      : asoClinicInfo.horarios;",
  "    const horario = horariosConfirmados",
  "      .filter((linha: string) => !normalizeRole(linha).includes('ORDEM DE CHEGADA'))",
  "      .join(' ');",
  "    if (!dataConfirmada || !enderecoConfirmado || !horario) {",
  "      return toast.error('Faltam data, endereço ou horário do agendamento. Confira a ficha antes de enviar.');",
  "    }",
  "    const mensagem = [",
].join('\n');
replaceOnce(oldMessageSetup, newMessageSetup, 'use frozen confirmed appointment data');

const oldMessageLines = "      asoExamDate ? `Data: ${formatDateEmail(asoExamDate)}` : '',\n      `Endereço: ${asoClinicInfo.local}`,\n      `Horário de atendimento: ${horario}`,\n      '',\n      `Guia do exame: ${guia.arquivo_url}`,";
const newMessageLines = "      `Data: ${formatDateEmail(dataConfirmada)}`,\n      `Endereço: ${enderecoConfirmado}`,\n      `Horário de atendimento: ${horario}`,\n      '',\n      'O atendimento é realizado por ordem de chegada.',\n      'Aconselhamos chegar cedo devido à demanda de pessoas, para um atendimento mais rápido.',\n      '',\n      `Guia do exame: ${guia.arquivo_url}`,";
replaceOnce(oldMessageLines, newMessageLines, 'appointment WhatsApp copy');

const oldInfoCard = '<div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-xl border bg-muted/15 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Clínica / atendimento</div><div className="mt-2 text-sm font-semibold">{asoClinicInfo.local}</div><div className="mt-2 space-y-1 text-xs text-muted-foreground">{asoClinicInfo.horarios.map((linha, i) => <div key={i}>{linha}</div>)}</div></div><div className="rounded-xl border bg-muted/15 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mensagem ao candidato</div><p className="mt-2 text-sm text-muted-foreground">Saudação automática por horário + tipo do exame + endereço + horário. O candidato recebe o link da própria guia e confirma com um OK após o atendimento.</p></div></div>';
const newInfoCard = '<div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-xl border bg-muted/15 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Clínica / atendimento</div><div className="mt-2 text-sm font-semibold">{asoClinicInfo.local}</div><div className="mt-2 space-y-1 text-xs text-muted-foreground">{asoClinicInfo.horarios.map((linha, i) => <div key={i}>{linha}</div>)}</div></div><div className="rounded-xl border bg-muted/15 p-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Mensagem ao funcionário</div><p className="mt-2 text-sm text-muted-foreground">Depois da confirmação da clínica, o WhatsApp é liberado com saudação automática, data, endereço e horário exatos da ficha, orientação de ordem de chegada e chegada antecipada.</p></div></div>';
replaceOnce(oldInfoCard, newInfoCard, 'ASO communication helper text');

const oldButtons = '<div className="flex flex-wrap gap-2"><Button onClick={gerarGuiaAso}><FileSearch className="mr-2 h-4 w-4" />Gerar Guia ASO</Button><Button onClick={enviarGuiaAso} variant="outline"><Mail className="mr-2 h-4 w-4" />Enviar guia à clínica</Button><Button onClick={() => void enviarAsoCandidato()} variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Enviar ASO ao candidato</Button></div>';
const newButtons = '<div className="flex flex-wrap gap-2"><Button onClick={gerarGuiaAso}><FileSearch className="mr-2 h-4 w-4" />Gerar Guia ASO</Button><Button onClick={enviarGuiaAso} variant="outline"><Mail className="mr-2 h-4 w-4" />Enviar guia à clínica</Button><Button onClick={() => void confirmarAgendamentoAso()} variant="outline" disabled={!form.id || !asoExamDate || asoAgendamentoConfirmado}><CheckCircle2 className="mr-2 h-4 w-4" />{asoAgendamentoConfirmado ? \'Agendamento confirmado\' : \'Confirmar agendamento\'}</Button><Button onClick={() => void enviarAsoCandidato()} variant="outline" disabled={!asoAgendamentoConfirmado}><MessageCircle className="mr-2 h-4 w-4" />Enviar agendamento ao funcionário</Button></div>{!asoAgendamentoConfirmado && <p className="text-xs text-muted-foreground">Após receber a confirmação da clínica, clique em <strong>Confirmar agendamento</strong>. O envio ao funcionário será liberado em seguida.</p>}';
replaceOnce(oldButtons, newButtons, 'confirmation and employee WhatsApp buttons');

fs.writeFileSync(file, source);
console.log('[ASO appointment patch] Confirmation gate and employee WhatsApp message applied.');
