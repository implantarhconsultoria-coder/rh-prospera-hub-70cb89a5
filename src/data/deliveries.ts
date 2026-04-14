export interface DeliveryItem {
  tipo: string;
  descricao: string;
  ca?: string;
  tamanho: string;
  quantidade: number;
  observacao: string;
}

export interface Delivery {
  id: string;
  type: 'epi' | 'uniforme';
  employeeId: string;
  companyId: string;
  date: string; // ISO date
  items: DeliveryItem[];
  responsavel?: string;
  createdAt: string;
}

export interface BenefitReport {
  id: string;
  type: 'vr' | 'vt';
  companyId: string;
  competencia: string; // YYYY-MM
  createdAt: string;
}

export const EPI_TYPES = [
  'Capacete de segurança',
  'Óculos de proteção',
  'Protetor auricular',
  'Luva de segurança',
  'Luva de procedimento',
  'Bota de segurança',
  'Botina de segurança',
  'Cinto de segurança (EPI)',
  'Máscara respiratória',
  'Avental de proteção',
  'Protetor facial',
  'Creme protetor',
  'Mangote',
  'Perneira',
  'Outro',
];

export const UNIFORM_TYPES = [
  'Camiseta operacional',
  'Calça operacional',
  'Jaqueta',
  'Colete',
  'Bermuda',
  'Macacão',
  'Jaleco',
  'Outro',
];

export const RESPONSIBILITY_TEXT = `Declaro ter recebido gratuitamente os Equipamentos de Proteção Individual (EPI) / Uniformes acima descritos, assumindo a responsabilidade de usá-los durante a jornada de trabalho, guardá-los e conservá-los, devolvendo-os quando danificados ou no término do contrato de trabalho. Comprometo-me a cumprir as Normas Internas da Empresa e as Normas Regulamentadoras (NR's) pertinentes, referentes ao uso adequado, guarda e conservação dos mesmos, bem como comunicar ao empregador qualquer alteração que os torne impróprios para uso.`;
