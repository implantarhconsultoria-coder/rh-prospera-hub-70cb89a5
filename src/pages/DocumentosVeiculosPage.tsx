import React, { useState } from 'react';
import FrotaCadastroInteligente from '@/components/frota/FrotaCadastroInteligente';
import DocumentosVeiculosPageLegacy from './DocumentosVeiculosPageLegacy';

const DocumentosVeiculosPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5 animate-fade-in">
      <FrotaCadastroInteligente onSaved={() => setRefreshKey(current => current + 1)} />
      <DocumentosVeiculosPageLegacy key={refreshKey} />
    </div>
  );
};

export default DocumentosVeiculosPage;
