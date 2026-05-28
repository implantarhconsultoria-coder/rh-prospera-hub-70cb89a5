import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { getFirstBusinessDayOfNextMonth } from '@/lib/workingDays';
import type { BenefitReportRow } from '@/lib/benefitReports';

type Tipo = 'vr' | 'vt';

interface Company {
  id: string;
  name: string;
  cnpj: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: Tipo;
  company: Company | undefined;
  competencia: string;
  rows: BenefitReportRow[];
  onPrint?: () => void;
}

const competenciaPt = (competencia: string) => {
  const [y, m] = competencia.split('-');
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return `${meses[Number(m) - 1]} / ${y}`;
};

const RecibosPreviewModal: React.FC<Props> = ({ open, onOpenChange, tipo, company, competencia, rows, onPrint }) => {
  const competenciaLabel = competencia ? competenciaPt(competencia) : '';
  const dataPagamento = competencia ? getFirstBusinessDayOfNextMonth(competencia) : '';
  const sigla = tipo === 'vr' ? 'VR' : 'VT';
  const titulo = tipo === 'vr' ? 'RECIBO DE VALE-REFEIÇÃO' : 'RECIBO DE VALE-TRANSPORTE';
  const beneficio = tipo === 'vr' ? 'Vale-Refeição' : 'Vale-Transporte';
  const totalPaginas = rows.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span>Pré-visualização de recibos — {sigla}</span>
            <span className="text-xs text-muted-foreground font-normal">
              {company?.name} · {competenciaLabel} · {totalPaginas} página(s)
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-muted p-6">
          {rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              Nenhum recibo para pré-visualizar. Gere o relatório primeiro.
            </div>
          ) : (
            <div className="space-y-4 mx-auto" style={{ maxWidth: '210mm' }}>
              {rows.map((r, idx) => (
                <div key={`${r.emp.id}-${idx}`} className="bg-white text-black shadow rounded p-6" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
                  <div className="border-2 border-black p-5">
                    <div className="border-b-2 border-black pb-2 mb-3 flex justify-between items-start">
                      <div>
                        <h1 className="text-base font-bold uppercase">{company?.name}</h1>
                        <p className="text-xs">CNPJ: {company?.cnpj}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p>Competência: <strong>{competenciaLabel}</strong></p>
                        <p>Pagamento: <strong>{dataPagamento}</strong></p>
                      </div>
                    </div>

                    <h2 className="text-center text-base font-bold mb-2 tracking-wide">{titulo}</h2>
                    {r.corrigido && (
                      <p className="text-center text-[11px] text-amber-700 border border-amber-400 bg-amber-50 rounded px-2 py-1 mb-3">
                        Recibo ajustado conforme correção administrativa registrada.
                      </p>
                    )}

                    <table className="w-full text-sm mb-3">
                      <tbody>
                        <tr><td className="py-1 pr-4 font-semibold w-1/3">Funcionário:</td><td className="py-1">{r.emp.name}</td></tr>
                        <tr><td className="py-1 pr-4 font-semibold">Função:</td><td className="py-1">{r.emp.cargo}</td></tr>
                        <tr><td className="py-1 pr-4 font-semibold">Competência:</td><td className="py-1">{competenciaLabel}</td></tr>
                      </tbody>
                    </table>

                    <table className="w-full text-sm mb-3 border border-black/40">
                      <tbody>
                        <tr className="bg-gray-100">
                          <td colSpan={2} className="px-2 py-1 font-bold text-xs uppercase">{beneficio}</td>
                        </tr>
                        <tr><td className="px-2 py-1 font-semibold w-1/2">Dias previstos</td><td className="px-2 py-1">{r.diasPrevistos}</td></tr>
                        <tr><td className="px-2 py-1 font-semibold">Descontos / faltas</td><td className="px-2 py-1">{r.diasDescontados > 0 ? `${r.diasDescontados} — ${r.motivo}` : '—'}</td></tr>
                        <tr><td className="px-2 py-1 font-semibold">Dias considerados</td><td className="px-2 py-1">{r.diasFinais}</td></tr>
                        <tr><td className="px-2 py-1 font-semibold">Valor diário</td><td className="px-2 py-1">{formatCurrency(r.valorDiario)}</td></tr>
                        <tr className="bg-gray-50"><td className="px-2 py-1 font-bold">TOTAL {sigla}</td><td className="px-2 py-1 font-bold">{formatCurrency(r.valorTotal)}</td></tr>
                      </tbody>
                    </table>

                    <div className="mt-8 pt-3 border-t border-gray-400 text-center text-[9px] text-gray-500">{' '}</div>
                  </div>
                  <p className="text-center text-[10px] text-gray-400 mt-2">Página {idx + 1} de {totalPaginas}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-2" /> Fechar
          </Button>
          {onPrint && rows.length > 0 && (
            <Button onClick={onPrint}>
              <Printer className="w-4 h-4 mr-2" /> Gerar PDF / Imprimir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RecibosPreviewModal;
