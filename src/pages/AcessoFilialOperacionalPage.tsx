import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Atalhos amigáveis para os links únicos por módulo + filial.
 * Mapeia para os slugs oficiais consumidos por validar_acesso_cpf_slug.
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

const AREA_PREFIX: Record<string, string> = {
  operacional: 'op',
  faturamento: 'fat',
  financeiro: 'fin',
  rh: 'rh',
  almoxarifado: 'alm',
  'documentos-rh': 'docrh',
};

const AcessoFilialOperacionalPage: React.FC = () => {
  const loc = useLocation();
  const parts = loc.pathname.split('/').filter(Boolean);
  // /<area>/<filial>
  const area = (parts[0] || '').toLowerCase();
  const filial = (parts[1] || '').toLowerCase();
  const prefix = AREA_PREFIX[area];
  const fcode = FILIAL_CODE[filial];
  if (!prefix || !fcode) return <Navigate to="/" replace />;
  return <Navigate to={`/acesso/${prefix}-${fcode}`} replace />;
};

export default AcessoFilialOperacionalPage;
