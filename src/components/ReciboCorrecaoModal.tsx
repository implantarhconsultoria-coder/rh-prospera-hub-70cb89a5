import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import type { ReciboCorrecao } from '@/hooks/useRecibosCorrecoes';
import type { BenefitReportRow } from '@/lib/benefitReports';
import { formatCurrency } from '@/lib/calculations';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: 'vr' | 'vt';
  companyId: string;
  companyName: string;
  competencia: string;
  row: BenefitReportRow | null;
  existing?: ReciboCorrecao;
  defaultDataPagamento: string;
  onSave: (payload: any) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
};

const MOTIVOS = [
  'Erro no valor pago',
  'Diferença identificada após fechamento',
  'Ajuste autorizado',
  'Pagamento complementar',
  'Desconto lançado incorretamente',
  'Outro',
];

const ReciboCorrecaoModal: React.FC<Props> = ({
  open, onOpenChange, tipo, companyId, companyName, competencia, row, existing, defaultDataPagamento, onSave, onRemove,
}) => {
  const [diasFinais, setDiasFinais] = useState<number>(0);
  const [valorDiario, setValorDiario] = useState<number>(0);
  const [valorTotal, setValorTotal] = useState<number>(0);
  const [motivo, setMotivo] = useState<string>('');
  const [observacao, setObservacao] = useState<string>('');
  const [dataPagamento, setDataPagamento] = useState<string>('');
  const [autoTotal, setAutoTotal] = useState(true);

  useEffect(() => {
    if (!row) return;
    setDiasFinais(existing?.dias_finais_corrigido ?? row.diasFinais);
    setValorDiario(Number(existing?.valor_diario_corrigido ?? row.valorDiario));
    setValorTotal(Number(existing?.valor_total_corrigido ?? row.valorTotal));
    setMotivo(existing?.motivo ?? '');
    setObservacao(existing?.observacao ?? '');
    setDataPagamento(existing?.data_pagamento ?? defaultDataPagamento);
    setAutoTotal(true);
  }, [row, existing, defaultDataPagamento]);

  useEffect(() => {
    if (autoTotal) {
      setValorTotal(Math.round(diasFinais * valorDiario * 100) / 100);
    }
  }, [diasFinais, valorDiario, autoTotal]);

  if (!row) return null;

  const handleSubmit = async () => {
    if (!motivo.trim()) { toast.error('Motivo é obrigatório'); return; }
    try {
      await onSave({
        tipo, company_id: companyId, funcionario_id: row.emp.id, competencia,
        valor_diario_original: row.valorDiario,
        dias_finais_original: row.diasFinais,
        valor_total_original: row.valorTotal,
        valor_diario_corrigido: valorDiario,
        dias_finais_corrigido: diasFinais,
        valor_total_corrigido: valorTotal,
        motivo: motivo.trim(),
        observacao: observacao.trim() || null,
        data_pagamento: dataPagamento || null,
      });
      toast.success('Correção registrada');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    }
  };

  const handleRemove = async () => {
    if (!existing || !onRemove) return;
    if (!confirm('Remover correção e voltar ao valor original?')) return;
    try {
      await onRemove(existing.id);
      toast.success('Correção removida');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Corrigir recibo de {tipo.toUpperCase()}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><Label className="text-xs text-muted-foreground">Funcionário</Label><p className="font-medium">{row.emp.name}</p></div>
          <div><Label className="text-xs text-muted-foreground">Função</Label><p>{row.emp.cargo}</p></div>
          <div><Label className="text-xs text-muted-foreground">Empresa</Label><p>{companyName}</p></div>
          <div><Label className="text-xs text-muted-foreground">Competência</Label><p>{competencia}</p></div>
          <div><Label className="text-xs text-muted-foreground">Dias previstos</Label><p>{row.diasPrevistos}</p></div>
          <div><Label className="text-xs text-muted-foreground">Faltas/descontos</Label><p>{row.diasDescontados > 0 ? `${row.diasDescontados} (${row.motivo})` : '—'}</p></div>
          <div><Label className="text-xs text-muted-foreground">Valor original</Label><p className="font-mono">{formatCurrency(row.valorTotal)}</p></div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-2">
          <div>
            <Label>Dias finais *</Label>
            <Input type="number" min={0} value={diasFinais} onChange={e => setDiasFinais(Number(e.target.value))} />
          </div>
          <div>
            <Label>Valor diário *</Label>
            <Input type="number" step="0.01" min={0} value={valorDiario} onChange={e => setValorDiario(Number(e.target.value))} />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              Valor total *
              <button type="button" onClick={() => setAutoTotal(a => !a)} className="text-[10px] text-primary underline">
                {autoTotal ? 'manual' : 'auto'}
              </button>
            </Label>
            <Input type="number" step="0.01" min={0} value={valorTotal} disabled={autoTotal}
              onChange={e => setValorTotal(Number(e.target.value))} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <Label>Motivo *</Label>
            <select value={MOTIVOS.includes(motivo) ? motivo : (motivo ? 'Outro' : '')}
              onChange={e => setMotivo(e.target.value === 'Outro' ? '' : e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="">Selecione…</option>
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(motivo === '' || !MOTIVOS.includes(motivo)) && (
              <Input className="mt-2" placeholder="Descreva o motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
            )}
          </div>
          <div>
            <Label>Data de pagamento</Label>
            <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
          </div>
        </div>

        <div className="mt-2">
          <Label>Observação (opcional)</Label>
          <Textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} />
        </div>

        <DialogFooter className="flex justify-between gap-2 sm:justify-between">
          <div>
            {existing && onRemove && (
              <Button variant="destructive" onClick={handleRemove}>Remover correção</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}>Salvar correção</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReciboCorrecaoModal;
