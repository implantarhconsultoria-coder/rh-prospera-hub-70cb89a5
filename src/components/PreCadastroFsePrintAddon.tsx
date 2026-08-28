import { Printer } from 'lucide-react';

const FSE_2026_PDF = '/formularios/Ficha_Solicitacao_Emprego_TOPAC_FSE-2026.pdf';

const PreCadastroFsePrintAddon = () => {
  const abrirFicha = () => {
    const popup = window.open(FSE_2026_PDF, '_blank', 'noopener,noreferrer');
    if (!popup) window.location.href = FSE_2026_PDF;
  };

  return (
    <button
      type="button"
      onClick={abrirFicha}
      className="fixed bottom-6 right-6 z-[80] inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
      title="Abrir a ficha TOPAC FSE-2026 pronta para impressão"
    >
      <Printer className="h-4 w-4" />
      Imprimir ficha FSE-2026
    </button>
  );
};

export default PreCadastroFsePrintAddon;
