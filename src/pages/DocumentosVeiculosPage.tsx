import React, { useState } from 'react';
import FrotaCadastroInteligente from '@/components/frota/FrotaCadastroInteligente';
import DocumentosVeiculosPageLegacy from './DocumentosVeiculosPageLegacy';

const DocumentosVeiculosPage: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const protectLegacyDelete = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button');
    if (!button || !button.querySelector('svg.lucide-trash-2')) return;

    const confirmed = window.confirm(
      'Excluir definitivamente este ativo da Frota? O documento deixará de aparecer na lista. Esta ação não pode ser desfeita.'
    );

    if (!confirmed) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <FrotaCadastroInteligente onSaved={() => setRefreshKey(current => current + 1)} />
      <div onClickCapture={protectLegacyDelete}>
        <DocumentosVeiculosPageLegacy key={refreshKey} />
      </div>
    </div>
  );
};

export default DocumentosVeiculosPage;