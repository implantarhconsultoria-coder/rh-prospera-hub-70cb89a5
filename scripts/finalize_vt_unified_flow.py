from pathlib import Path

receipt_path = Path('src/pages/RecibosBeneficioImpressaoPage.tsx')
text = receipt_path.read_text(encoding='utf-8')
text = text.replace("import { arquivarDocumentoFuncionario } from '@/lib/documentoHistorico';\n", '')
start = text.find("  const getNomeUsuarioAtual = async () => session?.user?.email || 'Sistema TOPAC RH';")
end = text.find("  const handleImprimirPdf = async () => {", start)
if start == -1 or end == -1:
    raise SystemExit('Trecho de historico de recibos nao encontrado')
replacement = """  // Regra definitiva: gerar, visualizar, imprimir, baixar ou enviar o recibo NAO cria Historico.\n  // O documento so entra no Historico do funcionario pelo trigger do banco depois da assinatura eletrônica.\n  const arquivarRecibosNoHistorico = async (_items: ReciboItem[], _origem: 'impressao' | 'email' | 'download') => {\n    return;\n  };\n\n"""
text = text[:start] + replacement + text[end:]
receipt_path.write_text(text, encoding='utf-8')

benefit_path = Path('src/components/payroll/BenefitSignatureGenerator.tsx')
text = benefit_path.read_text(encoding='utf-8')
old = """  const availableVr = eligible.filter((employee: any) => employee.vrAtivo && latestSources.has(sourceKey(employee.id, 'vr'))).length;\n  const availableVt = eligible.filter((employee: any) => employee.vtAtivo && latestSources.has(sourceKey(employee.id, 'vt'))).length;\n  const missing = eligible.flatMap((employee: any) => {\n    const out: string[] = [];\n    if (employee.vrAtivo && !latestSources.has(sourceKey(employee.id, 'vr'))) out.push(`${employee.name} — VR`);\n    if (employee.vtAtivo && !latestSources.has(sourceKey(employee.id, 'vt'))) out.push(`${employee.name} — VT`);\n    return out;\n  });\n"""
new = """  const hasPortalDoc = (employeeId: string, kind: 'vr' | 'vt') => docs.some((row: any) =>\n    row.employee_id === employeeId && row.document_type === (kind === 'vr' ? VR_TYPE : VT_TYPE) && row.is_current !== false\n  );\n  const availableVr = eligible.filter((employee: any) => employee.vrAtivo && (hasPortalDoc(employee.id, 'vr') || latestSources.has(sourceKey(employee.id, 'vr')))).length;\n  const availableVt = eligible.filter((employee: any) => employee.vtAtivo && (hasPortalDoc(employee.id, 'vt') || latestSources.has(sourceKey(employee.id, 'vt')))).length;\n  const missing = eligible.flatMap((employee: any) => {\n    const out: string[] = [];\n    if (employee.vrAtivo && !hasPortalDoc(employee.id, 'vr') && !latestSources.has(sourceKey(employee.id, 'vr'))) out.push(`${employee.name} — VR`);\n    if (employee.vtAtivo && !hasPortalDoc(employee.id, 'vt') && !latestSources.has(sourceKey(employee.id, 'vt'))) out.push(`${employee.name} — VT`);\n    return out;\n  });\n"""
if old not in text:
    raise SystemExit('Trecho de contagem de beneficios nao encontrado')
text = text.replace(old, new)
text = text.replace('Não recalcula e não exige upload. Puxa o recibo individual que já foi gerado e arquivado na TOPAC RH PRO.', 'VT gerado no módulo de Vale-Transporte entra aqui automaticamente. A sincronização abaixo fica apenas para recibos antigos já arquivados.')
text = text.replace('PUXAR RECIBOS GERADOS', 'SINCRONIZAR RECIBOS ANTIGOS')
text = text.replace('Gere primeiro no módulo normal de VR/VT. Depois clique em “Puxar recibos gerados”.', 'Gere no módulo de VR/VT. Os novos documentos entram automaticamente; use a sincronização apenas para recibos antigos.')
benefit_path.write_text(text, encoding='utf-8')

pdf_path = Path('src/lib/vtPackagePdf.ts')
text = pdf_path.read_text(encoding='utf-8')
old_line = "  doc.text(`Pagamento: ${options.dataPagamento ? dataBr(options.dataPagamento) : '—'}`, right, 34, { align: 'right' });\n"
new_line = "  const receiptPaymentDate = (row as any).dataPagamentoCorrecao || options.dataPagamento;\n  doc.text(`Pagamento: ${receiptPaymentDate ? dataBr(receiptPaymentDate) : '—'}`, right, 34, { align: 'right' });\n"
if old_line not in text:
    raise SystemExit('Linha de data de pagamento do PDF nao encontrada')
text = text.replace(old_line, new_line)
pdf_path.write_text(text, encoding='utf-8')
