// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
// pdfjs via npm specifier (Deno) - sem canvas
import * as pdfjs from 'npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs';
const { getDocument, GlobalWorkerOptions } = pdfjs as any;
// @ts-ignore
GlobalWorkerOptions.workerSrc = '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const num = (s: string | undefined | null) => {
  if (!s) return null;
  const v = String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

const onlyDigits = (s: string | undefined | null) => (s ? s.replace(/[^0-9]/g, '') : '');

const parseDate = (s: string | undefined | null) => {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

// Detecta o tipo de relatório DN4 a partir do texto
function detectarTipo(texto: string): 'cliente' | 'representante' | 'equipamento' | 'historico' | 'desconhecido' {
  const t = texto.toUpperCase();
  if (t.includes('HISTÓRICO DE LOCAÇÃO') || t.includes('HISTORICO DE LOCACAO') || (t.includes('OS') && t.includes('PEDIDO') && t.includes('PATRIMÔNIO'))) return 'historico';
  if (t.includes('REPRESENTANTE')) return 'representante';
  if ((t.includes('PATRIMÔNIO') || t.includes('PATRIMONIO')) && t.includes('EQUIPAMENTO')) return 'equipamento';
  if (t.includes('CNPJ') || t.includes('CPF') || t.includes('RAZÃO SOCIAL') || t.includes('CLIENTE')) return 'cliente';
  return 'desconhecido';
}

async function extrairTextoPaginas(bytes: Uint8Array): Promise<{ pagina: number; texto: string; linhas: string[] }[]> {
  const pdf = await getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise;
  const out: { pagina: number; texto: string; linhas: string[] }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Agrupa por linha (Y aproximado)
    const items: any[] = content.items as any[];
    const linhasMap = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      const arr = linhasMap.get(y) || [];
      arr.push({ x: it.transform[4], str: it.str });
      linhasMap.set(y, arr);
    }
    const ys = Array.from(linhasMap.keys()).sort((a, b) => b - a);
    const linhas = ys.map((y) =>
      linhasMap.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.str).join(' ').replace(/\s+/g, ' ').trim(),
    ).filter(Boolean);
    out.push({ pagina: p, texto: linhas.join('\n'), linhas });
  }
  return out;
}

// Heurística simples de extração por padrões DN4
function extrairClientes(linhas: string[]) {
  const regs: any[] = [];
  for (const linha of linhas) {
    // padrão: <codigo> <razao social ...> <CPF/CNPJ> <cidade> <UF>
    const cnpj = linha.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    const cpf = linha.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
    if (!cnpj && !cpf) continue;
    const doc = (cnpj?.[1] || cpf?.[1] || '').trim();
    const ufMatch = linha.match(/\b([A-Z]{2})\b\s*$/);
    const partes = linha.split(doc);
    const antes = partes[0]?.trim() || '';
    const depois = partes[1]?.trim() || '';
    const codigoMatch = antes.match(/^(\d{1,8})\s+/);
    const codigo = codigoMatch?.[1] || '';
    const nome = antes.replace(/^(\d{1,8})\s+/, '').trim();
    const uf = ufMatch?.[1] || '';
    const cidade = depois.replace(uf, '').trim();
    regs.push({
      codigo_dn4: codigo || null,
      nome_razao_social: nome || null,
      cpf_cnpj: onlyDigits(doc),
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
    // padrão: <codigo> <patrimonio> <descricao> ... <situacao> ...valores
    const m = linha.match(/^(\d{2,8})\s+(\d{3,10})\s+(.+?)(?:\s+(ATIVO|INATIVO|LOCADO|MANUTENÇÃO|MANUTENCAO|VENDIDO|BAIXADO))?\s*([\d\.,\s]*)$/i);
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
    const cpf = linha.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
    if (!cnpj && !cpf) continue;
    const doc = (cnpj?.[1] || cpf?.[1] || '').trim();
    const codigoMatch = linha.match(/^(\d{1,8})\s+/);
    const tel = linha.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/);
    const email = linha.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const nome = linha.replace(/^\d{1,8}\s+/, '').split(doc)[0].trim();
    regs.push({
      codigo_dn4: codigoMatch?.[1] || null,
      nome,
      cpf_cnpj: onlyDigits(doc),
      telefone: tel?.[1] || null,
      email: email?.[0] || null,
      tipo_pessoa: cnpj ? 'PJ' : 'PF',
      linha_original_extraida: { raw: linha },
    });
  }
  return regs;
}

function extrairHistorico(linhas: string[]) {
  const regs: any[] = [];
  for (const linha of linhas) {
    // padrão: OS PEDIDO ... PATRIMONIO ... DD/MM/YYYY a DD/MM/YYYY ... valores ... NF
    const datas = linha.match(/(\d{2}\/\d{2}\/\d{4}).{0,5}(\d{2}\/\d{2}\/\d{4})/);
    if (!datas) continue;
    const tokens = linha.split(/\s+/);
    const numeros = tokens.filter((t) => /^[\d.,]+$/.test(t)).map(num);
    const os = tokens[0];
    const pedido = tokens[1];
    const patrimonio = tokens.find((t) => /^\d{4,8}$/.test(t) && t !== os && t !== pedido);
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
      linha_original_extraida: { raw: linha },
    });
  }
  return regs;
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

    // baixa PDF
    const { data: file, error: dlErr } = await supabase.storage.from('dn4-imports').download(storage_path);
    if (dlErr || !file) throw new Error('Falha ao baixar PDF: ' + (dlErr?.message || 'desconhecido'));
    const bytes = new Uint8Array(await file.arrayBuffer());

    const paginas = await extrairTextoPaginas(bytes);
    const textoTotal = paginas.map((p) => p.texto).join('\n');
    const tipo = tipo_forcado || detectarTipo(textoTotal);

    let totalLidos = 0;
    let totalErros = 0;

    for (const pg of paginas) {
      let regs: any[] = [];
      if (tipo === 'cliente') regs = extrairClientes(pg.linhas);
      else if (tipo === 'equipamento') regs = extrairEquipamentos(pg.linhas);
      else if (tipo === 'representante') regs = extrairRepresentantes(pg.linhas);
      else if (tipo === 'historico') regs = extrairHistorico(pg.linhas);

      if (regs.length === 0) continue;
      totalLidos += regs.length;

      const tabela =
        tipo === 'cliente' ? 'staging_clientes_dn4' :
        tipo === 'equipamento' ? 'staging_equipamentos_dn4' :
        tipo === 'representante' ? 'staging_representantes_dn4' :
        'staging_historico_locacao_dn4';

      const rows = regs.map((r) => ({
        ...r,
        importacao_id,
        arquivo_origem: storage_path,
        pagina_origem: pg.pagina,
        status: 'pendente_conferencia',
      }));

      const { error: insErr } = await supabase.from(tabela).insert(rows);
      if (insErr) { totalErros += rows.length; console.error('insert err', insErr); }
    }

    await supabase.from('importacoes_dn4').update({
      tipo,
      total_lidos: totalLidos,
      total_pendentes: totalLidos - totalErros,
      total_erros: totalErros,
      finalizado_em: new Date().toISOString(),
      status: tipo === 'desconhecido' ? 'erro' : 'aguardando_conferencia',
    }).eq('id', importacao_id);

    return new Response(JSON.stringify({ ok: true, tipo, total_lidos: totalLidos, total_erros: totalErros }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('parse-dn4 erro', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
