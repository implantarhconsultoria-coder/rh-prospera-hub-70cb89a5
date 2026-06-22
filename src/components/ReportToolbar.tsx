import React from 'react';
import { FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitirRelatorioAtual, imprimirRelatorioAtual } from '@/lib/reportActions';

const ReportToolbar: React.FC<{ modulo: string; compact?: boolean }> = ({ modulo, compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-1 no-print">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => emitirRelatorioAtual({ modulo })}
          aria-label="Emitir relatório"
          title="Emitir relatório"
        >
          <FileText className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={imprimirRelatorioAtual}
          aria-label="Imprimir relatório"
          title="Imprimir relatório"
        >
          <Printer className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 no-print">
      <Button size="sm" variant="outline" onClick={() => emitirRelatorioAtual({ modulo })}>
        <FileText className="w-4 h-4 mr-2" /> Emitir relatório
      </Button>
      <Button size="sm" variant="outline" onClick={imprimirRelatorioAtual}>
        <Printer className="w-4 h-4 mr-2" /> Imprimir
      </Button>
    </div>
  );
};

export default ReportToolbar;
