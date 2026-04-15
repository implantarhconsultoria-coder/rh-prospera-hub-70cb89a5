import React from 'react';
import { Building2, User } from 'lucide-react';
import type { AppRole } from '@/hooks/useUserRole';

const branchLabels: Record<string, { name: string; color: string }> = {
  filial_praia: { name: 'RH Filial Praia Grande', color: 'bg-blue-500' },
  filial_goiania: { name: 'RH Filial Goiânia', color: 'bg-emerald-500' },
  almoxarifado: { name: 'Almoxarifado', color: 'bg-amber-500' },
};

interface Props {
  role: AppRole;
  email: string;
}

const BranchHeader: React.FC<Props> = ({ role, email }) => {
  const branch = branchLabels[role];
  if (!branch) return null;

  return (
    <div className={`${branch.color} text-white px-4 py-2 flex items-center justify-between text-xs print:hidden`}>
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4" />
        <span className="font-semibold">{branch.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <User className="w-3 h-3" />
        <span>{email}</span>
      </div>
    </div>
  );
};

export default BranchHeader;
