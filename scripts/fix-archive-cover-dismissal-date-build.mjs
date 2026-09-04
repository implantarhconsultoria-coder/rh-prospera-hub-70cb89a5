import fs from 'node:fs';

const file = 'src/components/ArchiveCoverDialog.tsx';
if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
let changed = false;

if (!source.includes('Data de demissão para esta capa')) {
  const oldCall = `<CoverOptionsPanel options={options} dismissalEnabled={!!dismissalDate && !loadingEmployee} loadingEmployee={loadingEmployee} dismissalDate={dismissalDate} bulk={false} toggleOption={toggleOption} />`;
  const newCall = `<CoverOptionsPanel options={options} dismissalEnabled={!loadingEmployee} loadingEmployee={loadingEmployee} dismissalDate={dismissalDate} bulk={false} toggleOption={toggleOption} onDismissalDateChange={setDismissalDate} />`;
  if (!source.includes(oldCall)) throw new Error('[archive-cover-dismissal-date] chamada do painel nao encontrada');
  source = source.replace(oldCall, newCall);
  changed = true;

  const oldPanel = `const CoverOptionsPanel = ({ options, dismissalEnabled, loadingEmployee, dismissalDate, bulk, toggleOption }: { options: CoverOptions; dismissalEnabled: boolean; loadingEmployee: boolean; dismissalDate: string; bulk: boolean; toggleOption: (key: keyof CoverOptions) => void }) => (\n  <div className="rounded-xl border p-4">\n    <div className="text-xs font-semibold">Informações da capa</div>\n    <div className="mb-3 mt-0.5 text-[10px] text-muted-foreground">O nome sempre será impresso em destaque.</div>\n    <div className="space-y-2">\n      <OptionButton checked={options.company} label="Empresa" onClick={() => toggleOption('company')} />\n      <OptionButton checked={options.cargo} label="Cargo / Função" onClick={() => toggleOption('cargo')} />\n      <OptionButton checked={options.admission} label="Data de admissão" onClick={() => toggleOption('admission')} />\n      <OptionButton checked={options.dismissal} label="Data de demissão" onClick={() => toggleOption('dismissal')} disabled={!dismissalEnabled} />\n    </div>\n    {!bulk && loadingEmployee && <div className="mt-3 text-[10px] text-muted-foreground">Conferindo data de demissão...</div>}\n    {!bulk && !loadingEmployee && !dismissalDate && <div className="mt-3 text-[10px] text-muted-foreground">Este funcionário não possui data de demissão cadastrada.</div>}\n  </div>\n);`;

  const newPanel = `const CoverOptionsPanel = ({ options, dismissalEnabled, loadingEmployee, dismissalDate, bulk, toggleOption, onDismissalDateChange }: { options: CoverOptions; dismissalEnabled: boolean; loadingEmployee: boolean; dismissalDate: string; bulk: boolean; toggleOption: (key: keyof CoverOptions) => void; onDismissalDateChange?: (value: string) => void }) => (\n  <div className="rounded-xl border p-4">\n    <div className="text-xs font-semibold">Informações da capa</div>\n    <div className="mb-3 mt-0.5 text-[10px] text-muted-foreground">O nome sempre será impresso em destaque.</div>\n    <div className="space-y-2">\n      <OptionButton checked={options.company} label="Empresa" onClick={() => toggleOption('company')} />\n      <OptionButton checked={options.cargo} label="Cargo / Função" onClick={() => toggleOption('cargo')} />\n      <OptionButton checked={options.admission} label="Data de admissão" onClick={() => toggleOption('admission')} />\n      <OptionButton checked={options.dismissal} label="Data de demissão" onClick={() => toggleOption('dismissal')} disabled={!dismissalEnabled} />\n    </div>\n    {!bulk && loadingEmployee && <div className="mt-3 text-[10px] text-muted-foreground">Conferindo data de demissão...</div>}\n    {!bulk && options.dismissal && !loadingEmployee && (\n      <div className="mt-3 space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">\n        <label className="block text-[10px] font-semibold text-foreground">Data de demissão para esta capa</label>\n        <Input\n          type="date"\n          value={dismissalDate}\n          onChange={(event) => onDismissalDateChange?.(event.target.value)}\n          className={lightFieldClass}\n        />\n        <div className="text-[10px] leading-relaxed text-muted-foreground">\n          {dismissalDate\n            ? 'Data carregada do cadastro. Você pode ajustar aqui conforme o documento que está em mãos. A alteração vale somente para esta capa.'\n            : 'Preencha conforme os documentos que estão em mãos. Esta data será usada somente na capa/PDF e não altera automaticamente o cadastro do funcionário.'}\n        </div>\n      </div>\n    )}\n  </div>\n);`;

  if (!source.includes(oldPanel)) throw new Error('[archive-cover-dismissal-date] painel original nao encontrado');
  source = source.replace(oldPanel, newPanel);
  changed = true;
}

if (changed) fs.writeFileSync(file, source, 'utf8');
console.log('[archive-cover-dismissal-date] data manual liberada na capa para arquivar sem alterar o cadastro');
