import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  open: boolean;
  title?: string;
  description?: string;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (codigo: string) => void | Promise<void>;
};

const OperadorCodeDialog: React.FC<Props> = ({
  open,
  title = 'Identificar operador',
  description = 'Informe seu código individual para confirmar esta operação.',
  loading = false,
  onOpenChange,
  onConfirm,
}) => {
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    if (!open) setCodigo('');
  }, [open]);

  const confirmar = async () => {
    const value = codigo.replace(/\D/g, '').slice(0, 6);
    if (value.length !== 6 || loading) return;
    await onConfirm(value);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirmar();
            }}
            className="h-14 text-center text-2xl font-black tracking-[0.35em]"
          />
          <p className="text-center text-xs text-muted-foreground">
            O código identifica quem executou a ação. Data e hora serão registradas automaticamente.
          </p>
          <Button className="h-12 w-full font-bold" disabled={codigo.length !== 6 || loading} onClick={() => void confirmar()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Confirmar operação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OperadorCodeDialog;
