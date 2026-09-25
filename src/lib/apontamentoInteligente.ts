import type { Employee } from '@/types/database';

export type ApontamentoTipo = 'he50' | 'he100' | 'comissao';
export type ComissaoModo = 'base' | 'final' | 'pendente';
export type ApontamentoLido = {
  key: string; linha: number; original: string; funcionario: Employee | null; nomeDigitado: string;
  tipo: ApontamentoTipo | null; horas?: number; base?: number; valor?: number;
  percentual?: number; modo?: ComissaoModo; erro?: string;
};

export const normalizarNome = (value: string) => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const lerHoras = (texto: string): number | null => {
  const m = texto.match(/^(\d{1,3})(?:[h:.](\d{1,2}))?$/i);
  if (!m) return null;
  const horas = Number(m[1]); const minutos = Number(m[2] || 0);
  if (minutos >= 60 || (m[2] && m[2].length !== 2 && texto.includes('.'))) return null;
  return Math.round((horas + minutos / 60) * 1000000) / 1000000;
};

export const horasLegiveis = (decimal: number) => {
  const min = Math.round((decimal || 0) * 60);
  return Math.floor(min / 60) + 'h' + String(min % 60).padStart(2, '0');
};

export const lerDinheiro = (texto: string): number | null => {
  let raw = texto.replace(/\s|R\$/gi, '');
  if (!/^\d[\d.,]*$/.test(raw)) return null;
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
};

export const dinheiroLegivel = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const localizarFuncionario = (nome: string, funcionarios: Employee[]): { funcionario: Employee | null; erro?: string } => {
  const busca = normalizarNome(nome);
  if (!busca) return { funcionario: null, erro: 'Nome não informado' };
  const exact = funcionarios.filter(emp => normalizarNome(emp.name) === busca);
  if (exact.length === 1) return { funcionario: exact[0] };
  const parts = busca.split(' ').filter(Boolean);
  const matches = funcionarios.filter(emp => {
    const words = normalizarNome(emp.name).split(' ');
    return words[0] === parts[0] && parts.every(part => words.some(word => word === part));
  });
  if (matches.length === 1) return { funcionario: matches[0] };
  return { funcionario: null, erro: matches.length ? 'Nome ambíguo: selecione o funcionário completo' : 'Funcionário ativo não encontrado nesta empresa' };
};

export const interpretarApontamentos = (texto: string, funcionarios: Employee[], percentualSemanal: number): ApontamentoLido[] =>
  texto.split(/\r?\n/).map((original, index) => ({ original: original.trim(), linha: index + 1 }))
    .filter(row => row.original && !/^[-=>\s]+$/.test(row.original))
    .map(({ original, linha }) => {
      const base = { key: String(linha), linha, original, funcionario: null, nomeDigitado: '', tipo: null } as ApontamentoLido;
      const he = original.match(/^(.+?)\s+(\d{1,3}(?:[h:.]\d{1,2})?)\s*(?:h(?:oras)?)?\s+(50|60|100)\s*%$/i);
      if (he) {
        const nomeDigitado = he[1].trim();
        const found = localizarFuncionario(nomeDigitado, funcionarios);
        const horas = lerHoras(he[2]); const percentual = Number(he[3]);
        return { ...base, nomeDigitado, funcionario: found.funcionario,
          tipo: percentual === 100 ? 'he100' : 'he50', horas: horas ?? undefined, percentual,
          erro: found.erro || (horas === null || horas <= 0 ? 'Hora inválida; use 2h30, 2:30 ou 2.30' :
            percentual !== 100 && percentual !== percentualSemanal ? 'Percentual incompatível com a empresa selecionada' : undefined),
        } as ApontamentoLido;
      }
      const com = original.match(/^(.+?)\s+(?:R\$\s*)?(\d[\d.,]*)\s+(?:(comiss[aã]o\s+final|valor\s+final|final|base|a)\s+)?(?:(?:de|a)\s+)?(\d+(?:[,.]\d+)?)\s*%$/i);
      if (com) {
        const nomeDigitado = com[1].trim();
        const found = localizarFuncionario(nomeDigitado, funcionarios);
        const valor = lerDinheiro(com[2]); const percentual = Number(com[4].replace(',', '.'));
        const marcador = normalizarNome(com[3] || '');
        const modo: ComissaoModo = marcador.includes('final') || marcador.includes('comissao') ? 'final' :
          marcador === 'base' || marcador === 'a' ? 'base' : 'pendente';
        return { ...base, nomeDigitado, funcionario: found.funcionario, tipo: 'comissao',
          valor: valor ?? undefined, percentual, modo,
          base: valor && percentual > 0 && modo === 'final' ? Math.round((valor / (percentual / 100)) * 100) / 100 :
            modo === 'base' ? valor ?? undefined : undefined,
          erro: found.erro || (!valor || !Number.isFinite(percentual) || percentual <= 0 || percentual > 100 ? 'Valor ou percentual de comissão inválido' : undefined),
        } as ApontamentoLido;
      }
      return { ...base, erro: 'Formato não reconhecido. Informe nome, valor e percentual.' };
    }).sort((a, b) => (a.funcionario?.name || a.nomeDigitado || a.original)
      .localeCompare(b.funcionario?.name || b.nomeDigitado || b.original, 'pt-BR') || a.linha - b.linha);
