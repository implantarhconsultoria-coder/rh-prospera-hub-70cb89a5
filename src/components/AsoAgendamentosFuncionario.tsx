import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/calculations';

type AsoAgendamento = {
  id: string;
  data_exame: string | null;
  tipo_exame: string;
  status: string;
  obra_local: string | null;
  clinica_endereco: string | null;
  observacao: string | null;
};

type Props = {
  funcionarioId: string;
  companyId: string;
};

const statusClassName = (status: string) => {
  if (/conclu|realiz|confirm/i.test(status)) return 'bg-success text-success-foreground';
  if (/cancel|vencid/i.test(status)) return 'bg-destructive text-destructive-foreground';
  return 'bg-warning text-warning-foreground';
};

const AsoAgendamentosFuncionario: React.FC<Props> = ({ funcionarioId, companyId }) => {
  const [agendamentos, setAgendamentos] = useState<AsoAgendamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const carregar = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('aso_agendamentos')
        .select('id, data_exame, tipo_exame, status, obra_local, clinica_endereco, observacao')
        .eq('funcionario_id', funcionarioId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (!active) return;
      setLoading(false);
      if (error) {
        console.error('Erro ao carregar agendamentos de ASO do funcionario:', error);
        setAgendamentos([]);
        return;
      }
      setAgendamentos(data || []);
    };

    carregar();
    return () => { active = false; };
  }, [companyId, funcionarioId]);

  return (
    <div className="border-t border-border pt-3 mt-3 space-y-2">
      <p className="text-xs font-semibold text-foreground">Agendamentos vinculados</p>
      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando agendamentos...</p>
      ) : agendamentos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum agendamento de ASO vinculado a esta ficha.</p>
      ) : (
        <div className="space-y-2">
          {agendamentos.map(agendamento => (
            <div key={agendamento.id} className="rounded-md border border-border bg-background/70 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="capitalize">{agendamento.tipo_exame}</strong>
                <Badge className={`text-[10px] ${statusClassName(agendamento.status)}`}>
                  {agendamento.status}
                </Badge>
              </div>
              <div className="mt-1 space-y-1 text-muted-foreground">
                <p>Data: {formatDate(agendamento.data_exame)}</p>
                {agendamento.clinica_endereco && <p>Clínica: {agendamento.clinica_endereco}</p>}
                {agendamento.obra_local && <p>Local: {agendamento.obra_local}</p>}
                {agendamento.observacao && <p>Observação: {agendamento.observacao}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AsoAgendamentosFuncionario;
