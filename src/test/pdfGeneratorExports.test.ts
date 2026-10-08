import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { gerarFichaSolicitacaoEmpregoPdf, getAsoClinicCommunicationInfo, type FichaASOData } from '@/lib/pdfGenerator';
import * as praia from '@/lib/pdfGeneratorPraia';

const readBlob = (blob: Blob) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
  reader.readAsArrayBuffer(blob);
});

describe('exports usados pelo pré-cadastro e reexportados pelo módulo Praia', () => {
  it('mantém os mesmos geradores disponíveis nos dois módulos', () => {
    expect(praia.gerarFichaSolicitacaoEmpregoPdf).toBe(gerarFichaSolicitacaoEmpregoPdf);
    expect(praia.getAsoClinicCommunicationInfo).toBe(getAsoClinicCommunicationInfo);
  });

  it('expõe a clínica e os horários já usados pela guia ASO de cada unidade', () => {
    const data: FichaASOData = {
      empresa: 'TOPAC MATRIZ', nome: 'Candidato', cpf: '12345678900', funcao: 'Mecânico',
      tipoExame: 'Admissional', trabalhoAltura: false, espacoConfinado: false,
    };
    const matriz = getAsoClinicCommunicationInfo(data);
    expect(matriz.local).toContain('Avenida Sao Joao, 313');
    expect(matriz.horarios.join(' ')).toContain('07h30 AS 15h00');
    const goiania = getAsoClinicCommunicationInfo({ ...data, empresa: 'TOPAC FILIAL GOIANIA' });
    expect(goiania.local).toContain('Rua 18, no. 247');
    expect(goiania.horarios.join(' ')).toContain('13h00 AS 16h30');
    expect(getAsoClinicCommunicationInfo({ ...data, clinica: 'Clínica contratada' }).local).toBe('Clínica contratada');
  });

  it('gera um PDF FSE A4 com os dados reais de todas as seções e experiências', async () => {
    const { blob, fileName } = gerarFichaSolicitacaoEmpregoPdf({
      empresa: 'TOPAC MATRIZ', funcao: 'TECNICO DE MANUTENCAO',
      fse: {
        nome: 'CANDIDATO DA FICHA', data_preenchimento: '2026-10-08', cpf: '12345678900',
        pai: 'NOME DO PAI', mae: 'NOME DA MAE', data_nascimento: '1990-05-20', dependentes: 0,
        filhos: [{ nome: 'FILHO DA FICHA', nascimento: '2015-01-02' }],
        logradouro: 'RUA DA FICHA', numero: '100', cidade: 'SAO PAULO', estado: 'SP', cep: '01000000',
        email: 'candidato@example.test', celular: '11999999999', escolaridade_nivel: 'ENSINO TECNICO',
        formacao_tecnica: [{ curso: 'CURSO DE MANUTENCAO', ano: '2020' }],
        experiencias: Array.from({ length: 6 }, (_, index) => ({
          empresa: `EMPRESA ANTERIOR ${index + 1}`, cidade: 'SAO PAULO', uf: 'SP', cargo: 'TECNICO',
          admissao: '2020-01-01', demissao: '2021-12-31', salario: '3000', justificativa: 'NOVA OPORTUNIDADE',
        })),
        referencias: [{ nome: 'REFERENCIA DA FICHA', fone: '11988888888' }],
        epi_camisa: 'M', epi_calca: '42', epi_bota: '40', atribuicoes: 'MANUTENCAO DE EQUIPAMENTOS',
        outras_informacoes: 'DISPONIBILIDADE PARA VIAJAR', local_uf: 'SAO PAULO/SP',
        data_declaracao: '2026-10-08', declaracao_aceita: true,
      },
    });
    expect(fileName).toBe('FICHA_FSE_2026_TOPAC_MATRIZ_CANDIDATO_DA_FICHA_2026-10-08.pdf');
    const loadingTask = getDocument({ data: await readBlob(blob) });
    const pdf = await loadingTask.promise;
    try {
      const pages: string[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const viewport = page.getViewport({ scale: 1 });
        expect(viewport.width).toBeCloseTo(595.28, 1);
        expect(viewport.height).toBeCloseTo(841.89, 1);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => 'str' in item ? item.str : '').join(' '));
      }
      expect(pdf.numPages).toBeGreaterThan(1);
      const text = pages.join(' ');
      for (const expected of [
        'FICHA DE SOLICITACAO DE EMPREGO', 'CANDIDATO DA FICHA', 'TECNICO DE MANUTENCAO',
        '12345678900', 'FILHO DA FICHA', '02/01/2015', 'RUA DA FICHA', 'ENSINO TECNICO',
        'CURSO DE MANUTENCAO', 'EMPRESA ANTERIOR 1', 'EMPRESA ANTERIOR 6', 'REFERENCIA DA FICHA',
        'MANUTENCAO DE EQUIPAMENTOS', 'DISPONIBILIDADE PARA VIAJAR', 'Confirmado digitalmente pelo candidato',
      ]) expect(text).toContain(expected);
      expect(pages.every(page => page.includes('TOPAC RH PRO'))).toBe(true);
    } finally {
      await loadingTask.destroy();
    }
  });
});
