import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCw, Save, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

type Operador = {
  id: string;
  nome: string;
  email?: string | null;
  cargo?: string | null;
  filial?: string | null;
  empresa_id?: string | null;
  empresa_nome?: string | null;
  cpf_cadastrado?: boolean;
  cpf_final?: string | null;
  modulos?: string[];
  ativo: boolean;
  codigo_emitido: boolean;
  codigo_hint?: string | null;
  codigo_emitido_em?: string | null;
  origem_cadastro?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

const OperadoresOperacaoPanel: React.FC = () => {
  const { session } = useApp();
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await rpc.rpc('operador_operacao_listar');
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || 'Não foi possível carregar operadores.');
      setOperadores([]);
    } else {
      const rows = (data.operadores || []) as Operador[];
      setOperadores(rows);
      setEmails(Object.fromEntries(rows.map((o) => [o.id, o.email || ''])));
    }
    setLoading(false);
  };

  useEffect(() => { void carregar(); }, []);

  const salvarEmail = async (operador: Operador) => {
    const email = String(emails[operador.id] || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return toast.error('Informe um e-mail corporativo válido.');

    setWorking(operador.id);
    const { data, error } = await rpc.rpc('operador_operacao_definir_email', {
      p_operador_id: operador.id,
      p_email: email,
    });
    setWorking(null);

    if (error || !data?.ok) return toast.error(data?.error || error?.message || 'Não foi possível salvar o e-mail.');
    toast.success('E-mail corporativo vinculado ao operador.');
    await carregar();
  };

  const enviarCodigo = async (operador: Operador) => {
    if (!session?.access_token) return toast.error('Sessão inválida.');
    if (!String(emails[operador.id] || operador.email || '').trim()) return toast.error('Cadastre primeiro o e-mail corporativo.');

    setWorking(operador.id);
    try {
      if ((emails[operador.id] || '').trim().toLowerCase() !== (operador.email || '').trim().toLowerCase()) {
        const { data, error } = await rpc.rpc('operador_operacao_definir_email', {
          p_operador_id: operador.id,
          p_email: String(emails[operador.id] || '').trim().toLowerCase(),
        });
        if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Não foi possível salvar o e-mail.');
      }

      const response = await fetch('/api/operator-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ operador_id: operador.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'Falha ao emitir código.');
      toast.success(`Código individual enviado para ${payload.email}.`);
      await carregar();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao enviar código.');
    } finally {
      setWorking(null);
    }
  };

  const alternar = async (operador: Operador) => {
    setWorking(operador.id);
    const { data, error } = await rpc.rpc('operador_operacao_definir_ativo', {
      p_operador_id: operador.id,
      p_ativo: !operador.ativo,
    });
    setWorking(null);
    if (error || !data?.ok) return toast.error(data?.error || error?.message || 'Não foi possível alterar o operador.');
    toast.success(!operador.ativo ? 'Operador liberado.' : 'Operador bloqueado.');
    await carregar();
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold">Operadores</h2>
            <p className="text-xs text-muted-foreground">Pré-cadastro do funcionário + e-mail corporativo + código individual de operação.</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void carregar()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {operadores.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum operador cadastrado.
        </div>
      ) : operadores.map((operador) => {
        const emailDraft = emails[operador.id] || '';
        const emailChanged = emailDraft.trim().toLowerCase() !== String(operador.email || '').trim().toLowerCase();

        return (
          <div key={operador.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${operador.ativo ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                {operador.ativo ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
              </span>

              <div className="min-w-[220px] flex-1">
                <div className="font-bold">{operador.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {[operador.cargo, operador.empresa_nome, operador.filial].filter(Boolean).join(' • ') || 'Sem dados complementares'}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {operador.cpf_cadastrado
                    ? `CPF do cadastro confirmado • final ${operador.cpf_final || '----'}`
                    : 'CPF não localizado no cadastro'}
                  {operador.modulos?.length ? ` • ${operador.modulos.join(', ')}` : ''}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {operador.codigo_emitido
                    ? `Código emitido • final ${operador.codigo_hint || '--'}`
                    : 'Código ainda não emitido'}
                </div>
              </div>

              <div className="w-full space-y-2 lg:w-[420px]">
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="E-mail corporativo"
                    value={emailDraft}
                    onChange={(event) => setEmails((current) => ({ ...current, [operador.id]: event.target.value }))}
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    title="Salvar e-mail"
                    disabled={working === operador.id || !emailChanged}
                    onClick={() => void salvarEmail(operador)}
                  >
                    {working === operador.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working === operador.id || !emailDraft.trim()}
                    onClick={() => void enviarCodigo(operador)}
                  >
                    {working === operador.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    {operador.codigo_emitido ? 'Gerar novo código' : 'Enviar código'}
                  </Button>
                  <Button
                    size="sm"
                    variant={operador.ativo ? 'destructive' : 'default'}
                    disabled={working === operador.id}
                    onClick={() => void alternar(operador)}
                  >
                    {operador.ativo ? 'Bloquear' : 'Liberar'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OperadoresOperacaoPanel;
