import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AdmissionWelcomeSummary } from '@/lib/admissionWelcome';

const money = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: AdmissionWelcomeSummary | null;
  error?: string | null;
  onWhatsApp: () => void;
  onCopy: () => void;
};

const AdmissionWelcomeDialog: React.FC<Props> = ({ open, onOpenChange, summary, error, onWhatsApp, onCopy }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>CANDIDATO APROVADO ✅</DialogTitle>
        <DialogDescription>Confira os dados persistidos antes de abrir o WhatsApp.</DialogDescription>
      </DialogHeader>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      {summary && (
        <div className="space-y-4">
          <div className="grid gap-2 rounded-xl border p-4 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">Nome</span><div className="font-semibold">{summary.candidateName}</div></div>
            <div><span className="text-muted-foreground">Empresa</span><div className="font-semibold">{summary.companyName}</div></div>
            <div><span className="text-muted-foreground">Data de início</span><div className="font-semibold">{summary.dataInicioFormatada}</div></div>
            <div><span className="text-muted-foreground">Dias proporcionais</span><div className="font-semibold">{summary.diasUteis} dias úteis</div></div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">Jornada</span><div className="font-semibold">{summary.jornada}</div></div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4 text-sm">
              <div className="font-bold">Vale-Refeição (VR)</div>
              {summary.vrAtivo ? (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <div>{summary.vrDias} dias úteis × {money(summary.vrValorDiario)}</div>
                  <div className="font-bold text-foreground">Total: {money(summary.vrTotal)}</div>
                </div>
              ) : <div className="mt-2 text-muted-foreground">Não aplicável ao cadastro atual.</div>}
            </div>
            <div className="rounded-xl border p-4 text-sm">
              <div className="font-bold">Vale-Transporte (VT)</div>
              {summary.vtAtivo ? (
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <div>{summary.vtDias} dias úteis × {money(summary.vtValorDiario)}</div>
                  <div className="font-bold text-foreground">Total: {money(summary.vtTotal)}</div>
                </div>
              ) : <div className="mt-2 text-muted-foreground">Não solicitado no cadastro atual.</div>}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Mensagem preparada</div>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed">{summary.message}</pre>
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCopy} disabled={!summary}>COPIAR MENSAGEM</Button>
        <Button type="button" onClick={onWhatsApp} disabled={!summary}>ENVIAR BOAS-VINDAS NO WHATSAPP</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default AdmissionWelcomeDialog;
