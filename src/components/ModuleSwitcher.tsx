import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import EmployeeAccessControl from '@/components/EmployeeAccessControl';
import { Button } from '@/components/ui/button';

const ModuleSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { userRoles } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = userRoles.includes('admin');
  const isDirector = userRoles.includes('diretor_geral');
  const canPreview = isAdmin || isDirector;

  const adminPortalTarget = location.pathname.startsWith('/admin/almoxarifado')
    ? { label: 'Acessar Portal do Usuário', path: '/almoxarifado' }
    : location.pathname.startsWith('/admin/operacional') || location.pathname.startsWith('/admin/chamados')
      ? { label: 'Acessar Portal do Usuário', path: '/operacional' }
      : null;

  const portalBackTarget = location.pathname.startsWith('/almoxarifado')
    ? '/admin/almoxarifado'
    : location.pathname.startsWith('/operacional')
      ? '/admin/operacional'
      : null;

  return (
    <div className="flex items-center gap-2">
      {isAdmin && <EmployeeAccessControl />}

      {canPreview && adminPortalTarget && (
        <Button
          variant="outline"
          size={compact ? 'sm' : 'default'}
          onClick={() => navigate(adminPortalTarget.path)}
          className="gap-2 border-[#5b2a78] bg-[#120b19] text-white shadow-md hover:border-[#8b3fe7] hover:bg-[#1a0f24] hover:text-white"
        >
          <ExternalLink className="h-4 w-4" />
          {!compact && <span>{adminPortalTarget.label}</span>}
        </Button>
      )}

      {canPreview && portalBackTarget && (
        <Button
          variant="outline"
          size={compact ? 'sm' : 'default'}
          onClick={() => navigate(portalBackTarget)}
          className="gap-2 border-[#5b2a78] bg-[#120b19] text-white shadow-md hover:border-[#8b3fe7] hover:bg-[#1a0f24] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {!compact && <span>Voltar ao painel administrativo</span>}
        </Button>
      )}
    </div>
  );
};

export default ModuleSwitcher;
