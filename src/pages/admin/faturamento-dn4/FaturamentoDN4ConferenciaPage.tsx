import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, ListChecks, RotateCcw } from 'lucide-react';
import { fmtBRL, statusMeta } from '@/lib/dn4';

const FaturamentoDN4ConferenciaPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('faturamento_dn4' as any)
      .select('*')
      .in('status', ['pendente', 'em_conferencia'])
      .order('created_at', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('faturamento_dn4' as any).update({ status } as any).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Status atualizado');
    carregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Conferência</h2>
        <span className="text-xs text-muted-foreground">{rows.length} aguardando ação</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nada para conferir agora.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const m = statusMeta(r.status);
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.cliente_nome} <span className="text-muted-foreground font-normal">— {r.descricao}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {r.empresa_filial || '—'} • Pedido {r.numero_pedido || '—'} • CNPJ {r.cnpj_cpf || '—'}
                    </p>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded ${m.cls}`}>{m.label}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 text-xs">
                  <div><span className="text-muted-foreground">Quantidade:</span> <strong>{r.quantidade}</strong></div>
                  <div><span className="text-muted-foreground">Unitário:</span> <strong>{fmtBRL(r.valor_unitario)}</strong></div>
                  <div><span className="text-muted-foreground">Total:</span> <strong className="text-primary">{fmtBRL(r.valor_total)}</strong></div>
                  <div><span className="text-muted-foreground">Vencimento:</span> <strong>{r.vencimento || '—'}</strong></div>
                  <div><span className="text-muted-foreground">Pagamento:</span> <strong>{r.forma_pagamento || '—'}</strong></div>
                </div>
                {r.observacoes && <p className="text-xs text-muted-foreground mt-2 italic">"{r.observacoes}"</p>}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                  {r.status === 'pendente' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'em_conferencia')}>
                      Enviar p/ conferência
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setStatus(r.id, 'emitido')}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirmar e Emitir
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'finalizado')}>
                    Finalizar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'com_erro')}>
                    <AlertTriangle className="w-4 h-4 mr-1" /> Marcar erro
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'pendente')}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Voltar p/ pendente
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FaturamentoDN4ConferenciaPage;
