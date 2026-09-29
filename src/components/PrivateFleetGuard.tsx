import React from 'react';
import { Navigate } from 'react-router-dom';
import StableLoading from '@/components/StableLoading';
import { usePrivateModuleAccess } from '@/hooks/usePrivateModuleAccess';

const PrivateFleetGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { allowed, loading } = usePrivateModuleAccess('frota_ipva');
  if (loading) return <StableLoading label="Verificando acesso privado..." />;
  if (!allowed) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

export default PrivateFleetGuard;
