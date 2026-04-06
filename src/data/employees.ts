export interface Employee {
  id: string;
  companyId: string;
  registro: string;
  matriculaEsocial: string;
  name: string;
  cpf: string;
  cargo: string;
  salarioBase: number;
  dataAdmissao: string;
  dataExameMedico: string;
  vrAtivo: boolean;
  vrDiario: number;
  vaAtivo: boolean;
  vaMensal: number;
  vtAtivo: boolean;
  vtValor: number;
  insalubridadeAtiva: boolean;
  insalubridadeValor: number;
  status: 'ativo' | 'afastado' | 'férias' | 'desligado';
  telefone: string;
  email: string;
  endereco: string;
  pix: string;
  banco: string;
  agencia: string;
  conta: string;
  observacoes: string;
}

const CARGOS_INSALUBRES = [
  'guincheiro', 'mecânico', 'mecânico pneumático', 'técnico mecânico',
  'técnico mecânico pleno', 'técnico mecânico junior', 'ajudante de mecânico',
  'técnico mecânico eletricista jr'
];

export const isCargoInsalubre = (cargo: string): boolean =>
  CARGOS_INSALUBRES.some(c => cargo.toLowerCase().includes(c.toLowerCase()));

const INSALUBRIDADE_PADRAO = 648.40;

const emp = (id: string, companyId: string, registro: string, mat: string, name: string, cpf: string, cargo: string, salario: number, admissao: string, exame: string, vr: boolean, va: boolean, vt: boolean, status: Employee['status'] = 'ativo'): Employee => {
  const insalubre = isCargoInsalubre(cargo);
  return {
    id, companyId, registro, matriculaEsocial: mat, name, cpf, cargo, salarioBase: salario,
    dataAdmissao: admissao, dataExameMedico: exame,
    vrAtivo: vr, vrDiario: vr ? 32.00 : 0, vaAtivo: va, vaMensal: va ? 250.00 : 0,
    vtAtivo: vt, vtValor: vt ? 220.00 : 0,
    insalubridadeAtiva: insalubre, insalubridadeValor: insalubre ? INSALUBRIDADE_PADRAO : 0,
    status, telefone: '(11) 9' + Math.floor(10000000 + Math.random() * 90000000),
    email: name.split(' ')[0].toLowerCase() + '@email.com',
    endereco: 'São Paulo, SP', pix: cpf, banco: 'Bradesco', agencia: '1234', conta: '56789-0',
    observacoes: '',
  };
};

export const employees: Employee[] = [
  // TOPAC MATRIZ
  emp('m1','topac-matriz','001','MAT-001','Carlos Eduardo Silva','123.456.789-01','Gerente Administrativo',6500,'2019-03-15','2025-08-10',true,true,false),
  emp('m2','topac-matriz','002','MAT-002','Roberto Almeida Santos','234.567.890-12','Guincheiro',3200,'2020-07-01','2025-06-15',true,false,true),
  emp('m3','topac-matriz','003','MAT-003','José Antônio Ferreira','345.678.901-23','Mecânico',3800,'2018-11-20','2025-04-20',true,false,true),
  emp('m4','topac-matriz','004','MAT-004','Ana Paula Oliveira','456.789.012-34','Assistente RH',2800,'2021-02-10','2025-09-05',true,true,true),
  emp('m5','topac-matriz','005','MAT-005','Marcos Vinícius Costa','567.890.123-45','Técnico Mecânico Pleno',4200,'2017-05-03','2025-03-12',true,false,true),
  emp('m6','topac-matriz','006','MAT-006','Fernando Henrique Dias','678.901.234-56','Almoxarife',2600,'2022-01-15','2025-10-01',true,false,true),
  emp('m7','topac-matriz','007','MAT-007','Luciana Beatriz Ramos','789.012.345-67','Analista Financeiro',4800,'2020-09-01','2025-07-20',true,true,false),
  emp('m8','topac-matriz','008','MAT-008','Ricardo Souza Lima','890.123.456-78','Ajudante de Mecânico',2400,'2023-04-10','2025-11-15',true,false,true),

  // TOPAC FILIAL PG
  emp('pg1','topac-pg','001','PG-001','Diego Martins Pereira','111.222.333-44','Encarregado de Obras',4000,'2019-06-01','2025-05-10',true,false,true),
  emp('pg2','topac-pg','002','PG-002','Wellington Rocha','222.333.444-55','Guincheiro',3200,'2021-03-15','2025-08-20',true,false,true),
  emp('pg3','topac-pg','003','PG-003','Cláudio Nascimento','333.444.555-66','Mecânico Pneumático',3600,'2020-01-10','2025-04-05',true,false,true),
  emp('pg4','topac-pg','004','PG-004','Patrícia Mendes','444.555.666-77','Auxiliar Administrativo',2200,'2022-08-20','2025-09-30',true,true,true),
  emp('pg5','topac-pg','005','PG-005','Rogério Farias','555.666.777-88','Técnico Mecânico Junior',3400,'2021-11-01','2025-06-25',true,false,true),
  emp('pg6','topac-pg','006','PG-006','Edilson Carvalho','666.777.888-99','Motorista',2800,'2020-05-15','2025-07-10',true,false,true),

  // ALQUI OBRAS
  emp('a1','alqui','001','AQ-001','Sérgio Luiz Barbosa','777.888.999-00','Coordenador de Projetos',5500,'2018-09-01','2025-03-15',true,true,false),
  emp('a2','alqui','002','AQ-002','Thiago Pinto Araújo','888.999.000-11','Guincheiro',3200,'2021-06-10','2025-10-20',true,false,true),
  emp('a3','alqui','003','AQ-003','Leandro Gomes','999.000.111-22','Técnico Mecânico',3800,'2019-12-01','2025-05-05',true,false,true),
  emp('a4','alqui','004','AQ-004','Márcio Tavares','000.111.222-33','Vendedor Externo',3000,'2022-03-20','2025-08-15',true,true,false),
  emp('a5','alqui','005','AQ-005','Adriana Lopes','111.222.333-44','Assistente Comercial',2600,'2023-01-10','2025-11-01',true,true,true),
  emp('a6','alqui','006','AQ-006','Paulo César Moreira','222.333.444-55','Ajudante de Mecânico',2400,'2022-07-15','2025-06-10',true,false,true),
  emp('a7','alqui','007','AQ-007','Rafael Teixeira','333.444.555-66','Técnico Mecânico Eletricista Jr',3500,'2021-04-01','2025-09-20',true,false,true),

  // LMT
  emp('l1','lmt','001','LMT-001','Fábio Ricardo Nunes','444.555.666-77','Gerente Operacional',5800,'2017-02-01','2025-04-10',true,true,false),
  emp('l2','lmt','002','LMT-002','Anderson Vieira','555.666.777-88','Mecânico',3800,'2020-08-15','2025-07-05',true,false,true),
  emp('l3','lmt','003','LMT-003','Cristiano Duarte','666.777.888-99','Guincheiro',3200,'2021-10-01','2025-05-25',true,false,true),
  emp('l4','lmt','004','LMT-004','Daniela Freitas','777.888.999-00','Analista de Compras',3600,'2022-05-10','2025-10-15',true,true,true),
  emp('l5','lmt','005','LMT-005','Emerson Santos','888.999.000-11','Almoxarife',2600,'2023-02-01','2025-08-30',true,false,true),
  emp('l6','lmt','006','LMT-006','Gabriel Monteiro','999.000.111-22','Técnico Mecânico Junior',3400,'2021-07-20','2025-06-12',true,false,true),
];
