export type Dn4MigrationModule =
  | 'empresas'
  | 'clientes'
  | 'fornecedores'
  | 'financeiro'
  | 'contas_pagar'
  | 'contas_receber'
  | 'faturamento'
  | 'notas_fiscais'
  | 'frota'
  | 'ativos'
  | 'manutencoes'
  | 'os_chamados'
  | 'abastecimentos'
  | 'almoxarifado'
  | 'pecas_insumos'
  | 'contratos_locacoes'
  | 'historico_operacional'
  | 'nao_identificado';

export type Dn4MigrationStatus =
  | 'pronto_para_migrar'
  | 'duplicado'
  | 'pendente_vinculo'
  | 'campo_obrigatorio_ausente'
  | 'erro_formato'
  | 'ignorado'
  | 'migrado_sucesso';

export const DN4_MODULE_LABELS: Record<Dn4MigrationModule, string> = {
  empresas: 'Empresas',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  financeiro: 'Financeiro',
  contas_pagar: 'Contas a pagar',
  contas_receber: 'Contas a receber',
  faturamento: 'Faturamento',
  notas_fiscais: 'Notas fiscais',
  frota: 'Frota',
  ativos: 'Veiculos/equipamentos',
  manutencoes: 'Manutencoes',
  os_chamados: 'OS/Chamados',
  abastecimentos: 'Abastecimentos',
  almoxarifado: 'Almoxarifado',
  pecas_insumos: 'Pecas/insumos',
  contratos_locacoes: 'Contratos/locacoes',
  historico_operacional: 'Historico operacional',
  nao_identificado: 'Nao identificado',
};

export const DN4_STATUS_LABELS: Record<Dn4MigrationStatus, string> = {
  pronto_para_migrar: 'Pronto para migrar',
  duplicado: 'Duplicado',
  pendente_vinculo: 'Pendente de vinculo',
  campo_obrigatorio_ausente: 'Campo obrigatorio ausente',
  erro_formato: 'Erro de formato',
  ignorado: 'Ignorado',
  migrado_sucesso: 'Migrado com sucesso',
};

export const CANONICAL_FIELDS = [
  'codigo_dn4',
  'cnpj',
  'cpf',
  'razao_social',
  'nome',
  'cliente',
  'fornecedor',
  'empresa',
  'filial',
  'placa',
  'patrimonio',
  'renavam',
  'chassi',
  'numero_os',
  'numero_nf',
  'numero_documento',
  'data',
  'competencia',
  'valor',
  'centro_custo',
  'descricao',
  'quantidade',
  'litros',
  'km',
  'status',
] as const;

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const MODULE_HINTS: Array<{ module: Dn4MigrationModule; terms: string[] }> = [
  { module: 'empresas', terms: ['cnpj', 'razao_social', 'inscricao_estadual', 'empresa'] },
  { module: 'clientes', terms: ['cliente', 'razao_social', 'cpf_cnpj', 'cidade', 'uf'] },
  { module: 'fornecedores', terms: ['fornecedor', 'cnpj', 'razao_social', 'contato'] },
  { module: 'contas_pagar', terms: ['contas_pagar', 'fornecedor', 'vencimento', 'valor', 'documento'] },
  { module: 'contas_receber', terms: ['contas_receber', 'cliente', 'vencimento', 'valor', 'nota'] },
  { module: 'financeiro', terms: ['banco', 'conta', 'pagamento', 'recebimento', 'saldo'] },
  { module: 'faturamento', terms: ['fatura', 'medicao', 'valor_faturado', 'pedido', 'cliente'] },
  { module: 'notas_fiscais', terms: ['nota_fiscal', 'nf', 'serie', 'emissao', 'valor'] },
  { module: 'frota', terms: ['placa', 'renavam', 'chassi', 'licenciamento', 'ipva'] },
  { module: 'ativos', terms: ['patrimonio', 'equipamento', 'modelo', 'serie', 'placa'] },
  { module: 'manutencoes', terms: ['manutencao', 'mecanica', 'km', 'oficina', 'peca'] },
  { module: 'os_chamados', terms: ['os', 'ordem_servico', 'chamado', 'servico', 'tecnico'] },
  { module: 'abastecimentos', terms: ['combustivel', 'litros', 'valor_litro', 'km', 'posto'] },
  { module: 'almoxarifado', terms: ['estoque', 'almoxarifado', 'item', 'entrada', 'saida'] },
  { module: 'pecas_insumos', terms: ['peca', 'insumo', 'codigo_item', 'quantidade', 'unidade'] },
  { module: 'contratos_locacoes', terms: ['contrato', 'locacao', 'periodo', 'diaria', 'patrimonio'] },
  { module: 'historico_operacional', terms: ['historico', 'operacional', 'periodo', 'os', 'patrimonio'] },
];

const FIELD_ALIASES: Record<string, string[]> = {
  codigo_dn4: ['codigo', 'cod', 'codigo_dn4', 'cod_dn4', 'id_dn4'],
  cnpj: ['cnpj', 'cpf_cnpj', 'documento', 'cnpj_cpf'],
  cpf: ['cpf', 'cpf_funcionario'],
  razao_social: ['razao_social', 'nome_razao_social', 'razao', 'empresa', 'cliente', 'fornecedor'],
  nome: ['nome', 'nome_completo', 'funcionario', 'representante'],
  cliente: ['cliente', 'nome_cliente', 'razao_social_cliente'],
  fornecedor: ['fornecedor', 'nome_fornecedor'],
  empresa: ['empresa', 'unidade', 'filial_origem'],
  filial: ['filial', 'unidade', 'empresa_origem'],
  placa: ['placa', 'veiculo'],
  patrimonio: ['patrimonio', 'numero_patrimonio', 'equipamento', 'ativo'],
  renavam: ['renavam'],
  chassi: ['chassi'],
  numero_os: ['os', 'numero_os', 'num_os', 'ordem_servico'],
  numero_nf: ['nf', 'numero_nf', 'nota_fiscal', 'num_nf'],
  numero_documento: ['documento', 'numero_documento', 'titulo', 'duplicata'],
  data: ['data', 'emissao', 'data_emissao', 'vencimento', 'data_vencimento'],
  competencia: ['competencia', 'mes', 'periodo'],
  valor: ['valor', 'total', 'valor_total', 'valor_faturado', 'valor_pedido'],
  centro_custo: ['centro_custo', 'cc', 'departamento'],
  descricao: ['descricao', 'historico', 'servico', 'observacao'],
  quantidade: ['quantidade', 'qtd'],
  litros: ['litros', 'litragem'],
  km: ['km', 'hodometro', 'quilometragem'],
  status: ['status', 'situacao'],
};

export const detectDn4Module = (headers: string[]): Dn4MigrationModule => {
  const normalizedHeaders = headers.map(normalize);
  let best: { module: Dn4MigrationModule; score: number } = { module: 'nao_identificado', score: 0 };

  for (const hint of MODULE_HINTS) {
    const score = hint.terms.filter((term) => normalizedHeaders.some((header) => header.includes(normalize(term)))).length;
    if (score > best.score) best = { module: hint.module, score };
  }

  return best.score > 0 ? best.module : 'nao_identificado';
};

export const suggestDn4Mapping = (headers: string[]) => {
  const result: Record<string, string> = {};
  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalize(header) }));

  for (const field of CANONICAL_FIELDS) {
    const aliases = FIELD_ALIASES[field] || [field];
    const match = normalizedHeaders.find((header) =>
      aliases.some((alias) => header.normalized === normalize(alias) || header.normalized.includes(normalize(alias))),
    );
    if (match) result[field] = match.original;
  }

  return result;
};

export const parseCsv = (text: string) => {
  const delimiter = text.slice(0, 2000).includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      current = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows[0] || [];
  const dataRows = rows.slice(1).map((values) =>
    headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header || `coluna_${index + 1}`] = values[index] || '';
      return acc;
    }, {}),
  );

  return { headers, rows: dataRows };
};

export const normalizeKeyValue = (value: unknown) => String(value || '').replace(/[^\dA-Za-z]+/g, '').toUpperCase();
