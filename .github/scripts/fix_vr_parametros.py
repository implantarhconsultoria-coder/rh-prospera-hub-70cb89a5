from pathlib import Path


def rep(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


p = Path("src/pages/RelatorioVRPage.tsx")
t = p.read_text(encoding="utf-8")
t = rep(t,
"""  const [competenciaEmpresa, setCompetenciaEmpresa] = useState(new Date().toISOString().slice(0, 7));
  const [diasUteisManual, setDiasUteisManual] = useState('');
  const [diasUteisEmpresaManual, setDiasUteisEmpresaManual] = useState('');
  const [dataPagamentoManual, setDataPagamentoManual] = useState('');
  const [dataPagamentoEmpresaManual, setDataPagamentoEmpresaManual] = useState('');
""",
"""  const [diasUteisManual, setDiasUteisManual] = useState('');
  const [dataPagamentoManual, setDataPagamentoManual] = useState('');
""",
"estados duplicados")
t = rep(t,
"""  const diasUteis = Number(diasUteisManual) > 0 ? Number(diasUteisManual) : diasUteisCalculado;
  const diasUteisEmpresa = Number(diasUteisEmpresaManual) > 0 ? Number(diasUteisEmpresaManual) : undefined;
""",
"""  const diasUteis = Number(diasUteisManual) > 0 ? Number(diasUteisManual) : diasUteisCalculado;
""",
"dias duplicados")
t = rep(t,
"  const pagamentoDate = getFirstBusinessDayOfNextMonth(competencia);",
"  const pagamentoDate = dataPagamentoManual || getFirstBusinessDayOfNextMonth(competencia);",
"pagamento exibido")
t = rep(t,
"""    if (Number(diasUteisManual) > 0) params.set('diasUteis', String(Number(diasUteisManual)));
    navigate(`/relatorio-vr-impressao?${params.toString()}`);
""",
"""    if (Number(diasUteisManual) > 0) params.set('diasUteis', String(Number(diasUteisManual)));
    if (dataPagamentoManual) params.set('dataPagamento', dataPagamentoManual);
    navigate(`/relatorio-vr-impressao?${params.toString()}`);
""",
"data no relatorio")
t = rep(t,
"""  const handleRecibosTodasEmpresas = () => {
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    companies.forEach(c => getOrCreateEntries(c.id, competenciaEmpresa));
    const params = new URLSearchParams({ formato, competencia: competenciaEmpresa, empresas: companies.map(c => c.id).join(',') });
    if (diasUteisEmpresa) params.set('diasUteis', String(diasUteisEmpresa));
    if (dataPagamentoEmpresaManual) params.set('dataPagamento', dataPagamentoEmpresaManual);
    window.open(`/recibos-beneficio?${params.toString()}`, '_blank');
  };
  const handleRecibosEmpresasSelecionadas = () => {
    if (multiCompanies.size === 0) { toast.error('Selecione ao menos uma empresa'); return; }
    if (!competenciaEmpresa) { toast.error('Selecione a competência'); return; }
    Array.from(multiCompanies).forEach(cid => getOrCreateEntries(cid, competenciaEmpresa));
    const params = new URLSearchParams({ formato, competencia: competenciaEmpresa, empresas: Array.from(multiCompanies).join(',') });
    if (diasUteisEmpresa) params.set('diasUteis', String(diasUteisEmpresa));
    if (dataPagamentoEmpresaManual) params.set('dataPagamento', dataPagamentoEmpresaManual);
    window.open(`/recibos-beneficio?${params.toString()}`, '_blank');
  };
""",
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
  };
""",
"recibos em massa")
t = rep(t,
'<Input type="month" value={competenciaEmpresa} onChange={e => setCompetenciaEmpresa(e.target.value)} className="w-44" />',
'<Input type="month" value={competencia} onChange={e => { setCompetencia(e.target.value); setGenerated(false); }} className="w-44" />',
"competencia da secao")
t = rep(t,
"""<Input type="number" min="1" step="1" value={diasUteisEmpresaManual}
              onChange={e => setDiasUteisEmpresaManual(e.target.value)}
              placeholder="auto" className="w-28" />""",
"""<Input type="number" min="1" step="1" value={diasUteisManual}
              onChange={e => { setDiasUteisManual(e.target.value); setGenerated(false); }}
              placeholder={String(diasUteisCalculado)} className="w-28" />""",
"dias da secao")
t = rep(t,
'<Input type="date" value={dataPagamentoEmpresaManual} onChange={e => setDataPagamentoEmpresaManual(e.target.value)} className="w-40" />',
'<Input type="date" value={dataPagamentoManual} onChange={e => setDataPagamentoManual(e.target.value)} className="w-40" />',
"pagamento da secao")
t = rep(t,
'<RecibosPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} tipo="vr" company={company} competencia={competencia} rows={previewRows} onPrint={handleRecibosSelecionados} />',
'<RecibosPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} tipo="vr" company={company} competencia={competencia} diasUteis={diasUteis} dataPagamento={pagamentoDate} rows={previewRows} onPrint={handleRecibosSelecionados} />',
"parametros da previa")
p.write_text(t, encoding="utf-8")

p = Path("src/components/RecibosPreviewModal.tsx")
t = p.read_text(encoding="utf-8")
t = rep(t,
"  competencia: string;\n  rows: BenefitReportRow[];",
"  competencia: string;\n  diasUteis?: number;\n  dataPagamento?: string;\n  rows: BenefitReportRow[];",
"props previa")
t = rep(t,
"""const RecibosPreviewModal: React.FC<Props> = ({ open, onOpenChange, tipo, company, competencia, rows, onPrint }) => {
  const competenciaLabel = competencia ? competenciaPt(competencia) : '';
  const dataPagamento = competencia ? getFirstBusinessDayOfNextMonth(competencia) : '';
""",
"""const RecibosPreviewModal: React.FC<Props> = ({ open, onOpenChange, tipo, company, competencia, diasUteis, dataPagamento: dataPagamentoProp, rows, onPrint }) => {
  const competenciaLabel = competencia ? competenciaPt(competencia) : '';
  const dataPagamento = dataPagamentoProp || (competencia ? getFirstBusinessDayOfNextMonth(competencia) : '');
""",
"pagamento previa")
t = rep(t,
'<tr><td className="py-1 pr-4 font-semibold">Competência:</td><td className="py-1">{competenciaLabel}</td></tr>',
'<tr><td className="py-1 pr-4 font-semibold">Competência:</td><td className="py-1">{competenciaLabel}</td></tr>\n                        {diasUteis ? <tr><td className="py-1 pr-4 font-semibold">Dias úteis:</td><td className="py-1">{diasUteis}</td></tr> : null}',
"dias previa")
p.write_text(t, encoding="utf-8")

p = Path("src/pages/RelatorioVRImpressaoPage.tsx")
t = p.read_text(encoding="utf-8")
t = rep(t,
'const EmpresaPagina: React.FC<{ block: EmpresaBlock; competencia: string; consolidado: boolean }> = ({ block, competencia, consolidado }) => (',
'const EmpresaPagina: React.FC<{ block: EmpresaBlock; competencia: string; consolidado: boolean; dataPagamento?: string }> = ({ block, competencia, consolidado, dataPagamento }) => (',
"prop pagamento impressao")
t = rep(t,
'<p className="text-xs">Dias úteis: {block.diasUteis}</p>',
'<p className="text-xs">Dias úteis: {block.diasUteis}</p>\n          {dataPagamento && <p className="text-xs">Pagamento: {dataPagamento}</p>}',
"pagamento impressao")
t = rep(t,
"  const diasUteisManual = Number(searchParams.get('diasUteis') || 0);",
"  const diasUteisManual = Number(searchParams.get('diasUteis') || 0);\n  const dataPagamentoParam = searchParams.get('dataPagamento') || '';\n  const dataPagamento = dataPagamentoParam ? dataPagamentoParam.split('-').reverse().join('/') : '';",
"ler pagamento")
t = rep(t,
'<EmpresaPagina key={b.company.id} block={b} competencia={competencia} consolidado={consolidado} />',
'<EmpresaPagina key={b.company.id} block={b} competencia={competencia} consolidado={consolidado} dataPagamento={dataPagamento} />',
"passar pagamento")
p.write_text(t, encoding="utf-8")
