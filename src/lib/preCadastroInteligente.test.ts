import { describe, expect, it } from 'vitest';
import { interpretarEValidarPreCadastroLivre } from '@/lib/preCadastroInteligenteNormalizacao';

const options = {
  companies: [
    { id: 'company-matriz', name: 'TOPAC MATRIZ' },
    { id: 'company-praia', name: 'TOPAC FILIAL PRAIA GRANDE' },
  ],
  roles: ['AUXILIAR ADMINISTRATIVO', 'VENDEDOR'],
};

const parse = (text: string) => interpretarEValidarPreCadastroLivre(text, options);

const expectAmandaBase = (result: ReturnType<typeof parse>) => {
  expect(result.empresa.value).toEqual({ id: 'company-matriz', name: 'TOPAC MATRIZ' });
  expect(result.nome.value).toBe('Amanda Oliveira Santos');
  expect(result.cpf.display).toBe('391.185.668-95');
  expect(result.rg.display).toBe('38.117.972-2');
  expect(result.dataNascimento.value).toBe('1999-12-17');
  expect(result.dataNascimento.display).toBe('17/12/1999');
  expect(result.dataAdmissao.value).toBe('2026-09-08');
  expect(result.dataAdmissao.display).toBe('08/09/2026');
  expect(result.funcao.value).toBe('Auxiliar Administrativo');
  expect(result.setorGhe.status).toBe('missing');
  expect(result.obraLocal.status).toBe('missing');
  expect(result.salario.value).toBe(2400);
  expect(result.email.value).toBe('yamandaoliveirasantos@gmail.com');
  expect(result.celular.display).toBe('(11) 98643-2509');
  expect(result.vr.value).toEqual({ enabled: true, dailyValue: 31 });
  expect(result.vt.value).toEqual({ enabled: true, dailyValue: null });
  expect(result.vt.display).toBe('VT: SIM — valor ainda não informado');
  expect(result.insalubridade.value).toBe(false);
};

describe('Pre-Cadastro Inteligente - testes obrigatorios', () => {
  it('TESTE 1 - exemplo real fora de ordem', () => {
    const result = parse('vr sim 31 dia vt sim ainda nao sei valor Amanda Oliveira Santos salario 2400 inicial admissao 08/09/2026 insalubridade nao CPF 39118566895 RG 381179722 auxiliar administrativo topac matriz celular 11986432509 nascimento 17/12/1999 email yamandaoliveirasantos@gmail.com');
    expectAmandaBase(result);
  });

  it('TESTE 2 - outra ordem sem depender da posicao', () => {
    const result = parse('39118566895 Amanda Oliveira Santos 2400 topac matriz vr 31/dia 17/12/1999 auxiliar administrativo admissao 08/09/2026 yamandaoliveirasantos@gmail.com insalubridade nao 11986432509 RG 381179722 vt sim');
    expectAmandaBase(result);
  });

  it('TESTE 3 - uma informacao por linha', () => {
    const result = parse(`Amanda Oliveira Santos
VR 31 reais por dia
CPF 39118566895
salário inicial 2400
VT SIM
celular 11986432509
email yamandaoliveirasantos@gmail.com
auxiliar administrativo
nascimento 17/12/1999
topac matriz
admissão 08/09/2026
RG 381179722
sem insalubridade`);
    expectAmandaBase(result);
  });

  it('TESTE 4 - campos faltantes permanecem nao informados', () => {
    const result = parse(`Amanda Oliveira Santos
CPF 39118566895
TOPAC MATRIZ
salário 2400`);
    expect(result.empresa.value).toEqual({ id: 'company-matriz', name: 'TOPAC MATRIZ' });
    expect(result.nome.value).toBe('Amanda Oliveira Santos');
    expect(result.cpf.display).toBe('391.185.668-95');
    expect(result.salario.value).toBe(2400);
    expect(result.rg.status).toBe('missing');
    expect(result.dataNascimento.status).toBe('missing');
    expect(result.dataAdmissao.status).toBe('missing');
    expect(result.funcao.status).toBe('missing');
    expect(result.setorGhe.status).toBe('missing');
    expect(result.obraLocal.status).toBe('missing');
    expect(result.email.status).toBe('missing');
    expect(result.celular.status).toBe('missing');
    expect(result.vr.status).toBe('missing');
    expect(result.vt.status).toBe('missing');
    expect(result.insalubridade.status).toBe('missing');
  });

  it('TESTE 5 - VT sim sem valor nunca vira VT nao', () => {
    const result = parse('Amanda Oliveira Santos vt sim ainda não sei o valor');
    expect(result.vt.value).toEqual({ enabled: true, dailyValue: null });
    expect(result.vt.display).toBe('VT: SIM — valor ainda não informado');
  });

  it('TESTE 6 - salario conflitante exige decisao', () => {
    const result = parse('Amanda Oliveira Santos salario 2400 salario 2500');
    expect(result.salario.status).toBe('conflict');
    expect(result.salario.value).toBeNull();
    expect(result.salario.candidates?.map((candidate) => candidate.value)).toEqual([2400, 2500]);
  });

  it('TESTE 7 - e-mail sem rotulo e identificado', () => {
    const result = parse('Amanda Oliveira Santos yamandaoliveirasantos@gmail.com 39118566895');
    expect(result.nome.value).toBe('Amanda Oliveira Santos');
    expect(result.cpf.display).toBe('391.185.668-95');
    expect(result.email.value).toBe('yamandaoliveirasantos@gmail.com');
  });

  it('TESTE 8 - formato real numerado com markdown e =>', () => {
    const result = parse(`1. **Empresa contratante** => TOPAC MATRIZ
2. **Nome** => Amanda Oliveira Santos
3. **CPF** => 39118566895
4. **RG** => 381179722
5. **Data de nascimento** => 17/12/1999
6. **Data de admissão** => 08/09/2026
7. **Função** => Auxiliar Administrativo
8. **Setor/GHE** => Não informado
9. **Obra/Local** => Não informado
10. **Salário** => R$ 2.400,00
11. **E-mail** => yamandaoliveirasantos@gmail.com
12. **Celular** => 11986432509
13. **VR** => Sim — R$ 31,00/dia
14. **VT** => Sim — valor ainda não informado
15. **Insalubridade** => Não`);
    expectAmandaBase(result);
  });

  it('TESTE 9 - praia grande vendedor no mesmo formato visual usado pelo usuario', () => {
    const result = parse(`1. **Empresa contratante** => TOPAC FILIAL PRAIA GRANDE
2. **Nome** => Thiago Ferreira Pinto
3. **CPF** => 38914735808
4. **RG** => 3015712772
5. **Data de nascimento** => 01/02/1988
6. **Data de admissão** => 08/09/2026
7. **Função** => Vendedor
8. **Setor/GHE** => Não informado
9. **Obra/Local** => Não informado
10. **Salário** => R$ 2.400,00
11. **E-mail** => thiagobalxada88@gmail.com
12. **Celular** => 13983132720
13. **VR** => Sim — R$ 31,00/dia
14. **VT** => Sim — valor ainda não informado
15. **Insalubridade** => Não`);

    expect(result.empresa.value).toEqual({ id: 'company-praia', name: 'TOPAC FILIAL PRAIA GRANDE' });
    expect(result.nome.value).toBe('Thiago Ferreira Pinto');
    expect(result.cpf.display).toBe('389.147.358-08');
    expect(result.rg.value).toBe('3015712772');
    expect(result.dataNascimento.value).toBe('1988-02-01');
    expect(result.dataAdmissao.value).toBe('2026-09-08');
    expect(result.funcao.value).toBe('Vendedor');
    expect(result.setorGhe.status).toBe('missing');
    expect(result.obraLocal.status).toBe('missing');
    expect(result.salario.value).toBe(2400);
    expect(result.email.value).toBe('thiagobalxada88@gmail.com');
    expect(result.celular.display).toBe('(13) 98313-2720');
    expect(result.vr.value).toEqual({ enabled: true, dailyValue: 31 });
    expect(result.vt.value).toEqual({ enabled: true, dailyValue: null });
    expect(result.insalubridade.value).toBe(false);
  });
});
