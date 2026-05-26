import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useApp } from '@/hooks/useApp';
import type { Employee } from '@/types/database';

interface EmployeeComboboxProps {
  value?: string;
  onChange: (employee: Employee | null) => void;
  placeholder?: string;
  companyId?: string;
  includeInactive?: boolean;
  className?: string;
  disabled?: boolean;
}

const EmployeeCombobox: React.FC<EmployeeComboboxProps> = ({
  value,
  onChange,
  placeholder = 'Buscar funcionario (nome, CPF, funcao, empresa/filial)...',
  companyId,
  includeInactive = false,
  className,
  disabled,
}) => {
  const { employees, companies } = useApp();
  const [open, setOpen] = useState(false);

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const empresaNome = (cid: string) => {
    const company = companyById.get(cid);
    return [company?.name, company?.city].filter(Boolean).join(' / ');
  };

  const list = useMemo(() => {
    return (employees || [])
      .filter((employee) => includeInactive || employee.status === 'ativo')
      .filter((employee) => !companyId || employee.companyId === companyId);
  }, [employees, companyId, includeInactive]);

  const selected = list.find((employee) => employee.id === value);

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
              <span className="truncate">
                <span className="font-medium">{selected.name}</span>
                {selected.cpf && <span className="text-muted-foreground"> - {selected.cpf}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command
          filter={(value, search) => {
            if (!search) return 1;
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Digite nome, CPF, funcao ou empresa/filial..." />
          <CommandList>
            <CommandEmpty>Nenhum funcionario encontrado.</CommandEmpty>
            <CommandGroup>
              {list.map((employee) => {
                const company = companyById.get(employee.companyId);
                const haystack = [
                  employee.id,
                  employee.name,
                  employee.cpf,
                  employee.matriculaEsocial,
                  employee.registro,
                  employee.cargo,
                  employee.setorGhe,
                  employee.email,
                  employee.telefone,
                  employee.celular,
                  company?.name,
                  company?.city,
                  company?.codigo,
                ]
                  .filter(Boolean)
                  .join(' | ');

                return (
                  <CommandItem
                    key={employee.id}
                    value={haystack}
                    onSelect={() => {
                      onChange(employee);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === employee.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{employee.name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {[employee.cpf, employee.cargo, empresaNome(employee.companyId)].filter(Boolean).join(' - ')}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default EmployeeCombobox;
