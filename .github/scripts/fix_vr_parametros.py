from pathlib import Path
import re


def sub(text: str, pattern: str, replacement: str, label: str, flags: int = 0, required: bool = True) -> str:
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    print(f"{label}: {count}")
    if required and count != 1:
        raise SystemExit(f"{label}: substituicao nao aplicada")
    return text


# Tela principal de VR
p = Path("src/pages/RelatorioVRPage.tsx")
t = p.read_text(encoding="utf-8")

t = sub(t,
    r"\n\s*const \[competenciaEmpresa, setCompetenciaEmpresa\][\s\S]*?const \[dataPagamentoEmpresaManual, setDataPagamentoEmpresaManual\] = useState\(''\);",
    "\n  const [diasUteisManual, setDiasUteisManual] = useState('');\n  const [dataPagamentoManual, setDataPagamentoManual] = useState('');",
    "estados unificados")

t = sub(t,
    r"\n\s*const diasUteisEmpresa = Number\(diasUteisEmpresaManual\) > 0 \? Number\(diasUteisEmpresaManual\) : undefined;",
    "",
    "dias uteis duplicados")

t = sub(t,
    r"const pagamentoDate = getFirstBusinessDayOfNextMonth\(competencia\);",
    "const pagamentoDate = dataPagamentoManual || getFirstBusinessDayOfNextMonth(competencia);",
    "pagamento da tela")

t = sub(t,
    r"(if \(Number\(diasUteisManual\) > 0\) params\.set\('diasUteis', String\(Number\(diasUteisManual\)\)\);\n)(\s*navigate\(`/relatorio-vr-impressao\?\$\{params\.toString\(\)\}`\);)",
    r"\1    if (dataPagamentoManual) params.set('dataPagamento', dataPagamentoManual);\n\2",
    "parametro no relatorio")

t = sub(t,
    r"  const handleRecibosTodasEmpresas = \(\) => \{[\s\S]*?\n  \};\n  const handleRecibosEmpresasSelecionadas = \(\) => \{[\s\S]*?\n  \};",
    """  const handleRecibosTodasEmpresas = () => {
    if (!competencia) { toast.error('Selecione a competência'); return; }
    companies.forEach(c => getOrCreateEntries(c.id, competencia));
    goRecibos(companies.map(c => c.id));
  };
  const handleRecibosEmpresasSelecionadas = () => {
    if (multiCompanies.size === 0) { toast.error('Selecione ao menos uma empresa'); return; }
    if (!competencia) { toast.error('Selecione a competência'); return; }
    Array.from(multiCompanies).forEach(cid => getOrCreateEntries(cid, competencia));
    goRecibos(Array.from(multiCompanies));
  };""",
    "recibos em massa")

t = sub(t,
    r'<Input type="month" value=\{competenciaEmpresa\} onChange=\{e => setCompetenciaEmpresa\(e\.target\.value\)\} className="w-44" />',
    '<Input type="month" value={competencia} onChange={e => { setCompetencia(e.target.value); setGenerated(false); }} className="w-44" />',
    "competencia da secao")

t = sub(t,
    r'<Input type="number" min="1" step="1" value=\{diasUteisEmpresaManual\}[\s\S]*?placeholder="auto" className="w-28" />',
    '<Input type="number" min="1" step="1" value={diasUteisManual}\n              onChange={e => { setDiasUteisManual(e.target.value); setGenerated(false); }}\n              placeholder={String(diasUteisCalculado)} className="w-28" />',
    "dias da secao")

t = sub(t,
    r'<Input type="date" value=\{dataPagamentoEmpresaManual\} onChange=\{e => setDataPagamentoEmpresaManual\(e\.target\.value\)\} className="w-40" />',
    '<Input type="date" value={dataPagamentoManual} onChange={e => setDataPagamentoManual(e.target.value)} className="w-40" />',
    "pagamento da secao")

t = sub(t,
    r'<RecibosPreviewModal\s+open=\{previewOpen\}[\s\S]*?onPrint=\{handleRecibosSelecionados\}\s*/>',
    '<RecibosPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} tipo="vr" company={company} competencia={competencia} diasUteis={diasUteis} dataPagamento={pagamentoDate} rows={previewRows} onPrint={handleRecibosSelecionados} />',
    "parametros da previa")

p.write_text(t, encoding="utf-8")

# Modal de previa
p = Path("src/components/RecibosPreviewModal.tsx")
t = p.read_text(encoding="utf-8")
t = sub(t,
    r"(\s+competencia: string;\n)(\s+rows: BenefitReportRow\[\];)",
    r"\1  diasUteis?: number;\n  dataPagamento?: string;\n\2",
    "props da previa")
t = sub(t,
    r"const RecibosPreviewModal: React\.FC<Props> = \(\{ open, onOpenChange, tipo, company, competencia, rows, onPrint \}\) => \{\n  const competenciaLabel = competencia \? competenciaPt\(competencia\) : '';\n  const dataPagamento = competencia \? getFirstBusinessDayOfNextMonth\(competencia\) : '';",
    "const RecibosPreviewModal: React.FC<Props> = ({ open, onOpenChange, tipo, company, competencia, diasUteis, dataPagamento: dataPagamentoProp, rows, onPrint }) => {\n  const competenciaLabel = competencia ? competenciaPt(competencia) : '';\n  const dataPagamento = dataPagamentoProp || (competencia ? getFirstBusinessDayOfNextMonth(competencia) : '');",
    "data da previa")
t = sub(t,
    r'(<tr><td className="py-1 pr-4 font-semibold">Competência:</td><td className="py-1">\{competenciaLabel\}</td></tr>)',
    r'\1\n                        {diasUteis ? <tr><td className="py-1 pr-4 font-semibold">Dias úteis:</td><td className="py-1">{diasUteis}</td></tr> : null}',
    "dias na previa")
p.write_text(t, encoding="utf-8")

# Relatorio impresso
p = Path("src/pages/RelatorioVRImpressaoPage.tsx")
t = p.read_text(encoding="utf-8")
t = sub(t,
    r"const EmpresaPagina: React\.FC<\{ block: EmpresaBlock; competencia: string; consolidado: boolean \}> = \(\{ block, competencia, consolidado \}\) => \(",
    "const EmpresaPagina: React.FC<{ block: EmpresaBlock; competencia: string; consolidado: boolean; dataPagamento?: string }> = ({ block, competencia, consolidado, dataPagamento }) => (",
    "prop pagamento impresso")
t = sub(t,
    r'(<p className="text-xs">Dias úteis: \{block\.diasUteis\}</p>)',
    r'\1\n          {dataPagamento && <p className="text-xs">Pagamento: {dataPagamento}</p>}',
    "pagamento no relatorio")
t = sub(t,
    r"(const diasUteisManual = Number\(searchParams\.get\('diasUteis'\) \|\| 0\);)",
    r"\1\n  const dataPagamentoParam = searchParams.get('dataPagamento') || '';\n  const dataPagamento = dataPagamentoParam ? dataPagamentoParam.split('-').reverse().join('/') : '';",
    "leitura do pagamento")
t = sub(t,
    r'<EmpresaPagina key=\{b\.company\.id\} block=\{b\} competencia=\{competencia\} consolidado=\{consolidado\} />',
    '<EmpresaPagina key={b.company.id} block={b} competencia={competencia} consolidado={consolidado} dataPagamento={dataPagamento} />',
    "passagem do pagamento")
p.write_text(t, encoding="utf-8")
