import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Atalhos amigáveis legados.
 * Qualquer caminho antigo por área + filial redireciona para o link único
 * regional, mantendo compatibilidade com URLs já distribuídas.
 *
 *  /operacional/sp|praia-grande|goiania
 *  /faturamento/sp|praia-grande|goiania
 *  /financeiro/sp|praia-grande|goiania
 *  /rh/sp|praia-grande|goiania
 *  /almoxarifado/sp|praia-grande|goiania
 *  /documentos-rh/sp|praia-grande|goiania
 */
const FILIAL_CODE: Record<string, string> = {
  sp: 'sp', matriz: 'sp',
  'praia-grande': 'pg', praia: 'pg', pg: 'pg',
  goiania: 'go', 'goiânia': 'go', go: 'go',
};

const AREAS_VALIDAS = new Set([
  'operacional',
  'faturamento',
  'financeiro',
  'rh',
  'almoxarifado',
  'documentos-rh',
]);

const AcessoFilialOperacionalPage: React.FC = () => {
  const loc = useLocation();
  const parts = loc.pathname.split('/').filter(Boolean);
  // /<area>/<filial>
  const area = (parts[0] || '').toLowerCase();
  const filial = (parts[1] || '').toLowerCase();
  const fcode = FILIAL_CODE[filial];
  if (!AREAS_VALIDAS.has(area) || !fcode) return <Navigate to="/" replace />;
  return <Navigate to={`/${fcode}`} replace />;
};

export default AcessoFilialOperacionalPage;
