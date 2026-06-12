import type { Database } from '@/integrations/supabase/types';
import type { Employee } from '@/types/database';

type AsoAgendamentoInsert = Database['public']['Tables']['aso_agendamentos']['Insert'];

type BuildAsoAgendamentoParams = {
  employee: Pick<Employee, 'id' | 'companyId' | 'name' | 'cargo' | 'cpf' | 'rg' | 'dataAdmissao'>;
  companyName: string;
  dataExame: string;
  tipoExame: string;
  obraLocal: string;
  trabalhoAltura: boolean;
  espacoConfinado: boolean;
  responsavelContato: string;
  clinicaEndereco: string;
  userId: string;
};

export const buildAsoAgendamentoInsert = ({
  employee,
  companyName,
  dataExame,
  tipoExame,
  obraLocal,
  trabalhoAltura,
  espacoConfinado,
  responsavelContato,
  clinicaEndereco,
  userId,
}: BuildAsoAgendamentoParams): AsoAgendamentoInsert => ({
  funcionario_id: employee.id,
  company_id: employee.companyId,
  funcionario_nome: employee.name,
  empresa: companyName,
  funcao: employee.cargo,
  data_exame: dataExame || null,
  tipo_exame: tipoExame.toLowerCase(),
  obra_local: obraLocal,
  trabalho_altura: trabalhoAltura,
  espaco_confinado: espacoConfinado,
  responsavel_contato: responsavelContato,
  clinica_endereco: clinicaEndereco,
  cpf: employee.cpf,
  rg: employee.rg,
  data_admissao: employee.dataAdmissao || null,
  user_id: userId,
  status: 'pendente',
});
