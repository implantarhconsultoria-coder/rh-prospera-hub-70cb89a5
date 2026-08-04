import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type BankingData, parseBankingText } from '@/lib/bankingParser';

export type BankingDataEditorProps = {
  value: BankingData;
  onChange: (next: BankingData) => void;
  defaultHolder?: string;
  defaultCpf?: string;
};

const BankingDataEditor: React.FC<BankingDataEditorProps> = ({ value, onChange, defaultHolder = '', defaultCpf = '' }) => {
  const [pasteText, setPasteText] = useState(value.textoOriginal || '');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [identifiedCount, setIdentifiedCount] = useState(0);

  const update = (field: keyof BankingData, fieldValue: string) => onChange({ ...value, [field]: fieldValue });

  const analyze = () => {
    const result = parseBankingText(pasteText);
    const next = {
      ...value,
      ...result.data,
      titular: result.data.titular || value.titular || defaultHolder,
      cpfTitular: result.data.cpfTitular || value.cpfTitular || defaultCpf,
    };
    onChange(next);
    setWarnings(result.warnings);
    setIdentifiedCount(result.identified.length);
  };

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold"><ClipboardPaste className="h-4 w-4" /> Colar dados bancários</div>
        <p className="mt-1 text-xs text-muted-foreground">Cole o texto recebido do banco ou do colaborador. Revise todos os campos antes de salvar.</p>
      </div>
      <Textarea
        value={pasteText}
        onChange={(event) => setPasteText(event.target.value)}
        placeholder={'Ex.: Banco: Itaú\nAgência: 1234\nConta corrente: 12345-6\nTitular: Nome\nCPF: 000.000.000-00\nChave PIX: email@exemplo.com'}
        className="min-h-32 font-mono text-xs"
      />
      <Button type="button" variant="outline" onClick={analyze} className="gap-2">
        <WandSparkles className="h-4 w-4" /> Analisar e preencher
      </Button>

      {identifiedCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {identifiedCount} campo(s) identificado(s). Revise antes de salvar.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Dados não identificados automaticamente</div>
          {warnings.map((warning) => <div key={warning}>• {warning}</div>)}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div><Label>Banco</Label><Input value={value.banco} onChange={(e) => update('banco', e.target.value)} /></div>
        <div><Label>Código do banco</Label><Input value={value.bancoCodigo} onChange={(e) => update('bancoCodigo', e.target.value)} /></div>
        <div><Label>Agência</Label><Input value={value.agencia} onChange={(e) => update('agencia', e.target.value)} /></div>
        <div><Label>Conta</Label><Input value={value.conta} onChange={(e) => update('conta', e.target.value)} /></div>
        <div><Label>Dígito</Label><Input value={value.digito} onChange={(e) => update('digito', e.target.value)} /></div>
        <div><Label>Tipo de conta</Label><Input value={value.tipoConta} onChange={(e) => update('tipoConta', e.target.value)} /></div>
        <div><Label>Titular</Label><Input value={value.titular} onChange={(e) => update('titular', e.target.value)} /></div>
        <div><Label>CPF do titular</Label><Input value={value.cpfTitular} onChange={(e) => update('cpfTitular', e.target.value)} /></div>
        <div><Label>Chave PIX</Label><Input value={value.chavePix} onChange={(e) => update('chavePix', e.target.value)} /></div>
        <div><Label>Tipo da chave PIX</Label><Input value={value.tipoChavePix} onChange={(e) => update('tipoChavePix', e.target.value)} /></div>
      </div>
    </div>
  );
};

export default BankingDataEditor;
