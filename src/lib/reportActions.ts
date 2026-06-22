const cleanText = (value?: string | null) => String(value || '').replace(/\s+/g, ' ').trim();

const getCurrentTitle = () => {
  const heading = document.querySelector('main h1, [role="main"] h1, h1');
  return cleanText(heading?.textContent) || cleanText(document.title) || 'Relatorio TOPAC';
};

const collectStyles = () => Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
  .map(node => node.outerHTML)
  .join('\n');

const getReportContent = () => {
  const main = document.querySelector('main');
  return main?.innerHTML || document.body.innerHTML;
};

export const emitirRelatorioAtual = ({ modulo, titulo }: { modulo: string; titulo?: string }) => {
  const reportTitle = cleanText(titulo) || getCurrentTitle();
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    window.print();
    return;
  }

  const emittedAt = new Date().toLocaleString('pt-BR');
  printWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${reportTitle}</title>
  ${collectStyles()}
  <style>
    body { background: #fff !important; color: #111827 !important; padding: 24px; }
    .no-print, aside, nav, button, input, select, textarea, [role="dialog"] { display: none !important; }
    main, .card-premium { box-shadow: none !important; }
    .report-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #d1d5db; padding-bottom: 14px; margin-bottom: 18px; }
    .report-header h1 { font-size: 22px; margin: 0 0 4px; }
    .report-header p { margin: 0; font-size: 12px; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5e7eb; }
    @media print {
      body { padding: 0; }
      .report-header { break-after: avoid; }
      .card-premium, table, tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="report-header">
    <div>
      <h1>${reportTitle}</h1>
      <p>TOPAC · ${cleanText(modulo)}</p>
    </div>
    <p>Emitido em ${emittedAt}</p>
  </header>
  <main>${getReportContent()}</main>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 500);
};

export const imprimirRelatorioAtual = () => {
  window.print();
};
