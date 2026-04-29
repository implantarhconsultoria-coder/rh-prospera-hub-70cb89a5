import React, { useEffect, useState } from 'react';
import { Clock, User, FileText } from 'lucide-react';
import { buscarHistoricoEntidade, type AcaoLogRow } from '@/lib/acoesLog';

interface Props {
  entidade: string;
  entidadeId: string;
}

const HistoricoAcoesTab: React.FC<Props> = ({ entidade, entidadeId }) => {
  const [rows, setRows] = useState<AcaoLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    buscarHistoricoEntidade(entidade, entidadeId).then(r => {
      if (alive) { setRows(r); setLoading(false); }
    });
    return () => { alive = false; };
  }, [entidade, entidadeId]);

  if (loading) return <p className="text-sm text-muted-foreground p-4">Carregando histórico…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground p-4">Nenhuma ação registrada ainda.</p>;

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.id} className="border border-border rounded-md p-3 bg-card text-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <User className="w-4 h-4 text-primary" />
              {r.funcionario_nome || '—'}
              {r.cpf && <span className="text-xs text-muted-foreground">({r.cpf})</span>}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {new Date(r.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
          <p className="text-xs mt-1">
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary mr-2 uppercase font-semibold">{r.acao}</span>
            <span className="text-muted-foreground">{r.modulo} · {r.entidade}</span>
            {r.empresa && <span className="text-muted-foreground"> · {r.empresa}</span>}
          </p>
          {r.observacao && <p className="text-xs mt-1">{r.observacao}</p>}
          {r.arquivo_url && (
            <p className="text-xs mt-1 flex items-center gap-1 text-primary">
              <FileText className="w-3 h-3" /> arquivo anexo
            </p>
          )}
          {(r.antes || r.depois) && (
            <details className="text-xs mt-1">
              <summary className="cursor-pointer text-muted-foreground">ver alteração</summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div><p className="font-semibold text-xs">Antes</p><pre className="text-[10px] bg-muted p-2 rounded overflow-auto">{JSON.stringify(r.antes, null, 2)}</pre></div>
                <div><p className="font-semibold text-xs">Depois</p><pre className="text-[10px] bg-muted p-2 rounded overflow-auto">{JSON.stringify(r.depois, null, 2)}</pre></div>
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
};

export default HistoricoAcoesTab;
