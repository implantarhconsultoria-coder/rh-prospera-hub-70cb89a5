// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getDocument } from 'npm:pdfjs-serverless@0.3.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const num = (s: any) => {
  if (s === null || s === undefined) return null;
  const v = String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
};

const onlyDigits = (s: any) => (s ? String(s).replace(/[^0-9]/g, '') : '');

const parseDate = (s: any) => {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const cleanLine = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

const isCabecalhoOuRodape = (linha: string) => {
  const t = normalize(linha);
  return (
    !t ||
    t.length < 3 ||
    t.startsWith('PAGINA ') ||
    t.startsWith('PAG. ') ||
    t.startsWith('EMISSAO') ||
    t.startsWith('EMISSAO') ||
    t.startsWith('DATA ') ||
    t.startsWith('HORA ') ||
    t.includes('RELATORIO') ||
    t.includes('SISTEMA ANTERIOR') ||
    t.includes('TOPAC') ||
    t.includes('IMPLANTARH') ||
    t.includes('TOTAL GERAL') ||
    t.includes('USUARIO:') ||
    t.includes('FILTRO:')
  );
};

function detectarTipo(texto: string): { tipo: string; motivo: string } {
  const t = normalize(texto);

  if (t.includes('RELATORIO SINTETICO DE CLIENTES')) {
    return { tipo: 'cliente', motivo: 'Título reconhecido: Relatório Sintético de Clientes' };
  }
  if (t.includes('RELATORIO SINTETICO DE REPRESENTANTES')) {
    return { tipo: 'representante', motivo: 'Título reconhecido: Relatório Sintético de Representantes' };
  }
  if (t.includes('RELATORIO HISTORICO DE LOCACAO') || t.includes('HISTORICO DE LOCACAO')) {
    return { tipo: 'historico', motivo: 'Título reconhecido: Histórico de Locação' };
  }
  if (
    t.includes('RELATORIO DE EQUIPAMENTOS') ||
    t.includes('POR TIPO DE EQUIPAMENTO COM N O DE PATRIMONIO') ||
    t.includes('POR TIPO DE EQUIPAMENTO COM NO DE PATRIMONIO') ||
    t.includes('POR TIPO DE EQUIPAMENTO COM Nº DE PATRIMONIO') ||
    (t.includes('PATRIMONIO') && t.includes('EQUIPAMENTO'))
  ) {
    return { tipo: 'equipamento', motivo: 'Título reconhecido: Relatório de Equipamentos / Patrimônios' };
  }

  if ((t.includes('CPF') || t.includes('CNPJ')) && (t.includes('CLIENTE') || t.includes('RAZAO SOCIAL'))) {
    return { tipo: 'cliente', motivo: 'Heurística: documento + cliente/razão social' };
  }
  if (t.includes('REPRESENTANTE')) {
    return { tipo: 'representante', motivo: 'Heurística: texto contém representante' };
  }
  if (t.includes('PATRIMONIO') && (t.includes('SERIE') || t.includes('SITUACAO') || t.includes('EQUIPAMENTO'))) {
    return { tipo: 'equipamento', motivo: 'Heurística: texto contém patrimônio/equipamento' };
  }
  if (t.includes('OS') && t.includes('PEDIDO') && t.includes('NF') && t.includes('LOCACAO')) {
    return { tipo: 'historico', motivo: 'Heurística: OS + pedido + NF + locação' };
  }

  return { tipo: 'desconhecido', motivo: 'Nenhum padrão conhecido encontrado no texto extraído' };
}

function extrairLinhasDePagina(items: any[]) {
  const buckets = new Map<string, Array<{ x: number; text: string }>>();

  for (const item of items || []) {
    const text = cleanLine('str' in item ? item.str : '');
    if (!text) continue;

    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    const bucket = (Math.round(y * 2) / 2).toFixed(1);
    const current = buckets.get(bucket) || [];
    current.push({ x, text });
    buckets.set(bucket, current);
  }

  const lines = [...buckets.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([, grouped]) =>
      cleanLine(
        grouped
          .sort((a, b) => a.x - b.x)
          .map((entry) => entry.text)
          .join(' '),
      ),
    )
    .filter(Boolean);

  return lines;
}

async function extrairTexto(bytes: Uint8Array): Promise<{ texto: string; paginas: number; qualidade: 'boa' | 'ruim' }> {
  try {
    const document = await getDocument({
      data: bytes,
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    const partes: string[] = [];

    for (let pagina = 1; pagina <= document.numPages; pagina += 1) {
      const page = await document.getPage(pagina);
      const textContent = await page.getTextContent();
      const linhas = extrairLinhasDePagina(textContent.items as any[]);
      const fallback = cleanLine(
        (textContent.items as any[])
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' '),
      );
      const pageText = linhas.length ? linhas.join('\n') : fallback;
      if (pageText) partes.push(pageText);
    }

    const texto = partes.join('\n\n').trim();
    const letras = (texto.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    const qualidade: 'boa' | 'ruim' = texto.length > 80 && letras > 30 ? 'boa' : 'ruim';

    return { texto, paginas: document.numPages || 0, qualidade };
  } catch (error) {
    console.error('extrairTexto erro', error);
    return { texto: '', paginas: 0, qualidade: 'ruim' };
  }
}

function extrairClientes(linhas: string[]) {
  const regs: any[] = [];

  for (const original of linhas) {
    const linha = cleanLine(original);
    if (!linha || isCabecalhoOuRodape(linha)) continue;

    const cnpj = linha.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    const cpf = !cnpj ? linha.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/) : null;
    if (!cnpj && !cpf) continue;

    const documento = cnpj?.[0] || cpf?.[0] || '';
    const codigoMatch = linha.match(/^(\d{1,8})\s+/);
    const codigo = codigoMatch?.[1] || null;

    const nomeParte = cleanLine(linha.split(documento)[0].replace(/^(\d{1,8})\s+/, ''));
    const resto = cleanLine(linha.split(documento).slice(1).join(documento));

    const cepMatch = resto.match(/\d{5}-?\d{3}/);
    const ieMatch = resto.match(/(?:IE|INSC(?:RICAO)?\s+ESTADUAL)\s*[:\-]?\s*([0-9A-Z.\/-]+)/i);
    const cidadeUfCep = resto.match(/([A-Za-zÀ-ÿ'´`\-\s]+?)\s+([A-Z]{2})(?:\s+(\d{5}-?\d{3}))?$/);

    const cidade = cidadeUfCep?.[1] ? cleanLine(cidadeUfCep[1]) : null;
    const uf = cidadeUfCep?.[2] || null;
    const cep = cidadeUfCep?.[3] || cepMatch?.[0] || null;

    let endereco = resto;
    if (cidadeUfCep?.[0]) endereco = endereco.replace(cidadeUfCep[0], '');
    if (ieMatch?.[0]) endereco = endereco.replace(ieMatch[0], '');
    if (cepMatch?.[0]) endereco = endereco.replace(cepMatch[0], '');
    endereco = cleanLine(endereco.replace(/\b\d{2}\.\d{3}\.\d{3}\/?\d{4}-?\d{2}\b/, ''));

    regs.push({
      codigo_dn4: codigo,
      nome_razao_social: nomeParte || null,
      cpf_cnpj: onlyDigits(documento) || null,
      inscricao_estadual: ieMatch?.[1] || null,
      endereco: endereco || null,
      bairro: null,
      cidade,
      uf,
      cep,
      linha_original_extraida: { raw: linha },
      status: nomeParte ? 'pendente_conferencia' : 'erro_leitura',
      mensagem_erro: nomeParte ? null : 'coluna obrigatória ausente: razão social/nome',
    });
  }

  return regs;
}

function extrairRepresentantes(linhas: string[]) {
  const regs: any[] = [];

  for (const original of linhas) {
    const linha = cleanLine(original);
    if (!linha || isCabecalhoOuRodape(linha)) continue;

    const codigoMatch = linha.match(/^(\d{1,8})\s+/);
    const documentoMatch = linha.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
    const emailMatch = linha.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const telefoneMatch = linha.match(/(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}/);
    const cidadeUfMatch = linha.match(/([A-Za-zÀ-ÿ'´`\-\s]+?)\s+([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);

    if (!codigoMatch && !documentoMatch && !emailMatch && !telefoneMatch) continue;

    let nome = linha.replace(/^(\d{1,8})\s+/, '');
    if (documentoMatch?.[0]) nome = nome.replace(documentoMatch[0], ' ');
    if (emailMatch?.[0]) nome = nome.replace(emailMatch[0], ' ');
    if (telefoneMatch?.[0]) nome = nome.replace(telefoneMatch[0], ' ');
    if (cidadeUfMatch?.[0]) nome = nome.replace(cidadeUfMatch[0], ' ');
    nome = cleanLine(nome);

    const doc = documentoMatch?.[0] || '';
    const tipoPessoa = doc.length === 11 ? 'PF' : doc.length === 14 ? 'PJ' : null;

    regs.push({
      codigo_dn4: codigoMatch?.[1] || null,
      nome: nome || null,
      cpf_cnpj: doc ? onlyDigits(doc) : null,
      telefone: telefoneMatch?.[0] || null,
      email: emailMatch?.[0] || null,
      cidade: cidadeUfMatch?.[1] ? cleanLine(cidadeUfMatch[1]) : null,
      uf: cidadeUfMatch?.[2] || null,
      tipo_pessoa: tipoPessoa,
      linha_original_extraida: { raw: linha },
      status: nome ? 'pendente_conferencia' : 'erro_leitura',
      mensagem_erro: nome ? null : 'coluna obrigatória ausente: nome do representante',
    });
  }

  return regs;
}

function extrairEquipamentos(linhas: string[]) {
  const regs: any[] = [];

  for (const original of linhas) {
    const linha = cleanLine(original);
    if (!linha || isCabecalhoOuRodape(linha)) continue;

    const lead = linha.match(/^(\d{1,8})\s+(\d{3,14})\s+(.+)$/);
    if (!lead) continue;

    const codigo = lead[1];
    const patrimonio = lead[2];
    let corpo = lead[3];

    const valores = [...corpo.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)];
    const valorTexts = valores.map((match) => match[0]);
    if (valores[0]?.index !== undefined) {
      corpo = corpo.slice(0, valores[0].index).trim();
    }

    const situacaoMatch = normalize(corpo).match(/\b(ATIVO|INATIVO|LOCADO|MANUTENCAO|VENDIDO|BAIXADO|DISPONIVEL)\b/);
    const situacao = situacaoMatch?.[1]
      ? situacaoMatch[1]
          .replace('MANUTENCAO', 'MANUTENÇÃO')
          .replace('DISPONIVEL', 'DISPONÍVEL')
      : null;

    let descricao = corpo;
    if (situacao) {
      descricao = cleanLine(descricao.replace(new RegExp(situacao.replace(/[ÍÇÃÕ]/g, '.'), 'i'), ' '));
    }

    const serieMatch = descricao.match(/(?:SERIE|NR\.?\s*SERIE|N\.?\s*SERIE)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i);
    const filialMatch = descricao.match(/(?:FILIAL|FIL\.?)\s*[:\-]?\s*([A-Z0-9\-\/ ]+)/i);
    const tipoGrupoMatch = descricao.match(/(?:GRUPO|TIPO)\s*[:\-]?\s*([A-Z0-9À-ÿ\-\/ ]+)/i);

    regs.push({
      codigo_equipamento: codigo,
      numero_patrimonio: patrimonio,
      descricao: descricao || null,
      tipo_equipamento: tipoGrupoMatch?.[1] ? cleanLine(tipoGrupoMatch[1]) : null,
      grupo: tipoGrupoMatch?.[1] ? cleanLine(tipoGrupoMatch[1]) : null,
      filial_opera: filialMatch?.[1] ? cleanLine(filialMatch[1]) : null,
      situacao,
      numero_serie: serieMatch?.[1] || null,
      valor_venda: valorTexts[0] ? num(valorTexts[0]) : null,
      valor_compra: valorTexts[1] ? num(valorTexts[1]) : null,
      valor_mercado: valorTexts[2] ? num(valorTexts[2]) : null,
      valor_indenizacao: valorTexts[3] ? num(valorTexts[3]) : null,
      linha_original_extraida: { raw: linha },
      status: patrimonio ? 'pendente_conferencia' : 'erro_leitura',
      mensagem_erro: patrimonio ? null : 'coluna obrigatória ausente: número do patrimônio',
    });
  }

  return regs;
}

function extrairHistorico(linhas: string[]) {
  const regs: any[] = [];

  for (const original of linhas) {
    const linha = cleanLine(original);
    if (!linha || isCabecalhoOuRodape(linha)) continue;

    const datas = [...linha.matchAll(/\d{2}\/\d{2}\/\d{4}/g)];
    if (datas.length < 2) continue;

    const tokens = linha.split(/\s+/);
    const os = tokens[0] || null;
    const pedido = tokens[1] || null;
    const patrimonio = tokens.find((token, index) => index > 1 && /^\d{3,14}$/.test(token)) || null;

    const nfMatches = [...linha.matchAll(/\bNF\s*[:\-]?\s*(\d{1,12})\b/gi)];
    const nfDireta = nfMatches.at(-1)?.[1] || null;
    const numerosCurtos = tokens.filter((token) => /^\d{3,12}$/.test(token));
    const numeroNf = nfDireta || numerosCurtos.at(-1) || null;

    const valores = [...linha.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map((match) => num(match[0])).filter((value) => value !== null);
    const inicio = datas[0]?.[0] || null;
    const fim = datas[1]?.[0] || null;

    const beforePatrimonio = patrimonio ? linha.split(patrimonio)[0] : linha;
    const headTokens = beforePatrimonio.split(/\s+/).slice(2);
    const clienteNome = cleanLine(headTokens.join(' ')) || null;

    const descStart = patrimonio ? linha.indexOf(patrimonio) + patrimonio.length : 0;
    const descEnd = datas[0]?.index ?? linha.length;
    const descricao = cleanLine(linha.slice(descStart, descEnd)) || null;

    regs.push({
      numero_os: os,
      pedido,
      cliente_nome: clienteNome,
      patrimonio,
      descricao_equipamento: descricao,
      periodo_texto: inicio && fim ? `${inicio} a ${fim}` : null,
      data_inicio: parseDate(inicio),
      data_fim: parseDate(fim),
      valor_diaria_periodo: valores.length >= 2 ? valores[valores.length - 2] : valores[0] ?? null,
      valor_faturado_periodo: valores.length >= 1 ? valores[valores.length - 1] : null,
      numero_nf: numeroNf,
      filial: null,
      linha_original_extraida: { raw: linha },
      status: os && patrimonio ? 'pendente_conferencia' : 'erro_leitura',
      mensagem_erro: os && patrimonio ? null : 'coluna obrigatória ausente: OS ou patrimônio',
    });
  }

  return regs;
}

async function limparStaging(supabase: any, importacaoId: string) {
  await supabase.from('staging_clientes_dn4').delete().eq('importacao_id', importacaoId);
  await supabase.from('staging_representantes_dn4').delete().eq('importacao_id', importacaoId);
  await supabase.from('staging_equipamentos_dn4').delete().eq('importacao_id', importacaoId);
  await supabase.from('staging_historico_locacao_dn4').delete().eq('importacao_id', importacaoId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    const body = await req.json();
    const importacaoId = body?.importacao_id;
    const storagePath = body?.storage_path;
    const tipoForcado = body?.tipo_forcado;

    if (!importacaoId || !storagePath) {
      return new Response(JSON.stringify({ error: 'parametros_invalidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: file, error: downloadError } = await supabase.storage.from('dn4-imports').download(storagePath);

    if (downloadError || !file) {
      await supabase
        .from('importacoes_dn4')
        .update({
          status: 'erro',
          tipo: 'desconhecido',
          mensagem: `Erro ao ler PDF: falha ao baixar o arquivo (${downloadError?.message || 'arquivo indisponível'})`,
          finalizado_em: new Date().toISOString(),
        })
        .eq('id', importacaoId);

      return new Response(JSON.stringify({ ok: false, error: 'download_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { texto, paginas, qualidade } = await extrairTexto(bytes);
    const previa = texto.slice(0, 4000);

    if (!texto || qualidade === 'ruim') {
      await limparStaging(supabase, importacaoId);
      await supabase
        .from('importacoes_dn4')
        .update({
          tipo: 'desconhecido',
          status: 'pdf_sem_texto',
          total_lidos: 0,
          total_pendentes: 0,
          total_erros: 0,
          mensagem: `Arquivo sem texto legível. ${paginas} página(s) analisada(s). Se o PDF for escaneado, ele precisa de conferência manual ou nova exportação com texto nativo.`,
          texto_extraido: previa,
          finalizado_em: new Date().toISOString(),
        })
        .eq('id', importacaoId);

      return new Response(JSON.stringify({ ok: true, status: 'pdf_sem_texto' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let tipo = tipoForcado && tipoForcado !== 'auto' ? tipoForcado : null;
    let motivoDeteccao = tipo ? 'Tipo selecionado manualmente' : '';

    if (!tipo) {
      const detectado = detectarTipo(texto);
      tipo = detectado.tipo;
      motivoDeteccao = detectado.motivo;
    }

    if (tipo === 'desconhecido') {
      await limparStaging(supabase, importacaoId);
      await supabase
        .from('importacoes_dn4')
        .update({
          tipo: 'desconhecido',
          status: 'tipo_nao_identificado',
          total_lidos: 0,
          total_pendentes: 0,
          total_erros: 0,
          mensagem: `Tipo não identificado automaticamente. ${motivoDeteccao}. Use a opção de reprocessar e selecione manualmente Clientes, Representantes, Equipamentos / Patrimônios ou Histórico de Locação.`,
          texto_extraido: previa,
          finalizado_em: new Date().toISOString(),
        })
        .eq('id', importacaoId);

      return new Response(JSON.stringify({ ok: true, status: 'tipo_nao_identificado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await limparStaging(supabase, importacaoId);

    const linhas = texto
      .split('\n')
      .map(cleanLine)
      .filter((linha) => linha.length > 0);

    let registros: any[] = [];
    if (tipo === 'cliente') registros = extrairClientes(linhas);
    else if (tipo === 'representante') registros = extrairRepresentantes(linhas);
    else if (tipo === 'equipamento') registros = extrairEquipamentos(linhas);
    else if (tipo === 'historico') registros = extrairHistorico(linhas);

    const tabela =
      tipo === 'cliente'
        ? 'staging_clientes_dn4'
        : tipo === 'representante'
          ? 'staging_representantes_dn4'
          : tipo === 'equipamento'
            ? 'staging_equipamentos_dn4'
            : 'staging_historico_locacao_dn4';

    let errosGravacao = 0;
    const totalLidos = registros.length;
    const totalErrosLeitura = registros.filter((registro) => registro.status === 'erro_leitura').length;

    if (registros.length > 0) {
      const rows = registros.map((registro) => ({
        ...registro,
        importacao_id: importacaoId,
        arquivo_origem: storagePath,
        status: registro.status || 'pendente_conferencia',
        mensagem_erro: registro.mensagem_erro || null,
      }));

      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error: insertError } = await supabase.from(tabela).insert(chunk);
        if (insertError) {
          errosGravacao += chunk.length;
          console.error('Erro ao salvar staging', insertError);
        }
      }
    }

    const totalErros = totalErrosLeitura + errosGravacao;
    const totalPendentes = Math.max(totalLidos - totalErrosLeitura - errosGravacao, 0);

    let status = 'aguardando_conferencia';
    let mensagem = `${motivoDeteccao}. ${totalLidos} registro(s) extraído(s).`;

    if (totalLidos === 0) {
      status = 'sem_registros';
      mensagem = `${motivoDeteccao}. O parser não encontrou linhas válidas para este layout. Verifique a prévia do texto extraído.`;
    } else if (errosGravacao > 0 && totalPendentes === 0) {
      status = 'erro';
      mensagem = `${motivoDeteccao}. Os registros foram identificados, mas houve erro ao salvar no banco.`;
    } else if (totalErros > 0) {
      mensagem = `${motivoDeteccao}. ${totalLidos} registro(s) extraído(s), ${totalPendentes} pendente(s) para conferência e ${totalErros} com erro detalhado.`;
    } else {
      mensagem = `${motivoDeteccao}. ${totalLidos} registro(s) lido(s) e enviados para conferência.`;
    }

    await supabase
      .from('importacoes_dn4')
      .update({
        tipo,
        status,
        total_lidos: totalLidos,
        total_confirmados: 0,
        total_pendentes: totalPendentes,
        total_erros: totalErros,
        mensagem,
        texto_extraido: previa,
        finalizado_em: new Date().toISOString(),
      })
      .eq('id', importacaoId);

    return new Response(
      JSON.stringify({ ok: true, tipo, total_lidos: totalLidos, total_pendentes: totalPendentes, total_erros: totalErros, status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('parse-dn4 erro', error);

    try {
      const cloned = await req.clone().json().catch(() => ({}));
      if (cloned?.importacao_id) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await supabase
          .from('importacoes_dn4')
          .update({
            status: 'erro',
            mensagem: `Erro técnico ao processar PDF: ${String(error?.message || error)}`,
            finalizado_em: new Date().toISOString(),
          })
          .eq('id', cloned.importacao_id);
      }
    } catch (_internalError) {}

    return new Response(JSON.stringify({ error: String(error?.message || error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
