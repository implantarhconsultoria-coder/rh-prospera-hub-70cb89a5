# Correção impressão PDF — 12/08/2026

A impressão de documentos vinculados ao Protocolo passou a carregar o PDF.js com suporte explícito a WASM, CMaps, fontes padrão e XFA. Isso evita páginas brancas em CRLVs que usam decodificadores de imagem não inicializados no caminho simples do PDF.js.

Escopo: somente renderização usada para converter as páginas dos PDFs vinculados em imagens antes da impressão.
