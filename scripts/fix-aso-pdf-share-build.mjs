import fs from 'node:fs';

const file = 'src/pages/PreCadastroAdmissionalOcrPage.tsx';
let source = fs.readFileSync(file, 'utf8');

if (source.includes('data-topac-aso-pdf-share')) {
  console.log('[ASO PDF share] Already applied.');
  process.exit(0);
}

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`[ASO PDF share] Anchor not found: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  "      `Guia do exame: ${guia.arquivo_url}`,",
  "      'Guia ASO: PDF anexado.',",
  'remove public PDF link from WhatsApp message',
);

replaceOnce(
  "    const numero = telefone.startsWith('55') ? telefone : `55${telefone}`;\n    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener,noreferrer');",
  `    const numero = telefone.startsWith('55') ? telefone : \`55\${telefone}\`;
    try {
      const nomeArquivo = String(guia.nome_arquivo || \`GUIA ASO - \${form.nome || 'FUNCIONARIO'}.pdf\`).replace(/[^a-zA-Z0-9À-ÿ ._()-]/g, '_');
      let pdfBlob: Blob;

      if (lastAsoGuide?.blob) {
        pdfBlob = lastAsoGuide.blob;
      } else {
        const respostaPdf = await fetch(guia.arquivo_url, { cache: 'no-store' });
        if (!respostaPdf.ok) throw new Error(\`Não foi possível carregar o PDF da guia (\${respostaPdf.status}).\`);
        pdfBlob = await respostaPdf.blob();
      }

      const arquivoPdf = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      const podeCompartilharArquivo = typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [arquivoPdf] }));

      if (podeCompartilharArquivo) {
        await nav.share({
          title: \`Guia ASO - \${form.nome || ''}\`,
          text: mensagem,
          files: [arquivoPdf],
        });
        toast.success('PDF da guia ASO aberto para envio.');
        return;
      }

      const blobUrl = URL.createObjectURL(arquivoPdf);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      try { await navigator.clipboard?.writeText(mensagem); } catch { /* sem clipboard */ }
      window.open(\`https://wa.me/\${numero}?text=\${encodeURIComponent(mensagem)}\`, '_blank', 'noopener,noreferrer');
      toast.info('O PDF foi baixado. Anexe o arquivo no WhatsApp aberto.');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      toast.error(error?.message || 'Não foi possível preparar o PDF para envio.');
    }
    void 'data-topac-aso-pdf-share';`,
  'share actual PDF file',
);

fs.writeFileSync(file, source);
console.log('[ASO PDF share] Real PDF sharing applied; public link removed from message.');
