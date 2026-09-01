import fs from 'node:fs';

const path = 'src/pages/AvisoFeriasPage.tsx';
let source = fs.readFileSync(path, 'utf8');

if (source.includes('const calcPeriodoFerias = () => {')) {
  console.log('[ferias] regra de fim/retorno ja corrigida');
  process.exit(0);
}

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`[ferias] ${label}: esperado 1 trecho, encontrado ${count}`);
  source = source.replace(oldText, newText);
};

replaceOnce(
`const addDaysISO = (value: string, days: number) => {
  const date = toDateOnly(value);
  date.setDate(date.getDate() + days);
  return toISODateOnly(date);
};`,
`const addDaysISO = (value: string, days: number) => {
  const date = toDateOnly(value);
  date.setDate(date.getDate() + days);
  return toISODateOnly(date);
};

const nextWeekdayISO = (value: string) => {
  let current = value;
  while (current) {
    const weekday = toDateOnly(current).getDay();
    if (weekday !== 0 && weekday !== 6) return current;
    current = addDaysISO(current, 1);
  }
  return value;
};`,
'helper proximo dia util',
);

replaceOnce(
`  const calcRetorno = () => {
    if (!inicioFerias) return '';
    return addDaysISO(inicioFerias, Math.max(0, diasFerias - 1));
  };
  const retorno = calcRetorno();`,
`  const calcPeriodoFerias = () => {
    if (!inicioFerias) return { fim: '', retorno: '' };
    const fim = addDaysISO(inicioFerias, Math.max(0, diasFerias - 1));
    const retorno = nextWeekdayISO(addDaysISO(fim, 1));
    return { fim, retorno };
  };
  const { fim: fimFerias, retorno } = calcPeriodoFerias();`,
'calculo do periodo',
);

replaceOnce(
`    if (!retorno) { toast.error('Informe o periodo de ferias'); return null; }`,
`    if (!fimFerias || !retorno) { toast.error('Informe o periodo de ferias'); return null; }`,
'validacao do periodo',
);

replaceOnce(
`      const statusAtual = feriasPeriodoStatus(inicioFerias, retorno);
      const observacao = \`Ferias de \${diasFerias} dias. Inicio: \${formatDate(inicioFerias)}. Fim/retorno previsto: \${formatDate(retorno)}.\`;`,
`      const statusAtual = feriasPeriodoStatus(inicioFerias, fimFerias);
      const observacao = \`Ferias de \${diasFerias} dias. Inicio: \${formatDate(inicioFerias)}. Fim: \${formatDate(fimFerias)}. Retorno previsto: \${formatDate(retorno)}.\`;`,
'status e observacao',
);

replaceOnce(
`        periodo_gozo_fim: retorno,
        data_retorno: retorno,`,
`        periodo_gozo_fim: fimFerias,
        data_retorno: retorno,`,
'persistencia fim/retorno',
);

replaceOnce(
`[FERIAS] Inicio: \${inicioFerias} | Fim/retorno previsto: \${retorno} | \${diasFerias} dias | Status: \${statusAtual?.label || 'Ferias marcadas'}`,
`[FERIAS] Inicio: \${inicioFerias} | Fim: \${fimFerias} | Retorno: \${retorno} | \${diasFerias} dias | Status: \${statusAtual?.label || 'Ferias marcadas'}`,
'historico do funcionario',
);

replaceOnce(
`      inicioFerias && retorno ? { inicio: inicioFerias, fim: retorno, dias: diasFerias } : undefined,`,
`      inicioFerias && fimFerias ? { inicio: inicioFerias, fim: fimFerias, dias: diasFerias } : undefined,`,
'rascunho do periodo',
);

replaceOnce(
`            <div><span className="text-xs text-muted-foreground block">Fim/retorno</span><strong>{fer.fim ? formatDate(fer.fim) : 'Sem data'}</strong></div>`,
`            <div><span className="text-xs text-muted-foreground block">Fim das férias</span><strong>{fer.fim ? formatDate(fer.fim) : 'Sem data'}</strong></div>`,
'rotulo fim das ferias',
);

replaceOnce(
`          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">`,
`          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">`,
'grid de datas',
);

replaceOnce(
`            <div><label className="text-xs text-muted-foreground block mb-1">Retorno Previsto</label>
              <p className="text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">{retorno ? formatDate(retorno) : '—'}</p></div>`,
`            <div><label className="text-xs text-muted-foreground block mb-1">Fim das Férias</label>
              <p className="text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">{fimFerias ? formatDate(fimFerias) : '—'}</p></div>
            <div><label className="text-xs text-muted-foreground block mb-1">Retorno ao Trabalho</label>
              <p className="text-sm font-medium bg-muted/50 px-3 py-2 rounded-md">{retorno ? formatDate(retorno) : '—'}</p></div>`,
'campos fim e retorno',
);

fs.writeFileSync(path, source, 'utf8');
console.log('[ferias] regra de fim e retorno corrigida com sucesso');
