import fs from 'node:fs';

const file = 'src/pages/PreCadastroAdmissionalOcrPage.tsx';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('data-topac-aso-buttons-live')) {
  console.log('[ASO buttons live] Already applied.');
  process.exit(0);
}

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`[ASO buttons live] Anchor not found: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  "  const asoAgendamentoConfirmado = Boolean(\n    asoConfirmacao.confirmado &&\n    asoConfirmacao.data_exame &&\n    asoConfirmacao.data_exame === asoExamDate\n  );\n\n  const confirmarAgendamentoAso = async () => {",
  "  const asoAgendamentoConfirmado = Boolean(\n    asoConfirmacao.confirmado &&\n    asoConfirmacao.data_exame &&\n    asoConfirmacao.data_exame === asoExamDate\n  );\n\n  const atualizarDataAso = async (value: string) => {\n    setAsoExamDate(value);\n    setLastAsoGuide(null);\n    if (!form.id) return;\n    const conferenciaAtual = ((form.conferencia || {}) as Record<string, any>);\n    const conferenciaAtualizada = {\n      ...conferenciaAtual,\n      aso_agendamento: {\n        ...(conferenciaAtual.aso_agendamento || {}),\n        data_exame: value,\n        confirmado: false,\n      },\n    };\n    setForm(prev => ({ ...prev, conferencia: conferenciaAtualizada }));\n    const { error } = await (supabase as any).from('pre_cadastros_admissionais').update({ conferencia: conferenciaAtualizada }).eq('id', form.id);\n    if (error) toast.error(`Não foi possível salvar a data do exame: ${error.message}`);\n  };\n\n  const confirmarAgendamentoAso = async () => {",
  'persist ASO date helper',
);

replaceOnce(
  '<div><label className="text-xs text-muted-foreground">Data do exame / ASO</label><Input type="date" value={asoExamDate} onChange={e => { setAsoExamDate(e.target.value); setLastAsoGuide(null); }} /></div>',
  '<div data-topac-aso-buttons-live="true"><label className="text-xs text-muted-foreground">Data do exame / ASO</label><Input type="date" value={asoExamDate} onChange={e => void atualizarDataAso(e.target.value)} /></div>',
  'date field persistence',
);

replaceOnce(
  '<div className="flex flex-wrap gap-2"><Button onClick={gerarGuiaAso}><FileSearch className="mr-2 h-4 w-4" />Gerar Guia ASO</Button><Button onClick={enviarGuiaAso} variant="outline"><Mail className="mr-2 h-4 w-4" />Enviar guia à clínica</Button><Button onClick={() => void confirmarAgendamentoAso()} variant="outline" disabled={!form.id || !asoExamDate || asoAgendamentoConfirmado}><CheckCircle2 className="mr-2 h-4 w-4" />{asoAgendamentoConfirmado ? \'Agendamento confirmado\' : \'Confirmar agendamento\'}</Button><Button onClick={() => void enviarAsoCandidato()} variant="outline" disabled={!asoAgendamentoConfirmado}><MessageCircle className="mr-2 h-4 w-4" />Enviar agendamento ao funcionário</Button></div>{!asoAgendamentoConfirmado && <p className="text-xs text-muted-foreground">Após receber a confirmação da clínica, clique em <strong>Confirmar agendamento</strong>. O envio ao funcionário será liberado em seguida.</p>}',
  '<div className="flex flex-wrap gap-2"><Button type="button" onClick={gerarGuiaAso}><FileSearch className="mr-2 h-4 w-4" />Gerar Guia ASO</Button><Button type="button" onClick={enviarGuiaAso} variant="outline"><Mail className="mr-2 h-4 w-4" />Enviar guia à clínica</Button><Button type="button" onClick={() => void confirmarAgendamentoAso()} variant="outline"><CheckCircle2 className="mr-2 h-4 w-4" />{asoAgendamentoConfirmado ? \'Agendamento confirmado\' : \'Confirmar agendamento\'}</Button><Button type="button" onClick={() => void enviarAsoCandidato()} variant="outline"><MessageCircle className="mr-2 h-4 w-4" />Enviar agendamento ao funcionário</Button></div>{!asoAgendamentoConfirmado && <p className="text-xs text-muted-foreground">Após receber a confirmação da clínica, clique em <strong>Confirmar agendamento</strong>. Se faltar data ou confirmação, o sistema exibirá o motivo em vez de deixar o botão sem resposta.</p>}',
  'activate buttons and force button type',
);

fs.writeFileSync(file, source);
console.log('[ASO buttons live] Date persistence + active button feedback applied.');
