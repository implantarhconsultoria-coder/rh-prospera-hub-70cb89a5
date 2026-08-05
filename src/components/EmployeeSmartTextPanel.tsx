import React, { useState } from 'react';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  mergeEmployeeSmartData,
  parseEmployeeTextLocally,
  type EmployeeSmartData,
} from '@/lib/smartTextParser';
import { toast } from 'sonner';

type EmployeeSmartTextPanelProps = {
  onApply: (data: EmployeeSmartData) => void | Promise<void>;
  compact?: boolean;
};

const normalizeRemoteEmployee = (value: any): Partial<EmployeeSmartData> => ({
  nome: value?.nome || value?.name,
  cpf: value?.cpf,
  rg: value?.rg,
  cargo: value?.cargo || value?.funcao,
  salarioBase: value?.salarioBase || value?.salario_base || value?.salario,
  dataAdmissao: value?.dataAdmissao || value?.data_admissao,
  telefone: value?.telefone,
  celular: value?.celular || value?.whatsapp,
  email: value?.email,
  endereco: value?.endereco,
  banking: value?.banking || value?.dados_bancarios,
});

const EmployeeSmartTextPanel: React.FC<EmployeeSmartTextPanelProps> = ({ onApply, compact = false }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const analyze = async () => {
    const local = parseEmployeeTextLocally(text);
    if (!text.trim()) {
      setWarnings(local.warnings);
      toast.error('Cole a mensagem com os dados do funcionário.');
      return;
    }

    setLoading(true);
    let remote: Partial<EmployeeSmartData> | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('parse-text', {
        body: { type: 'funcionario', text },
      });
      if (!error) remote = normalizeRemoteEmployee(data?.data || data);
    } catch (error) {
      console.warn('[funcionarios] leitura remota indisponível; parser local mantido.', error);
    }

    const merged = mergeEmployeeSmartData(local.data, remote);
    await onApply(merged);
    const finalWarnings = parseEmployeeTextLocally([
      `Nome: ${merged.nome}`,
      `CPF: ${merged.cpf}`,
      `Cargo: ${merged.cargo}`,
      `Data de admissão: ${merged.dataAdmissao}`,
    ].join('\n')).warnings;
    setWarnings(finalWarnings);
    setLoading(false);
    toast.success('Campos preenchidos. Revise as informações antes de salvar.');
  };

  return (
    <div className={`rounded-xl border border-primary/20 bg-primary/5 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Leitura Inteligente de Texto</h3>
          <p className="text-xs text-muted-foreground">Cole uma mensagem, e-mail ou texto bruto. O preenchimento permanece editável antes de salvar.</p>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ex.: Nome, CPF, RG, cargo, salário, admissão, telefone, e-mail, endereço e dados bancários..."
        className={`w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm ${compact ? 'min-h-24' : 'min-h-32'}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void analyze()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? 'Lendo texto...' : 'Ler texto e preencher'}
        </Button>
        {!!warnings.length && (
          <span className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {warnings.join(' ')}
          </span>
        )}
      </div>
    </div>
  );
};

export default EmployeeSmartTextPanel;
