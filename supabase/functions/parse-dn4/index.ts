// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { Buffer } from 'node:buffer';
import pdfParse from 'npm:pdf-parse@1.1.1/lib/pdf-parse.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const num = (s: any) => {
  if (s === null || s === undefined) return null;
  const v = String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};
const onlyDigits = (s: any) => (s ? String(s).replace(/[^0-9]/g, '') : '');
const parseDate = (s: any) => {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// ====== DETECÇÃO POR TÍTULO/CONTEÚDO =======================================
function detectarTipo(texto: string): { tipo: string; motivo: string } {
  const t = texto.toUpperCase().replace(/\s+/g, ' ');
  if (/RELAT[ÓO]RIO\s+SINT[ÉE]TICO\s+DE\s+CLIENTES/.test(t)) return { tipo: 'cliente', motivo: 'Título "Relatório Sintético de Clientes"' };
  if (/RELAT[ÓO]RIO\s+SINT[ÉE]TICO\s+DE\s+REPRESENTANTES/.test(t)) return { tipo: 'representante', motivo: 'Título "Relatório Sintético de Representantes"' };
  if (/HIST[ÓO]RICO\s+DE\s+LOCA[ÇC][ÃA]O/.test(t)) return { tipo: 'historico', motivo: 'Título "Histórico de Locação"' };
  if (/POR\s+TIPO\s+DE\s+EQUIPAMENTO\s+COM\s+N[ºO]?\s+DE\s+PATRIM[ÔO]NIO/.test(t)) return { tipo: 'equipamento', motivo: 'Título "Por Tipo de Equipamento com Nº de Patrimônio"' };
  if (/RELAT[ÓO]RIO\s+DE\s+EQUIPAMENTOS/.test(t)) return { tipo: 'equipamento', motivo: 'Título "Relatório de Equipamentos"' };
  // heurísticas leves
  if (/N[ºO]\s*PATRIM[ÔO]NIO|PATRIM[ÔO]NIO/.test(t) && /EQUIPAMENTO/.test(t)) return { tipo: 'equipamento', motivo: 'Texto contém "Patrimônio" e "Equipamento"' };
  if (/CNPJ|RAZ[ÃA]O\s+SOCIAL/.test(t) && /CLIENTE/.test(t)) return { tipo: 'cliente', motivo: 'Texto contém "Cliente" + CNPJ/Razão Social' };
  if (/REPRESENTANTE/.test(t)) return { tipo: 'representante', motivo: 'Texto contém "Representante"' };
  return { tipo: 'desconhecido', motivo: 'Nenhum título conhecido encontrado' };
}

// ====== PARSERS ============================================================
function extrairClientes(linhas: string[]) {
  const regs: any[] = [];
  for (const linha of linhas) {
    const cnpj = linha.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    const cpf = !cnpj && linha.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
    if (!cnpj && !cpf) continue;
    const doc = (cnpj?.[1] || cpf?.[1] || '').trim();
    const cep = linha.match(/(\d{5}-?\d{3})/);
    const ufMatch = linha.match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
    const partes = linha.split(doc);
    const antes = (partes[0] || '').trim();
    const depois = (partes.slice(1).join(doc) || '').trim();
    const codigoMatch = antes.match(/^(\d{1,8})\s+/);
    const codigo = codigoMatch?.[1] || '';
    const nome = antes.replace(/^(\d{1,8})\s+/, '').trim();
    const uf = ufMatch?.[1] || '';
    let cidade = depois;
    if (cep) cidade = cidade.replace(cep[1], '');
    if (uf) cidade = cidade.replace(new RegExp(`\\b${uf}\\b`), '');
    cidade = cidade.replace(/\s{2,}/g, ' ').trim();
    regs.push({
      codigo_dn4: codigo || null,
      nome_razao_social: nome || null,
      cpf_cnpj: onlyDigits(doc),
      cep: cep?.[1] || null,
      cidade: cidade || null,
      uf: uf || null,
      linha_original_extraida: { raw: linha },
    });
  }
  return regs;
}

function extrairEquipamentos(linhas: string[]) {
  const regs: any[] = [];
  for (const linha of linhas) {
    // tenta: CODIGO PATRIMONIO DESCRIÇÃO ... [SITUACAO] ... valores
    const m = linha.match(/^(\d{2,8})\s+(\d{3,10})\s+(.+?)(?:\s+(ATIVO|INATIVO|LOCADO|MANUTEN[ÇC][ÃA]O|VENDIDO|BAIXADO|DISPON[ÍI]VEL))?\s*([\d\.,\s]*)$/i);
    if (!m) continue;
    const valores = (m[5] || '').trim().split(/\s+/).map(num).filter((v) => v !== null);
    regs.push({
      codigo_equipamento: m[1],
      numero_patrimonio: m[2],
      descricao: m[3].trim(),
      situacao: m[4] || null,
      valor_compra: valores[0] ?? null,
      valor_venda: valores[1] ?? null,
      valor_mercado: valores[2] ?? null,
      valor_indenizacao: valores[3] ?? null,
      linha_original_extraida: { raw: linha },
    });
  }
  return regs;
}

function extrairRepresentantes(linhas: string[]) {
  const regs: any[] = [];
  for (const linha of linhas) {
    const cnpj = linha.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    const cpf = !cnpj && linha.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
    const tel = linha.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/);
    const email = linha.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const codigoMatch = linha.match(/^(\d{1,8})\s+/);
    if (!cnpj && !cpf && !tel && !email && !codigoMatch) continue;
    const doc = (cnpj?.[1] || cpf?.[1] || '').trim();
    let nome = linha.replace(/^\d{1,8}\s+/, '');
    if (doc) nome = nome.split(doc)[0];
    if (tel) nome = nome.split(tel[1])[0];
    if (email) nome = nome.split(email[0])[0];
    nome = nome.trim();
    if (!nome) continue;
    regs.push({
      codigo_dn4: codigoMatch?.[1] || null,
      nome,
      cpf_cnpj: doc ? onlyDigits(doc) : null,
      telefone: tel?.[1] || null,
      email: email?.[0] || null,
      tipo_pessoa: cnpj ? 'PJ' : (cpf ? 'PF' : null),
      linha_original_extraida: { raw: linha },
    });
  }
  return regs;
}

function extrairHistorico(linhas: string[]) {
  const regs: any[] = [];
  for (const linha of linhas) {
    const datas = linha.match(/(\d{2}\/\d{2}\/\d{4}).{0,10}(\d{2}\/\d{2}\/\d{4})/);
    if (!datas) continue;
    const tokens = linha.split(/\s+/);
    const numeros = tokens.filter((t) => /^[\d.,]+$/.test(t)).map(num).filter((v) => v !== null);
    const os = tokens[0];
    const pedido = tokens[1];
    const patrimonio = tokens.find((t, i) => i > 1 && /^\d{4,8}$/.test(t));
    const nf = tokens.reverse().find((t) => /^\d{3,9}$/.test(t));
    regs.push({
      numero_os: os || null,
      pedido: pedido || null,
      patrimonio: patrimonio || null,
      periodo_texto: `${datas[1]} a ${datas[2]}`,
      data_inicio: parseDate(datas[1]),
      data_fim: parseDate(datas[2]),
      valor_pedido_periodo: numeros[numeros.length - 3] ?? null,
      valor_diaria_periodo: numeros[numeros.length - 2] ?? null,
      valor_faturado_periodo: numeros[numeros.length - 1] ?? null,
      numero_nf: nf || null,
      linha_original_extraida: { raw: linha },
    });
  }
  return regs;
}

// ====== EXTRAÇÃO DE TEXTO ==================================================
async function extrairTexto(bytes: Uint8Array): Promise<{ texto: string; paginas: number; qualidade: 'boa' | 'ruim' }> {
  try {
    const data = await pdfParse(Buffer.from(bytes));
    const texto = data.text || '';
    const letras = (texto.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    const qualidade: 'boa' | 'ruim' = texto.length > 200 && letras > 80 ? 'boa' : 'ruim';
    return { texto, paginas: data.numpages || 1, qualidade };
  } catch (e) {
    console.error('pdf-parse erro', e);
    return { texto: '', paginas: 0, qualidade: 'ruim' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    const { importacao_id, storage_path, tipo_forcado } = await req.json();
    if (!importacao_id || !storage_path) {
      return new Response(JSON.stringify({ error: 'parametros_invalidos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: file, error: dlErr } = await supabase.storage.from('dn4-imports').download(storage_path);
    if (dlErr || !file) {
      await supabase.from('importacoes_dn4').update({
        status: 'erro', tipo: 'desconhecido',
        mensagem: 'Falha ao baixar PDF do storage: ' + (dlErr?.message || 'desconhecido'),
        finalizado_em: new Date().toISOString(),
      }).eq('id', importacao_id);
      return new Response(JSON.stringify({ ok: false, error: 'download_failed' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { texto, paginas, qualidade } = await extrairTexto(bytes);
    const previa = texto.slice(0, 2000);

    if (!texto || qualidade === 'ruim') {
      await supabase.from('importacoes_dn4').update({
        status: 'pdf_sem_texto', tipo: 'desconhecido',
        mensagem: `PDF sem texto legível (provavelmente escaneado). ${paginas} página(s). Selecione o tipo manualmente e reprocesse, ou envie um PDF com texto nativo.`,
        texto_extraido: previa,
        finalizado_em: new Date().toISOString(),
      }).eq('id', importacao_id);
      return new Response(JSON.stringify({ ok: true, status: 'pdf_sem_texto' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let tipo = tipo_forcado && tipo_forcado !== 'auto' ? tipo_forcado : null;
    let motivoDeteccao = tipo ? 'Tipo informado manualmente' : '';
    if (!tipo) {
      const det = detectarTipo(texto);
      tipo = det.tipo;
      motivoDeteccao = det.motivo;
    }

    if (tipo === 'desconhecido') {
      await supabase.from('importacoes_dn4').update({
        status: 'tipo_nao_identificado', tipo: 'desconhecido',
        mensagem: `Tipo não identificado automaticamente. Selecione manualmente (Clientes, Representantes, Equipamentos ou Histórico) e clique em Reprocessar. Início do texto: "${texto.slice(0, 200).replace(/\s+/g, ' ')}…"`,
        texto_extraido: previa,
        finalizado_em: new Date().toISOString(),
      }).eq('id', importacao_id);
      return new Response(JSON.stringify({ ok: true, status: 'tipo_nao_identificado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Limpa staging anterior dessa importação (caso seja reprocessamento)
    await supabase.from('staging_clientes_dn4').delete().eq('importacao_id', importacao_id);
    await supabase.from('staging_representantes_dn4').delete().eq('importacao_id', importacao_id);
    await supabase.from('staging_equipamentos_dn4').delete().eq('importacao_id', importacao_id);
    await supabase.from('staging_historico_locacao_dn4').delete().eq('importacao_id', importacao_id);

    const linhas = texto.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

    let regs: any[] = [];
    if (tipo === 'cliente') regs = extrairClientes(linhas);
    else if (tipo === 'equipamento') regs = extrairEquipamentos(linhas);
    else if (tipo === 'representante') regs = extrairRepresentantes(linhas);
    else if (tipo === 'historico') regs = extrairHistorico(linhas);

    const tabela =
      tipo === 'cliente' ? 'staging_clientes_dn4' :
      tipo === 'equipamento' ? 'staging_equipamentos_dn4' :
      tipo === 'representante' ? 'staging_representantes_dn4' :
      'staging_historico_locacao_dn4';

    let totalErros = 0;
    if (regs.length > 0) {
      const rows = regs.map((r) => ({
        ...r, importacao_id, arquivo_origem: storage_path, status: 'pendente_conferencia',
      }));
      // insere em chunks de 200
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error: insErr } = await supabase.from(tabela).insert(chunk);
        if (insErr) { totalErros += chunk.length; console.error('insert err', insErr); }
      }
    }

    const totalLidos = regs.length;
    const status =
      totalLidos === 0 ? 'sem_registros' :
      totalErros >= totalLidos ? 'erro' :
      'aguardando_conferencia';

    const mensagem =
      totalLidos === 0
        ? `Tipo "${tipo}" identificado (${motivoDeteccao}), mas nenhum registro extraído. O layout pode ser diferente do esperado — verifique a prévia do texto.`
        : totalErros > 0
        ? `${motivoDeteccao}. Lidos ${totalLidos}, com ${totalErros} erro(s) de gravação.`
        : `${motivoDeteccao}. ${totalLidos} registro(s) lido(s) e em conferência.`;

    await supabase.from('importacoes_dn4').update({
      tipo, total_lidos: totalLidos, total_pendentes: totalLidos - totalErros,
      total_erros: totalErros, status, mensagem, texto_extraido: previa,
      finalizado_em: new Date().toISOString(),
    }).eq('id', importacao_id);

    return new Response(JSON.stringify({ ok: true, tipo, total_lidos: totalLidos, total_erros: totalErros, status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('parse-dn4 erro', e);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.importacao_id) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await supabase.from('importacoes_dn4').update({
          status: 'erro', mensagem: 'Erro técnico: ' + String(e?.message || e),
          finalizado_em: new Date().toISOString(),
        }).eq('id', body.importacao_id);
      }
    } catch {}
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
