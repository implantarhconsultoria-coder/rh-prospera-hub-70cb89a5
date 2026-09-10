import fs from 'node:fs';

const replaceIfNeeded = (source, oldText, newText, label) => {
  if (source.includes(newText)) return source;
  if (!source.includes(oldText)) {
    throw new Error(`[ferias] ${label}: trecho nao encontrado`);
  }
  return source.replace(oldText, newText);
};

const pagePath = 'src/pages/AvisoFeriasPage.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

const hasCorrectVacationRule =
  page.includes("const fimFerias = inicioFerias ? addDaysISO(inicioFerias, Math.max(0, diasFerias - 1))") &&
  page.includes("const retorno = inicioFerias ? addDaysISO(inicioFerias, Math.max(0, diasFerias))");

if (!hasCorrectVacationRule) {
  throw new Error('[ferias] regra de datas incorreta: o primeiro dia deve contar como dia 1');
}

page = replaceIfNeeded(
  page,
  '<h1 className="text-2xl font-bold font-display">Aviso de Férias — {emp.name}</h1>',
  '<h1 className="text-2xl font-bold font-display">Solicitação de Férias — {emp.name}</h1>',
  'titulo da solicitacao',
);

page = replaceIfNeeded(
  page,
  '<h1 className="text-2xl font-bold font-display">Aviso de Férias</h1>',
  '<h1 className="text-2xl font-bold font-display">Solicitar Férias</h1>',
  'titulo da lista',
);

page = replaceIfNeeded(
  page,
  '<p className="text-primary-foreground/70 text-sm">Clique no funcionário para gerar o aviso</p>',
  '<p className="text-primary-foreground/70 text-sm">Selecione o funcionário para solicitar as férias à contabilidade</p>',
  'subtitulo da lista',
);

page = replaceIfNeeded(
  page,
  '`Segue aviso de ferias do(a) colaborador(a) abaixo:`,',
  '`Segue solicitacao de ferias do(a) colaborador(a) abaixo:`,',
  'corpo do email',
);

page = replaceIfNeeded(
  page,
  'subject: `Aviso de Ferias - ${emp.name} - ${company?.name || \'\'}`,',
  'subject: `Solicitacao de Ferias - ${emp.name} - ${company?.name || \'\'}`,',
  'assunto do email',
);

page = replaceIfNeeded(
  page,
  '<Mail className="w-4 h-4 mr-2" /> Enviar por E-mail',
  '<Mail className="w-4 h-4 mr-2" /> Solicitar Férias à Contabilidade',
  'botao da contabilidade',
);

fs.writeFileSync(pagePath, page, 'utf8');

for (const menuPath of ['src/components/AppSidebar.tsx', 'src/components/AdminMobileLayout.tsx']) {
  let source = fs.readFileSync(menuPath, 'utf8');
  const oldItem = "label: 'Aviso de Férias', path: '/aviso-ferias'";
  const newItem = "label: 'Solicitar Férias', path: '/aviso-ferias'";

  if (!source.includes(newItem)) {
    const count = source.split(oldItem).length - 1;
    if (count < 1) {
      throw new Error(`[ferias] menu ${menuPath}: item nao encontrado`);
    }
    source = source.split(oldItem).join(newItem);
    fs.writeFileSync(menuPath, source, 'utf8');
  }
}

console.log('[ferias] fluxo Solicitar Ferias -> Contabilidade aplicado');
