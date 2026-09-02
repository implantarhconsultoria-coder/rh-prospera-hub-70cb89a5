import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { analisarPlanilhaAlmoxarifado, ImportPreview } from '@/lib/almoxarifadoImportPreview';
import { toast } from 'sonner';

export default function AlmoxarifadoImportPreview() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const analisar = async (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      toast.error('Selecione a planilha oficial em XLSX/XLSM.');
      return;
    }
    setLoading(true);
    try {
      const resultado = await analisarPlanilhaAlmoxarifado(file);
      setPreview(resultado);
      toast.success('Planilha analisada. Nenhum dado foi gravado no banco.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível analisar a planilha. Nenhum dado foi gravado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Importar Estoque — Pré-análise</h2>
          <p className="text-xs text-muted-foreground mt-1">Fase segura: lê e confere a planilha, mas não grava itens, entradas ou saídas.</p>
        </div>
        <label>
          <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => analisar(e.target.files?.[0])} />
          <Button asChild variant="outline" disabled={loading}>
            <span>{loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}Selecionar planilha</span>
          </Button>
        </label>
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Produtos" value={preview.produtos} />
            <Metric label="Entradas" value={preview.entradas} />
            <Metric label="Saídas" value={preview.saidas} />
            <Metric label="Divergências" value={preview.divergencias.length} danger={preview.divergencias.length > 0} />
          </div>

          <div className="border rounded-lg p-4 text-xs space-y-2">
            <p><strong>Arquivo:</strong> {preview.arquivo}</p>
            <p><strong>Abas:</strong> {preview.abasEncontradas.length}/10 encontradas</p>
            <p><strong>Códigos duplicados:</strong> {preview.codigosDuplicados.length}</p>
            <p><strong>Registros sem código:</strong> {preview.registrosSemCodigo}</p>
            <p><strong>Fórmulas detectadas e ignoradas:</strong> {preview.formulasIgnoradas}</p>
            <p><strong>#REF! detectados e ignorados:</strong> {preview.errosRefIgnorados}</p>
          </div>

          {preview.abasAusentes.length > 0 && (
            <div className="border border-amber-500/40 rounded-lg p-3 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /><span>Abas ausentes: {preview.abasAusentes.join(', ')}</span></div>
          )}

          {preview.divergencias.length > 0 && (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-muted/50"><th className="p-2 text-left">Código</th><th className="p-2 text-right">Saldo informado</th><th className="p-2 text-right">Saldo calculado</th><th className="p-2 text-right">Diferença</th></tr></thead>
                <tbody>{preview.divergencias.slice(0, 100).map(d => <tr key={d.codigo} className="border-t"><td className="p-2 font-medium">{d.codigo}</td><td className="p-2 text-right">{d.saldoInformado}</td><td className="p-2 text-right">{d.saldoCalculado}</td><td className="p-2 text-right">{d.divergencia}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2">
            {preview.prontoParaConfirmacao ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            <Badge variant={preview.prontoParaConfirmacao ? 'default' : 'secondary'}>{preview.prontoParaConfirmacao ? 'PRONTO PARA CONFERÊNCIA FINAL' : 'REVISAR ANTES DE IMPORTAR'}</Badge>
          </div>

          <Button disabled title="A importação real permanece bloqueada nesta fase">Confirmar importação — BLOQUEADO NA FASE 1</Button>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="border rounded-lg p-3"><p className="text-[11px] text-muted-foreground uppercase">{label}</p><p className={`text-xl font-bold ${danger ? 'text-destructive' : ''}`}>{value}</p></div>;
}
