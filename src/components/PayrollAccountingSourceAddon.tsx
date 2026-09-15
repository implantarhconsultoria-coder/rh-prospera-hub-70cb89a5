import { useEffect } from 'react';

const rewrite = () => {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  for (const button of buttons) {
    if ((button.textContent || '').trim().toUpperCase().includes('SUBIR PDF SEQUENCIAL')) {
      button.style.display = 'none';
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
    }
  }

  const labels = Array.from(document.querySelectorAll<HTMLElement>('p,h1,h2,h3,span,div'));
  for (const el of labels) {
    const text = (el.textContent || '').trim();
    if (text === 'Fechamento → Pagamento') {
      el.textContent = 'Contabilidade → Assinatura Digital';
    }
    if (text.includes('Recibos e assinatura eletrônica · comprovante opcional')) {
      el.textContent = 'Documentos recebidos da Contabilidade';
    }
    if (text.startsWith('Empresa isolada:') && text.includes('Envie os RECIBOS')) {
      const company = text.match(/^Empresa isolada:\s*([^\.]+)/i)?.[1]?.trim() || 'empresa selecionada';
      el.textContent = `Empresa: ${company}. Os PDFs chegam automaticamente da Contabilidade. Eles aparecem aqui para sua conferência, mas ficam bloqueados para o funcionário até o seu OK final na Central da Contabilidade.`;
    }
    if (text === 'HOLERITE PENDENTE') {
      el.textContent = 'AGUARDANDO SUA AUTORIZAÇÃO';
    }
    if (text === 'Aguardando documento') {
      el.textContent = 'BLOQUEADO ATÉ SEU OK';
    }
  }
};

export default function PayrollAccountingSourceAddon() {
  useEffect(() => {
    if (window.location.pathname !== '/admin/assinatura-digital') return;
    rewrite();
    const observer = new MutationObserver(() => rewrite());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setInterval(rewrite, 1200);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
