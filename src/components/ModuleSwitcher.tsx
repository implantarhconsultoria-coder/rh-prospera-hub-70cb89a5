import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import EmployeeAccessControl from '@/components/EmployeeAccessControl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface ModuleDef { role: string; label: string; path: string; }

const PORTAL_MODULES: ModuleDef[] = [
  { role: 'admin', label: 'Administracao', path: '/admin' },
  { role: 'filial_matriz', label: 'RH Matriz', path: '/filial' },
  { role: 'filial_praia', label: 'RH Praia Grande', path: '/filial' },
  { role: 'filial_goiania', label: 'RH Goiania', path: '/filial' },
  { role: 'faturamento', label: 'Faturamento', path: '/faturamento' },
  { role: 'financeiro', label: 'Financeiro', path: '/financeiro' },
  { role: 'almoxarifado', label: 'Almoxarifado', path: '/almoxarifado' },
  { role: 'operacional', label: 'Operacional', path: '/operacional' },
  { role: 'tecnico_campo', label: 'Campo', path: '/campo' },
];

const ADMIN_MODULES: ModuleDef[] = [
  { role: 'admin', label: 'Central TOPAC', path: '/admin' },
  { role: 'empresas', label: 'Empresas', path: '/admin/empresas' },
  { role: 'fechamento', label: 'Fechamento', path: '/admin/fechamento' },
  { role: 'operacional', label: 'Operacional', path: '/admin/chamados' },
  { role: 'mecanico', label: 'App Mecanico', path: '/admin/app-mecanico' },
  { role: 'faturamento', label: 'Faturamento', path: '/admin/faturamento' },
  { role: 'financeiro', label: 'Financeiro', path: '/admin/financeiro' },
];

const ModuleSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { userRoles } = useApp();
  const navigate = useNavigate();
  const isAdmin = userRoles.includes('admin');
  const isDirector = userRoles.includes('diretor_geral') && !userRoles.includes('admin');
  const available = isAdmin
    ? ADMIN_MODULES
    : isDirector
      ? [
          { role: 'diretor_geral', label: 'Central TOPAC', path: '/admin' },
          { role: 'faturamento', label: 'Faturamento', path: '/admin/faturamento' },
          { role: 'financeiro', label: 'Financeiro', path: '/admin/financeiro' },
          { role: 'relatorios', label: 'Relatorios', path: '/admin/relatorio' },
        ]
      : PORTAL_MODULES.filter((m) => userRoles.includes(m.role as any));

  return (
    <div className="flex items-center gap-2">
      <EmployeeAccessControl />
      {available.length >= 2 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size={compact ? 'sm' : 'default'} className="gap-2">
              <Layers className="w-4 h-4" />
              {!compact && <span>Trocar modulo</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
            <DropdownMenuLabel>Modulos disponiveis</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {available.map((m) => (
              <DropdownMenuItem key={m.role + m.path} onClick={() => navigate(m.path)}>{m.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default ModuleSwitcher;
