import React from 'react';

interface Props { companyId: string; competencia: string }

// As etiquetas foram centralizadas no módulo /admin/etiquetas.
// Mantemos o componente vazio para preservar compatibilidade com o Fechamento sem duplicar a ferramenta.
const FechamentoLabelsPanel: React.FC<Props> = () => null;

export default FechamentoLabelsPanel;
