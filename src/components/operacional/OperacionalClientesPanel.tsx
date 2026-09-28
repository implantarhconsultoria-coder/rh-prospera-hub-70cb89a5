import React, { useMemo } from 'react';
import { AlertTriangle, Building2, MapPin, Package, Search, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  clientes: any[];
  locais: any[];
  alocacoes: any[];
  busca: string;
  onBuscaChange: (value: string) => void;
  onAbrirChamado: (clienteId: string, alocacaoId?: string) => void;
};

const OperacionalClientesPanel: React.FC<Props> = ({
  clientes,
  locais,
  alocacoes,
  busca,
  onBuscaChange,
  onAbrirChamado,
}) => {
  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return clientes
      .map((cliente) => {
        const alloc = alocacoes.filter((a) => a.cliente_id === cliente.id && a.ativo !== false);
        const groups = Array.from(new Set(alloc.map((a) => a.cliente_local_id || ('sem-local:' + a.id)))).map((key) => {
          const items = alloc.filter((a) => (a.cliente_local_id || ('sem-local:' + a.id)) === key);
          const local = locais.find((l) => l.id === items[0]?.cliente_local_id);
          return { key, local, items };
        });

        const searchable = [
          cliente.razao_social,
          cliente.nome_fantasia,
          cliente.cnpj_cpf,
          ...groups.flatMap((g) => [
            g.local?.nome,
            ...g.items.flatMap((item: any) => [item.placa, item.patrimonio]),
          ]),
        ].filter(Boolean).join(' ').toLowerCase();

        return {
          cliente,
          groups,
          total: alloc.length,
          alertas: alloc.filter((a) => a.alerta_conferencia).length,
          searchable,
        };
      })
      .filter((row) => !q || row.searchable.includes(q));
  }, [clientes, locais, alocacoes, busca]);

  return (
    <div className="space-y-4">
      <div className="card-premium flex items-center gap-2 p-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={busca}
          onChange={(event) => onBuscaChange(event.target.value)}
          placeholder="Buscar cliente, canteiro, placa ou patrimônio..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {rows.map((row) => (
          <div key={row.cliente.id} className="card-premium space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Building2 className="h-5 w-5 text-primary" />
                  {row.cliente.razao_social}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.cliente.cnpj_cpf || 'CNPJ ainda não informado'}
                </p>
              </div>
              <Button size="sm" onClick={() => onAbrirChamado(row.cliente.id)}>
                <Wrench className="mr-1 h-4 w-4" /> Abrir chamado
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="admin-metric-cell"><p>Canteiros</p><strong>{row.groups.length}</strong></div>
              <div className="admin-metric-cell"><p>Alocados</p><strong>{row.total}</strong></div>
              <div className="admin-metric-cell"><p>Conferir</p><strong>{row.alertas}</strong></div>
            </div>

            {row.groups.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Cliente cadastrado, ainda sem alocação operacional vinculada.
              </div>
            ) : (
              <div className="space-y-3">
                {row.groups.map((group) => (
                  <div key={String(group.key)} className="rounded-xl border bg-muted/15 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                      <MapPin className="h-4 w-4 text-primary" />
                      {group.local?.nome || 'Local não informado'}
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item: any) => (
                        <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Package className="h-4 w-4" />
                          </span>
                          <div className="min-w-[150px] flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                              <span>{item.patrimonio || 'Sem patrimônio'}</span>
                              <span className="text-muted-foreground">•</span>
                              <span>{item.placa || 'Sem placa'}</span>
                              {item.alerta_conferencia && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" /> Conferir
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {item.ativo_id ? 'Vinculado ao cadastro de ativos' : 'Alocação importada aguardando vínculo ao cadastro de ativos'}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => onAbrirChamado(row.cliente.id, item.id)}>
                            Chamado
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OperacionalClientesPanel;
