import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

type Operador = {
  id: string;
  nome: string;
  email?: string | null;
  cargo?: string | null;
  filial?: string | null;
  modulos?: string[];
  ativo: boolean;
  codigo_emitido: boolean;
  codigo_hint?: string | null;
  codigo_emitido_em?: string | null;
};

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

const OperadoresOperacaoPanel: React.FC = () => {
  const { session } = useApp();
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await rpc.rpc('operador_operacao_listar');
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || 'Não foi possível carregar operadores.');
      setOperadores([]);
    } else {
      setOperadores(data.operadores || []);
    }
    setLoading(false);
  };

  useEffect(() => { void carregar(); }, []);

  const enviarCodigo = async (operador: Operador) => {
    if (!session?.access_token) return toast.error('Sessão inválida.');
    setWorking(operador.id);
    try {
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
      toast.success(`Novo código enviado para ${payload.email}.`);
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
            <p className="text-xs text-muted-foreground">Códigos individuais para confirmar ações em computadores compartilhados.</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void carregar()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {operadores.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum operador cadastrado ainda. O cadastro é criado no primeiro acesso autorizado ao módulo.
        </div>
      ) : operadores.map((operador) => (
        <div key={operador.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${operador.ativo ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
              {operador.ativo ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{operador.nome}</div>
              <div className="text-xs text-muted-foreground">
                {[operador.cargo, operador.filial, operador.email].filter(Boolean).join(' • ') || 'Sem dados complementares'}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {operador.codigo_emitido
                  ? `Código emitido • final ${operador.codigo_hint || '--'}`
                  : 'Código ainda não emitido'}
                {operador.modulos?.length ? ` • ${operador.modulos.join(', ')}` : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={working === operador.id || !operador.email} onClick={() => void enviarCodigo(operador)}>
                {working === operador.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {operador.codigo_emitido ? 'Gerar novo código' : 'Enviar código'}
              </Button>
              <Button size="sm" variant={operador.ativo ? 'destructive' : 'default'} disabled={working === operador.id} onClick={() => void alternar(operador)}>
                {operador.ativo ? 'Bloquear' : 'Liberar'}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default OperadoresOperacaoPanel;
