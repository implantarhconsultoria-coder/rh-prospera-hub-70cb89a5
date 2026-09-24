import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { interpretRetirada, type RetiradaStockItem } from '@/lib/almoxarifadoRetiradaInteligente';

type CartItem = { item_id: string; quantidade: number; nome: string; codigo: string };
type Props = {
  value: string;
  onChange: (value: string) => void;
  stock: RetiradaStockItem[];
  cart: CartItem[];
  onAdd: (items: CartItem[]) => void;
  busy?: boolean;
};

const RetiradaInteligentePanel: React.FC<Props> = ({ value, onChange, stock, cart, onAdd, busy }) => {
  const [choices, setChoices] = useState<Record<number, string>>({});
  const stockMap = useMemo(() => new Map(stock.map((item) => [item.id, item])), [stock]);
  const interpreted = useMemo(() => interpretRetirada(value, stock), [value, stock]);
  const preview = useMemo(() => {
    const requested = new Map<string, number>();
    return interpreted.map((line, index) => {
      const itemId = choices[index] ?? line.suggestedId;
      const item = stockMap.get(itemId);
      if (item) requested.set(itemId, (requested.get(itemId) || 0) + line.quantidade);
      const balance = Number(item?.saldo || 0);
      const total = (requested.get(itemId) || 0) + (cart.find((row) => row.item_id === itemId)?.quantidade || 0);
      const issue = line.issue === 'quantidade' ? 'Quantidade inválida.'
        : !item ? (line.candidates.length ? 'Selecione o material correto.' : 'Material não encontrado no catálogo.')
        : total > balance ? 'Saldo insuficiente: disponível ' + balance + ', solicitado ' + total + '.'
        : null;
      return { ...line, index, itemId, item, issue, balance, total };
    });
  }, [interpreted, choices, stockMap, cart]);

  const canAdd = preview.length > 0 && preview.every((row) => !row.issue);
  const addProposed = () => {
    if (!canAdd) return toast.error('Confira os materiais e os saldos antes de adicionar.');
    const next = cart.map((item) => ({ ...item }));
    for (const row of preview) {
      if (!row.item) return toast.error('Selecione os materiais antes de prosseguir.');
      const existing = next.find((item) => item.item_id === row.itemId);
      if (existing) existing.quantidade += row.quantidade;
      else next.push({
        item_id: row.item.id,
        quantidade: row.quantidade,
        nome: row.item.nome,
        codigo: row.item.codigo_topac || '',
      });
    }
    onAdd(next);
    onChange('');
    setChoices({});
    toast.success('Materiais conferidos e adicionados. A baixa ocorre somente na confirmação final.');
  };

  return (
    <div className="mt-4">
      <label htmlFor="almox-retirada-inteligente" className="almox-label block">
        Leitura inteligente de materiais
      </label>
      <p className="mt-1 text-xs text-slate-400">
        Digite um ou vários materiais com quantidades. O sistema consulta o catálogo real, confere saldos e monta a retirada.
      </p>
      <Textarea
        id="almox-retirada-inteligente"
        className="almox-textarea mt-2 min-h-[112px]"
        value={value}
        onChange={(event) => { onChange(event.target.value); setChoices({}); }}
        placeholder={'Ex.: 1 chave de fenda\n2 chaves Phillips\n3 parafusos 6x15'}
      />
      {!!preview.length && (
        <div className="mt-3 space-y-2" aria-live="polite">
          <p className="text-xs font-bold text-white">Conferência automática — {preview.length} linha(s)</p>
          {preview.map((row) => (
            <div
              key={row.index}
              className={'rounded-xl border p-3 ' + (
                row.issue ? 'border-amber-500/50 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10'
              )}
            >
              <div className="text-xs font-bold text-white">{row.quantidade} × {row.term || row.raw}</div>
              {!!row.candidates.length && (
                <select
                  className="almox-control mt-2 w-full text-xs"
                  aria-label={'Material da linha ' + (row.index + 1)}
                  value={row.itemId}
                  onChange={(event) => setChoices((current) => ({ ...current, [row.index]: event.target.value }))}
                >
                  <option value="">Selecionar material correto...</option>
                  {row.candidates.map(({ item }) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo_topac || 'S/C'} — {item.nome} — saldo {item.saldo || 0}
                    </option>
                  ))}
                </select>
              )}
              {row.issue
                ? <p className="mt-1 text-xs text-amber-300">{row.issue}</p>
                : <p className="mt-1 text-xs text-emerald-300">
                    Identificado • saldo {row.balance} • após pedido: {row.balance - row.total}
                  </p>}
            </div>
          ))}
          <Button type="button" className="w-full" disabled={!canAdd || !!busy} onClick={addProposed}>
            Conferir e adicionar {preview.length} material(is)
          </Button>
          <p className="text-[11px] text-slate-400">
            Nenhuma baixa ocorre pela digitação. Confirme a seleção e depois registre a retirada.
          </p>
        </div>
      )}
    </div>
  );
};

export default RetiradaInteligentePanel;
