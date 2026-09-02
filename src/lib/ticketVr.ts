export type TicketVrConfig = {
  codigoClienteTicket: string;
  unidadeEntrega: string;
  departamento: string;
  tipoLogradouro: string;
  logradouro: string;
  numero: string;
  cidade: string;
  bairro: string;
  cep: string;
  uf: string;
  interlocutor: string;
  ddd: string;
  telefone: string;
};

export type TicketVrRow = {
  id: string;
  nome: string;
  cpf: string;
  dataNascimento: string;
  valorDiario: number;
  diasUteis: number;
  faltasDatas: string[];
  diasPagos: number;
  total: number;
  pendencias: string[];
};

const ASCII = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').toUpperCase();
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const pad = (value: unknown, length: number, align: 'left' | 'right' = 'left', fill = ' ') => {
  const clean = ASCII(value).slice(0, length);
  return align === 'right' ? clean.padStart(length, fill) : clean.padEnd(length, fill);
};
const put = (line: string[], start: number, length: number, value: string) => {
  const text = value.slice(0, length).padEnd(length, ' ');
  for (let index = 0; index < length; index += 1) line[start - 1 + index] = text[index];
};
const blankLine = () => Array.from({ length: 164 }, () => ' ');
const sequence = (value: number) => String(value).padStart(6, '0').slice(-6);
const money8 = (value: number) => String(Math.round(Math.max(0, value) * 100)).padStart(8, '0').slice(-8);
const money14 = (value: number) => String(Math.round(Math.max(0, value) * 100)).padStart(14, '0').slice(-14);
const date8 = (iso: string) => {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}${match[2]}${match[1]}` : '00000000';
};
const compactDate = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).split('-');
  return `${parts[0]}${parts[1]}${parts[2]}`;
};
const compactTime = (date = new Date()) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date).replace(/:/g, '.');

export const ticketVrPreflight = (company: { cnpj?: string; nome?: string }, config: TicketVrConfig, rows: TicketVrRow[]) => {
  const errors: string[] = [];
  if (digits(company.cnpj).length !== 14) errors.push('CNPJ da empresa ausente ou inválido.');
  if (ASCII(config.codigoClienteTicket).length !== 10) errors.push('Código Cliente Ticket deve possuir exatamente 10 posições conforme o modelo. Não use o número de contrato de 13 dígitos.');
  if (!config.unidadeEntrega.trim()) errors.push('Unidade de entrega Ticket não configurada.');
  if (!config.logradouro.trim() || !config.cidade.trim() || !config.uf.trim()) errors.push('Endereço da unidade Ticket incompleto.');
  if (!config.interlocutor.trim()) errors.push('Interlocutor Ticket não configurado.');
  if (!rows.length) errors.push('Nenhum funcionário com VR ativo foi encontrado.');
  const cpfs = new Set<string>();
  rows.forEach((row) => {
    if (row.pendencias.length) errors.push(`${row.nome}: ${row.pendencias.join(' / ')}`);
    const cpf = digits(row.cpf);
    if (cpf.length === 11) {
      if (cpfs.has(cpf)) errors.push(`${row.nome}: CPF duplicado na geração.`);
      cpfs.add(cpf);
    }
  });
  return Array.from(new Set(errors));
};

export const buildTicketVrTxt = (company: { nome: string; cnpj: string }, competencia: string, config: TicketVrConfig, rows: TicketVrRow[]) => {
  const errors = ticketVrPreflight(company, config, rows);
  if (errors.length) throw new Error(errors.join('\n'));
  let seq = 1;
  const output: string[] = [];

  const h = blankLine();
  put(h, 1, 5, 'LSUP0');
  put(h, 6, 3, 'SUP');
  put(h, 25, 8, compactDate());
  put(h, 33, 8, compactTime());
  put(h, 41, 18, 'LAYOUT-16/06/2014');
  output.push(h.join(''));

  const [year, month] = competencia.split('-').map(Number);
  const competenceEnd = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  // Layout oficial TR020:
  // 1-5 TR020 | 6 R | 7-16 código cliente | 17-46 empresa | 47-54 emissão | 55-62 competência/fim | 63 C
  const r20 = blankLine();
  put(r20, 1, 5, 'TR020');
  put(r20, 6, 1, 'R');
  put(r20, 7, 10, pad(config.codigoClienteTicket, 10));
  put(r20, 17, 30, pad(company.nome, 30));
  put(r20, 47, 8, compactDate());
  put(r20, 55, 8, date8(competenceEnd));
  put(r20, 63, 1, 'C');
  put(r20, 80, 2, '03');
  put(r20, 101, 4, '0434');
  put(r20, 153, 3, 'SUP');
  put(r20, 159, 6, sequence(seq++));
  output.push(r20.join(''));

  const r22 = blankLine();
  put(r22, 1, 5, 'TR022');
  put(r22, 6, 25, pad(config.unidadeEntrega, 25));
  put(r22, 32, 1, pad(config.tipoLogradouro || 'R', 1));
  put(r22, 36, 30, pad(config.logradouro, 30));
  put(r22, 66, 14, pad(config.numero, 14));
  put(r22, 82, 25, pad(config.cidade, 25));
  put(r22, 107, 15, pad(config.bairro, 15));
  put(r22, 122, 5, digits(config.cep).slice(0, 5).padEnd(5, ' '));
  put(r22, 127, 2, pad(config.uf, 2));
  put(r22, 129, 20, pad(config.interlocutor, 20));
  put(r22, 149, 3, digits(config.ddd).padStart(3, '0').slice(-3));
  put(r22, 152, 7, digits(config.telefone).slice(-7).padStart(7, ' '));
  put(r22, 159, 6, sequence(seq++));
  output.push(r22.join(''));

  rows.forEach((row) => {
    const cpf = digits(row.cpf);
    const detail = blankLine();
    put(detail, 1, 5, 'TR023');
    put(detail, 6, 25, pad(config.departamento || 'DEPARTAMENTO', 25));
    put(detail, 32, 11, cpf);
    put(detail, 43, 8, date8(row.dataNascimento));
    put(detail, 70, 25, pad(config.unidadeEntrega, 25));
    put(detail, 96, 3, '001');
    put(detail, 99, 3, '010');
    put(detail, 102, 8, money8(row.total));
    // Layout oficial do modelo: posições 110-111 = RE; nome inicia na posição 112.
    put(detail, 110, 2, 'RE');
    put(detail, 112, 35, pad(row.nome, 35));
    put(detail, 148, 11, cpf);
    put(detail, 159, 6, sequence(seq++));
    output.push(detail.join(''));
  });

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const trailer = blankLine();
  put(trailer, 1, 5, 'TR029');
  put(trailer, 6, 8, String(rows.length).padStart(8, '0'));
  put(trailer, 14, 14, money14(total));
  put(trailer, 159, 6, sequence(seq++));
  output.push(trailer.join(''));

  const fileTrailer = blankLine();
  put(fileTrailer, 1, 5, 'LSUP9');
  put(fileTrailer, 6, 8, '00000001');
  put(fileTrailer, 14, 8, String(rows.length).padStart(8, '0'));
  put(fileTrailer, 22, 8, String(rows.length).padStart(8, '0'));
  output.push(fileTrailer.join(''));

  const invalid = output.find((line) => line.length !== 164);
  if (invalid) throw new Error('Falha estrutural Ticket: registro diferente de 164 posições.');

  const header = output[1];
  const firstDetail = output[3];
  if (header.slice(0, 6) !== 'TR020R' || header.slice(6, 16).length !== 10) {
    throw new Error('Falha estrutural Ticket: identificação da empresa fora das posições oficiais do TR020.');
  }
  if (firstDetail && firstDetail.slice(109, 111) !== 'RE') {
    throw new Error('Falha estrutural Ticket: código de benefício RE fora das posições oficiais do TR023.');
  }

  return `${output.join('\r\n')}\r\n`;
};

export const downloadTicketTxt = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=us-ascii' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const sha256 = async (content: string) => {
  const data = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
