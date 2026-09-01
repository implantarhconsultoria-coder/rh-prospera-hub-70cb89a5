import React from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';

const FaturamentoLayout: React.FC = () => {
  const { userRoles } = useApp();
  const isInternal = userRoles.includes('admin') || userRoles.includes('diretor_geral');
  return <Navigate to={isInternal ? '/admin' : '/'} replace />;
};

export default FaturamentoLayout;
