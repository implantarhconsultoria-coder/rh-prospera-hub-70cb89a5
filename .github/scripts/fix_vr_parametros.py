from pathlib import Path
import re


def apply(path: str, transforms):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    for label, pattern, repl in transforms:
        text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
        print(f'{path} | {label}: {count}')
    p.write_text(text, encoding='utf-8')


apply('src/pages/RelatorioVRPage.tsx', [
    ('estados', r"\n\s*const \[competenciaEmpresa, setCompetenciaEmpresa\].*?const \[dataPagamentoEmpresaManual, setDataPagamentoEmpresaManual\] = useState\(''\);", "\n  const [diasUteisManual, setDiasUteisManual] = useState('');\n  const [dataPagamentoManual, setDataPagamentoManual] = useState('');"),
    ('dias duplicados', r"\n\s*const diasUteisEmpresa = .*?;", ''),
    ('pagamento tela', r"const pagamentoDate = getFirstBusinessDayOfNextMonth\(competencia\);", "const pagamentoDate = dataPagamentoManual || getFirstBusinessDayOfNextMonth(competencia);"),
    ('parametro relatorio', r"(if \(Number\(diasUteisManual\) > 0\) params\.set\('diasUteis'.*?;\n)(\s*navigate\(`/relatorio-vr-impressao)", r"\1    if (dataPagamentoManual) params.set('dataPagamento', dataPagamentoManual);\n\2"),
    ('handlers massa', r"  const handleRecibosTodasEmpresas = \(\) => \{.*?\n  \};\n  const handleRecibosEmpresasSelecionadas = \(\) => \{.*?\n  \};", """  const handleRecibosTodasEmpresas = () => {
    if (!competencia) { toast.error('Selecione a competência'); return; }
    companies.forEach(c => getOrCreateEntries(c.id, competencia));
    goRecibos(companies.map(c => c.id));
  };
  const handleRecibosEmpresasSelecionadas = () => {
    if (multiCompanies.size === 0) { toast.error('Selecione ao menos uma empresa'); return; }
    if (!competencia) { toast.error('Selecione a competência'); return; }
    Array.from(multiCompanies).forEach(cid => getOrCreateEntries(cid, competencia));
    goRecibos(Array.from(multiCompanies));
  };"""),
    ('competencia secao', r'<Input type="month" value=\{competenciaEmpresa\}.*?className="w-44" />', '<Input type="month" value={competencia} onChange={e => { setCompetencia(e.target.value); setGenerated(false); }} className="w-44" />'),
    ('dias secao', r'<Input type="number" min="1" step="1" value=\{diasUteisEmpresaManual\}.*?className="w-28" />', '<Input type="number" min="1" step="1" value={diasUteisManual}\n              onChange={e => { setDiasUteisManual(e.target.value); setGenerated(false); }}\n              placeholder={String(diasUteisCalculado)} className="w-28" />'),
    ('pagamento secao', r'<Input type="date" value=\{dataPagamentoEmpresaManual\}.*?className="w-40" />', '<Input type="date" value={dataPagamentoManual} onChange={e => setDataPagamentoManual(e.target.value)} className="w-40" />'),
    ('preview props', r'<RecibosPreviewModal\s+open=\{previewOpen\}.*?onPrint=\{handleRecibosSelecionados\}\s*/>', '<RecibosPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} tipo="vr" company={company} competencia={competencia} diasUteis={diasUteis} dataPagamento={pagamentoDate} rows={previewRows} onPrint={handleRecibosSelecionados} />'),
])

apply('src/components/RecibosPreviewModal.tsx', [
    ('props', r'(\s+competencia: string;\n)(\s+rows: BenefitReportRow\[\];)', r'\1  diasUteis?: number;\n  dataPagamento?: string;\n\2'),
    ('assinatura', r"const RecibosPreviewModal: React\.FC<Props> = \(\{ open, onOpenChange, tipo, company, competencia, rows, onPrint \}\) => \{\n  const competenciaLabel = competencia \? competenciaPt\(competencia\) : '';\n  const dataPagamento = competencia \? getFirstBusinessDayOfNextMonth\(competencia\) : '';", "const RecibosPreviewModal: React.FC<Props> = ({ open, onOpenChange, tipo, company, competencia, diasUteis, dataPagamento: dataPagamentoProp, rows, onPrint }) => {\n  const competenciaLabel = competencia ? competenciaPt(competencia) : '';\n  const dataPagamento = dataPagamentoProp || (competencia ? getFirstBusinessDayOfNextMonth(competencia) : '');"),
    ('dias previa', r'(<tr><td className="py-1 pr-4 font-semibold">Competência:</td><td className="py-1">\{competenciaLabel\}</td></tr>)', r'\1\n                        {diasUteis ? <tr><td className="py-1 pr-4 font-semibold">Dias úteis:</td><td className="py-1">{diasUteis}</td></tr> : null}'),
])

apply('src/pages/RelatorioVRImpressaoPage.tsx', [
    ('prop', r'const EmpresaPagina: React\.FC<\{ block: EmpresaBlock; competencia: string; consolidado: boolean \}> = \(\{ block, competencia, consolidado \}\) => \(', 'const EmpresaPagina: React.FC<{ block: EmpresaBlock; competencia: string; consolidado: boolean; dataPagamento?: string }> = ({ block, competencia, consolidado, dataPagamento }) => ('),
    ('mostrar pagamento', r'(<p className="text-xs">Dias úteis: \{block\.diasUteis\}</p>)', r'\1\n          {dataPagamento && <p className="text-xs">Pagamento: {dataPagamento}</p>}'),
    ('ler pagamento', r"(const diasUteisManual = Number\(searchParams\.get\('diasUteis'\) \|\| 0\);)", r"\1\n  const dataPagamentoParam = searchParams.get('dataPagamento') || '';\n  const dataPagamento = dataPagamentoParam ? dataPagamentoParam.split('-').reverse().join('/') : '';"),
    ('passar pagamento', r'<EmpresaPagina key=\{b\.company\.id\} block=\{b\} competencia=\{competencia\} consolidado=\{consolidado\} />', '<EmpresaPagina key={b.company.id} block={b} competencia={competencia} consolidado={consolidado} dataPagamento={dataPagamento} />'),
])
