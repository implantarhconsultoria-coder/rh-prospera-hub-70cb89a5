import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAsoAgendamentoInsert } from '@/lib/asoAgendamento';

describe('vínculo do agendamento de ASO', () => {
  it('mantém os dados atuais e salva os IDs do funcionário e da empresa', () => {
    const payload = buildAsoAgendamentoInsert({
      employee: {
        id: 'funcionario-1',
        companyId: 'empresa-1',
        name: 'Maria da Silva',
        cargo: 'Eletricista',
        cpf: '123.456.789-00',
        rg: '12.345.678-9',
        dataAdmissao: '2025-01-10',
      },
      companyName: 'TOPAC FILIAL PRAIA GRANDE',
      dataExame: '2026-06-20',
      tipoExame: 'Periódico',
      obraLocal: 'Obra Praia',
      trabalhoAltura: true,
      espacoConfinado: false,
      responsavelContato: 'Responsável RH',
      clinicaEndereco: 'Clínica Praia',
      userId: 'usuario-1',
    });

    expect(payload).toMatchObject({
      funcionario_id: 'funcionario-1',
      company_id: 'empresa-1',
      funcionario_nome: 'Maria da Silva',
      empresa: 'TOPAC FILIAL PRAIA GRANDE',
      funcao: 'Eletricista',
      cpf: '123.456.789-00',
      tipo_exame: 'periódico',
      clinica_endereco: 'Clínica Praia',
      status: 'pendente',
    });
  });

  it('mantém na migration o backfill, status, vencimento e sincronização da ficha', () => {
    const migration = readFileSync(
      'supabase/migrations/20260610120000_aso_agendamentos_vinculo_funcionario_empresa.sql',
      'utf8',
    );

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS funcionario_id uuid');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS company_id uuid');
    expect(migration).toContain("regexp_replace(coalesce(agendamento.cpf, ''), '\\D', '', 'g')");
    expect(migration).toContain('SET company_id = funcionario.company_id');
    expect(migration).toContain("SET status = 'vencido'");
    expect(migration).toContain('aso_agendamentos_status_check');
    expect(migration).toContain("'pendente', 'agendado', 'confirmado', 'realizado', 'cancelado', 'vencido'");
    expect(migration).toContain('idx_aso_agendamentos_funcionario_id');
    expect(migration).toContain('idx_aso_agendamentos_company_id');
    expect(migration).toContain("IF NEW.status = 'realizado'");
    expect(migration).toContain('SET data_exame_medico = NEW.data_exame');
  });
});
