import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';

export interface ItemOption {
  id: string;
  nome: string;
  categoria?: string;
  unidade?: string;
  codigo_sku?: string;
  quantidade?: number;
}

interface ItemComboboxProps {
  value?: string;
  items: ItemOption[];
  onSelect: (item: ItemOption) => void;
  onManualEntry?: (descricao: string) => void; // chamado quando usuário usa "lançar manualmente"
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  allowManual?: boolean; // default true
}

/**
 * Busca digitável de item de almoxarifado, com fallback "Item não encontrado / lançar manualmente".
 * Não trava a operação quando o item ainda não existe no cadastro.
 */
const ItemCombobox: React.FC<ItemComboboxProps> = ({
  value, items, onSelect, onManualEntry, placeholder = 'Buscar item...',
  className, disabled, allowManual = true,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => items.find(i => i.id === value), [items, value]);

  const showManual = allowManual && search.trim().length >= 2 &&
    !items.some(i => i.nome.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            {selected ? (
              <span className="truncate font-medium">{selected.nome}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command
          filter={(value, search) => (!search ? 1 : value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput
            placeholder="Digite nome, SKU ou categoria..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {allowManual ? 'Use "Lançar manualmente" abaixo.' : 'Nenhum item encontrado.'}
            </CommandEmpty>
            <CommandGroup>
              {items.map(i => {
                const haystack = [i.nome, i.categoria, i.codigo_sku].filter(Boolean).join(' | ');
                return (
                  <CommandItem
                    key={i.id}
                    value={haystack}
                    onSelect={() => { onSelect(i); setOpen(false); setSearch(''); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === i.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{i.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {[i.categoria, i.unidade, i.codigo_sku].filter(Boolean).join(' · ')}
                        {typeof i.quantidade === 'number' && ` · estoque: ${i.quantidade}`}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {showManual && onManualEntry && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Não encontrou?">
                  <CommandItem
                    value={`__manual__${search}`}
                    onSelect={() => { onManualEntry(search.trim()); setOpen(false); setSearch(''); }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    <span>Lançar manualmente: <strong>{search.trim()}</strong></span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default ItemCombobox;
