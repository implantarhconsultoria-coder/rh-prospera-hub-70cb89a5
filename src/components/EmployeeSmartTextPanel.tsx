import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  mergeEmployeeSmartData,
  parseEmployeeTextLocally,
  type EmployeeSmartData,
} from '@/lib/smartTextParser';
import { toast } from 'sonner';

type EmployeeSmartTextPanelProps = {
  onApply: (data: EmployeeSmartData) => boolean | void | Promise<boolean | void>;
  compact?: boolean;
  targetName?: string;
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

const displayFields = (data: EmployeeSmartData) => [
  ['Nome', data.nome],
  ['CPF', data.cpf],
  ['RG', data.rg],
  ['Cargo', data.cargo],
  ['Admissão', data.dataAdmissao],
  ['Telefone', data.telefone || data.celular],
  ['E-mail', data.email],
  ['Endereço', data.endereco],
  ['Banco', data.banking.banco],
  ['Agência', data.banking.agencia],
  ['Conta', [data.banking.conta, data.banking.digito].filter(Boolean).join('-')],
  ['PIX', data.banking.chavePix],
].filter(([, value]) => Boolean(value));

const EmployeeSmartTextPanel: React.FC<EmployeeSmartTextPanelProps> = ({ onApply, compact = false, targetName }) => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<EmployeeSmartData | null>(null);

  const analyze = async () => {
    const local = parseEmployeeTextLocally(text);
    if (!text.trim()) {
      setWarnings(local.warnings);
      setPreview(null);
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
    } finally {
      const merged = mergeEmployeeSmartData(local.data, remote);
      setPreview(merged);
      setWarnings(local.warnings);
      setLoading(false);
    }
  };

  const applyPreview = async () => {
    if (!preview) return;
    setApplying(true);
    try {
      const result = await onApply(preview);
      if (result === false) return;
      setPreview(null);
      setText('');
      toast.success('Dados aplicados. Confira o cadastro antes de sair.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aplicar os dados.');
    } finally {
      setApplying(false);
    }
  };

  const fields = preview ? displayFields(preview) : [];

  return (
    <div className={`rounded-xl border border-primary/20 bg-primary/5 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Leitura Inteligente de Texto</h3>
          <p className="text-xs text-muted-foreground">Primeiro o sistema identifica e mostra uma prévia. Nada é aplicado sem sua confirmação.</p>
        </div>
      </div>
      {targetName && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          Funcionário de destino: <strong>{targetName}</strong>
        </div>
      )}
      <textarea
        value={text}
        onChange={(event) => { setText(event.target.value); setPreview(null); }}
        placeholder="Ex.: Nome, CPF, RG, cargo, salário, admissão, telefone, e-mail, endereço e dados bancários..."
        className={`w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm ${compact ? 'min-h-24' : 'min-h-32'}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => void analyze()} disabled={loading || applying}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? 'Lendo texto...' : preview ? 'Analisar novamente' : 'Ler texto'}
        </Button>
        {!!warnings.length && (
          <span className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {warnings.join(' ')}
          </span>
        )}
      </div>

      {preview && (
        <div className="space-y-3 rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Prévia dos campos identificados
          </div>
          {fields.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="rounded-md border px-2.5 py-2 text-xs">
                  <span className="block text-muted-foreground">{label}</span>
                  <strong className="break-words">{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-700">Nenhum campo confiável foi identificado. Ajuste o texto e analise novamente.</p>
          )}
          <Button type="button" onClick={() => void applyPreview()} disabled={!fields.length || applying}>
            {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {applying ? 'Aplicando...' : targetName ? `Confirmar e aplicar em ${targetName}` : 'Confirmar e preencher campos'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default EmployeeSmartTextPanel;
