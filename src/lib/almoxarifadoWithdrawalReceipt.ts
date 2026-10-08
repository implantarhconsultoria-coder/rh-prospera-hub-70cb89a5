export type WithdrawalReceipt = {
  id: string;
  protocol: string;
  createdAt: string | null;
  employee: string;
  company: string;
  responsible: string;
  note: string;
  items: { codigo: string; nome: string; quantidade: number }[];
};

const escape = (value: string) => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export const withdrawalReceiptHtml = (receipt: WithdrawalReceipt) => {
  const date = receipt.createdAt ? new Date(receipt.createdAt) : null;
  const validDate = date && !Number.isNaN(date.getTime());
  const options = { timeZone: 'America/Sao_Paulo' };
  const day = validDate ? date.toLocaleDateString('pt-BR', options) : 'Indisponível';
  const time = validDate ? date.toLocaleTimeString('pt-BR', options) : 'Indisponível';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de retirada ${escape(receipt.protocol)}</title>
<style>
@page { size: A4 portrait; margin: 15mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #111; font-family: Arial, sans-serif; font-size: 12px; color-scheme: light; }
main { max-width: 180mm; margin: 0 auto; padding: 8mm 0; }
header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 16px; }
h1 { font-size: 18px; margin: 16px 0 0; } .brand { font-size: 20px; font-weight: bold; }
p { line-height: 1.6; overflow-wrap: anywhere; } .metadata { margin: 20px 0; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
th, td { border: 1px solid #aaa; padding: 10px; text-align: left; overflow-wrap: anywhere; }
th { background: #f4f4f4; } th:first-child { width: 22%; } th:last-child { width: 18%; }
thead { display: table-header-group; } tr { break-inside: avoid; }
.note { white-space: pre-wrap; } .signatures { display: flex; gap: 12mm; margin-top: 28mm; break-inside: avoid; }
.signature { width: 50%; border-top: 1px solid #111; text-align: center; padding-top: 8px; overflow-wrap: anywhere; }
.signature strong { display: block; font-size: 11px; margin-bottom: 8px; }
@media screen { main { padding: 12mm 6mm; } }
</style></head><body><main>
<header><div class="brand">TOPAC RH PRO</div><div>ALMOXARIFADO</div><h1>FICHA DE RETIRADA DE MATERIAIS</h1></header>
<div class="metadata"><p><b>PROTOCOLO:</b> ${escape(receipt.protocol)}<br>
<b>DATA:</b> ${day} &nbsp; <b>HORA:</b> ${time}<br>
<b>FUNCIONÁRIO:</b> ${escape(receipt.employee)}<br>
<b>EMPRESA:</b> ${escape(receipt.company)}<br>
<b>RESPONSÁVEL PELA ENTREGA:</b> ${escape(receipt.responsible)}</p></div>
<table><thead><tr><th>Código</th><th>Material</th><th>Quantidade</th></tr></thead><tbody>${receipt.items.map(item => `<tr><td>${escape(item.codigo)}</td><td>${escape(item.nome)}</td><td>${item.quantidade.toLocaleString('pt-BR')}</td></tr>`).join('')}</tbody></table>
${receipt.note ? `<p class="note"><b>OBSERVAÇÃO:</b> ${escape(receipt.note)}</p>` : ''}
<div class="signatures"><div class="signature"><strong>ASSINATURA DO FUNCIONÁRIO</strong>${escape(receipt.employee)}</div>
<div class="signature"><strong>RESPONSÁVEL PELA ENTREGA</strong>${escape(receipt.responsible)}</div></div>
</main></body></html>`;
};
