import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface ModuleDef {
  role: string;
  label: string;
  path: string;
}

const ALL_MODULES: ModuleDef[] = [
  { role: 'admin', label: 'Administração', path: '/admin' },
  { role: 'filial_praia', label: 'RH Praia Grande', path: '/filial' },
  { role: 'filial_goiania', label: 'RH Goiânia', path: '/filial' },
  { role: 'faturamento', label: 'Faturamento', path: '/faturamento' },
  { role: 'financeiro', label: 'Financeiro', path: '/financeiro' },
];

/**
 * Botão "Trocar módulo" — só aparece se o usuário tiver mais de 1 módulo
 * disponível. Admin sempre vê todos.
 */
const ModuleSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { userRoles } = useApp();
  const navigate = useNavigate();

  const isAdmin = userRoles.includes('admin');
  const available = isAdmin
    ? ALL_MODULES
    : ALL_MODULES.filter((m) => userRoles.includes(m.role as any));

  if (available.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={compact ? 'sm' : 'default'} className="gap-2">
          <Layers className="w-4 h-4" />
          {!compact && <span>Trocar módulo</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
        <DropdownMenuLabel>Módulos disponíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map((m) => (
          <DropdownMenuItem key={m.role + m.path} onClick={() => navigate(m.path)}>
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ModuleSwitcher;
