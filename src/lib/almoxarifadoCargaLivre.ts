/** Carga livre: cada linha colada vira uma posição independente do catálogo/estoque. */
export type CargaLivreItem = { nome: string; quantidade: number };

export const extrairCargaLivre = (texto: string): CargaLivreItem[] =>
  String(texto || '')
    .split(/\r?\n|;/)
    .map(line => line.replace(/^\s*(?:[-•*]|\d+[.)](?=\s))\s*/, '').trim())
    .filter(Boolean)
    .map(line => {
      // "2 chave", "2x chave", "2 un chave", "2 - chave"; protege "parafuso 6x15".
      const parsed = line.match(/^(\d+(?:[.,]\d{1,3})?)\s*(?:[x×]\s*|(?:un|und|unid|unidades?|pcs|pçs?|peças?)\s+|[-–—:]\s*|\s+)(.+)$/i);
      const quantidade = parsed ? Number(parsed[1].replace(',', '.')) : 1;
      const nome = (parsed ? parsed[2] : line).trim();
      return { nome, quantidade };
    });

export const validarCargaLivre = (texto: string): { items: CargaLivreItem[]; erro?: string } => {
  if (!texto.trim()) return { items: [], erro: 'Cole ou digite pelo menos um material.' };
  if (texto.length > 16000) return { items: [], erro: 'A lista ultrapassa 16.000 caracteres. Divida em duas cargas.' };
  const items = extrairCargaLivre(texto);
  if (!items.length) return { items, erro: 'Nenhum material informado.' };
  if (items.length > 150) return { items, erro: 'Máximo de 150 materiais por carga. Divida a lista.' };
  if (items.some(item => !item.nome || item.nome.length > 400 || !Number.isFinite(item.quantidade) || item.quantidade <= 0 || item.quantidade > 100000)) {
    return { items, erro: 'Revise quantidade e descrição: até 400 caracteres por item e quantidade positiva.' };
  }
  return { items };
};
