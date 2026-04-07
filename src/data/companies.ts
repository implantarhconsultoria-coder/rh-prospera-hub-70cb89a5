export interface Company {
  id: string;
  name: string;
  cnpj: string;
  city: string;
  status: 'ativa' | 'inativa';
  notes: string;
}

export const companies: Company[] = [
  { id: 'topac-matriz', name: 'TOPAC MATRIZ', cnpj: '07.291.648/0001-03', city: 'São Paulo', status: 'ativa', notes: 'Sede administrativa e operacional' },
  { id: 'topac-pg', name: 'TOPAC FILIAL PRAIA GRANDE', cnpj: '07.291.648/0002-94', city: 'Praia Grande', status: 'ativa', notes: 'Filial litoral' },
  { id: 'alqui', name: 'ALQUI OBRAS', cnpj: '14.464.586/0001-50', city: 'São Paulo', status: 'ativa', notes: 'Locação e obras' },
  { id: 'lmt', name: 'LMT', cnpj: '21.967.711/0001-00', city: 'São Paulo', status: 'ativa', notes: 'Serviços especializados' },
  { id: 'topac-gyn', name: 'TOPAC FILIAL GOIÂNIA', cnpj: '07.291.648/0003-75', city: 'Goiânia', status: 'ativa', notes: 'Filial Goiânia' },
];
