import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Loader2, MapPin, Package, UserRound, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import OperadorCodeDialog from '@/components/OperadorCodeDialog';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { toast } from 'sonner';

const rpc = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
};

type Props = {
  chamado: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => void | Promise<void>;
};

const EVENT_LABEL: Record<string, string> = {
  criado: 'Ocorrência criada',
  atribuido: 'Enviado ao mecânico',
  editado: 'Ocorrência alterada',
  aceitar: 'Ocorrência aceita',
  deslocamento: 'Mecânico a caminho',
  chegada: 'Chegada ao cliente',
  iniciar: 'Serviço iniciado',
  adicional_registrado: 'Serviço adicional informado',
  adicional_visualizado: 'Adicional visualizado pelo Operacional',
  finalizar: 'Serviço concluído',
  cancelado: 'Ocorrência cancelada',
};

const dt = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—';

const OperacionalChamadoDetailDialog: React.FC<Props> = ({ chamado, open, onOpenChange, onRefresh }) => {
  const { developerMode } = useDeveloperMode();
  const [loading, setLoading] = useState(false);
  const [detalhe, setDetalhe] = useState<any>({ eventos: [], adicionais: [], materiais: [] });
  const [codigoOpen, setCodigoOpen] = useState(false);
  const [adicionalAlvo, setAdicionalAlvo] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const carregar = async () => {
    if (!chamado?.id) return;
    setLoading(true);
    const { data, error } = await rpc.rpc('operacional_chamado_detalhe', { p_chamado_id: chamado.id });
    setLoading(false);
    if (error || !data?.ok) {
      toast.error(data?.error || error?.message || 'Não foi possível carregar o histórico.');
      return;
    }
    setDetalhe(data);
  };

  useEffect(() => {
    if (open && chamado?.id) void carregar();
  }, [open, chamado?.id]);

  const marcarVisto = async (codigo: string) => {
    if (!adicionalAlvo) return;
    setSaving(true);
    const { data, error } = await rpc.rpc('operacional_marcar_adicional_visualizado', {
      p_codigo_operador: codigo,
      p_adicional_id: adicionalAlvo.id,
    });
    setSaving(false);
    if (error || !data?.ok) return toast.error(data?.error || error?.message || 'Código inválido ou operação não autorizada.');
    toast.success('Adicional confirmado pelo Operacional.');
    setCodigoOpen(false);
    setAdicionalAlvo(null);
    await carregar();
    await onRefresh?.();
  };

  const materiaisDoAdicional = (id: string) => (detalhe.materiais || []).filter((m: any) => m.adicional_id === id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ocorrência {chamado?.numero ? `#${chamado.numero}` : ''} • {chamado?.cliente || 'Cliente'}
            </DialogTitle>
          </DialogHeader>

          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                <div><span className="text-[11px] uppercase text-muted-foreground">Solicitante no cliente</span><p className="font-semibold">{chamado?.solicitante_nome || 'Não informado'}</p><p className="text-xs text-muted-foreground">{chamado?.solicitante_contato || ''}</p></div>
                <div><span className="text-[11px] uppercase text-muted-foreground">Registrado por</span><p className="font-semibold">{chamado?.operador_abertura_nome || 'Registro anterior ao novo fluxo'}</p><p className="text-xs text-muted-foreground">{dt(chamado?.created_at)}</p></div>
                <div><span className="text-[11px] uppercase text-muted-foreground">Local</span><p className="font-semibold">{chamado?.local_servico || '—'}</p></div>
                <div><span className="text-[11px] uppercase text-muted-foreground">Ocorrência / problema informado</span><p className="font-semibold">{chamado?.tipo_servico || '—'}</p></div>
                <div><span className="text-[11px] uppercase text-muted-foreground">Patrimônio</span><p className="font-semibold">{chamado?.patrimonio_snapshot || '—'}</p></div>
                <div><span className="text-[11px] uppercase text-muted-foreground">Placa</span><p className="font-semibold">{chamado?.placa_snapshot || '—'}</p></div>
              </div>

              {(detalhe.adicionais || []).length > 0 && (
                <section className="space-y-3">
                  <h3 className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Adicionais do serviço</h3>
                  {(detalhe.adicionais || []).map((a: any, index: number) => (
                    <div key={a.id} className={`rounded-xl border p-4 ${!a.visualizado_em ? 'border-amber-400 bg-amber-50/60' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase text-amber-700">Adicional {index + 1}</p>
                          <p className="mt-1 font-semibold">{a.descricao_identificada}</p>
                          <p className="mt-2 text-sm"><b>Executado:</b> {a.servico_executado}</p>
                          {a.observacao && <p className="mt-1 text-sm text-muted-foreground">{a.observacao}</p>}
                          <p className="mt-2 text-xs text-muted-foreground">{a.mecanico_nome || 'Mecânico'} • {dt(a.created_at)}</p>
                        </div>
                        {!a.visualizado_em && (
                          <Button size="sm" variant="outline" onClick={() => { setAdicionalAlvo(a); if (developerMode) void marcarVisto(''); else setCodigoOpen(true); }}>Confirmar ciência</Button>
                        )}
                      </div>
                      {materiaisDoAdicional(a.id).length > 0 && (
                        <div className="mt-3 rounded-lg bg-background p-3">
                          <p className="mb-2 flex items-center gap-1 text-xs font-bold"><Package className="h-3 w-3" /> Materiais utilizados</p>
                          {materiaisDoAdicional(a.id).map((m: any) => (
                            <p key={m.id} className="text-xs text-muted-foreground">{m.descricao} — {m.quantidade} {m.unidade || ''}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}

              <section className="space-y-3">
                <h3 className="flex items-center gap-2 font-bold"><Clock3 className="h-4 w-4 text-primary" /> Linha do tempo</h3>
                {(detalhe.eventos || []).length === 0 ? (
                  <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Esta ocorrência é anterior à nova linha do tempo ou ainda não possui eventos.</p>
                ) : (
                  <div className="relative space-y-3 border-l-2 border-primary/20 pl-5">
                    {(detalhe.eventos || []).map((e: any) => (
                      <div key={e.id} className="relative rounded-xl border bg-card p-3">
                        <span className="absolute -left-[27px] top-4 h-3 w-3 rounded-full bg-primary" />
                        <p className="font-semibold">{EVENT_LABEL[e.tipo] || e.tipo}</p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{e.autor_nome || 'Sistema'}</span>
                          <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{dt(e.created_at)}</span>
                          {e.latitude != null && e.longitude != null && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />GPS registrado</span>}
                        </div>
                        {e.detalhes?.observacao && <p className="mt-2 text-xs text-muted-foreground">{e.detalhes.observacao}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {chamado?.descricao_conclusao && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-emerald-800"><Wrench className="h-4 w-4" /> Relatório final do mecânico</p>
                  <p className="mt-2 text-sm text-emerald-950">{chamado.descricao_conclusao}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <OperadorCodeDialog
        open={codigoOpen}
        onOpenChange={setCodigoOpen}
        loading={saving}
        title="Confirmar ciência do adicional"
        description="Informe seu código de operador. A confirmação ficará registrada no histórico deste chamado."
        onConfirm={marcarVisto}
      />
    </>
  );
};

export default OperacionalChamadoDetailDialog;
