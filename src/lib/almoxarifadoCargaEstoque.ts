import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type CargaItem = {
  nome?: string;
  quantidade?: number;
};

type CargaPayload = {
  tipo?: string;
  itens_json?: CargaItem[];
};

type EstoqueItem = {
  id: string;
  nome: string;
  quantidade: number;
};

const normalizeItemName = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const parseRequestPayload = async (input: RequestInfo | URL, init?: RequestInit): Promise<CargaPayload[]> => {
  try {
    let rawBody: BodyInit | null | undefined = init?.body;

    if (!rawBody && input instanceof Request) {
      rawBody = await input.clone().text();
    }

    if (!rawBody) return [];

    const text = typeof rawBody === 'string' ? rawBody : String(rawBody);
    if (!text.trim()) return [];

    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
};

const isCargaInsert = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  return method === 'POST' && /\/rest\/v1\/almoxarifado_carga(?:\?|$)/.test(url);
};

const abaterItensCadastrados = async (payloads: CargaPayload[]) => {
  const itensSolicitados = payloads.flatMap((payload) => {
    const tipo = String(payload.tipo || 'carga').toLowerCase();
    if (tipo !== 'carga' && tipo !== 'retirada') return [];
    return Array.isArray(payload.itens_json) ? payload.itens_json : [];
  });

  if (!itensSolicitados.length) return;

  const { data, error } = await (supabase as any)
    .from('almoxarifado_itens')
    .select('id,nome,quantidade');

  if (error || !data) {
    console.warn('[almoxarifado] carga salva sem abatimento: estoque ainda nao disponivel', error);
    return;
  }

  const estoque = data as EstoqueItem[];
  const estoquePorNome = new Map<string, EstoqueItem>();
  estoque.forEach((item) => {
    const key = normalizeItemName(item.nome);
    if (key && !estoquePorNome.has(key)) estoquePorNome.set(key, item);
  });

  const totaisPorItem = new Map<string, number>();
  itensSolicitados.forEach((item) => {
    const key = normalizeItemName(item.nome);
    const quantidade = Number(item.quantidade || 0);
    if (!key || !Number.isFinite(quantidade) || quantidade <= 0) return;
    totaisPorItem.set(key, (totaisPorItem.get(key) || 0) + quantidade);
  });

  let abatidos = 0;
  let naoCadastrados = 0;

  for (const [key, quantidadeSolicitada] of totaisPorItem.entries()) {
    const itemEstoque = estoquePorNome.get(key);
    if (!itemEstoque) {
      naoCadastrados += 1;
      continue;
    }

    const quantidadeAtual = Number(itemEstoque.quantidade || 0);
    const novaQuantidade = Math.max(0, quantidadeAtual - quantidadeSolicitada);

    const { error: updateError } = await (supabase as any)
      .from('almoxarifado_itens')
      .update({ quantidade: novaQuantidade })
      .eq('id', itemEstoque.id);

    if (updateError) {
      console.warn(`[almoxarifado] falha ao abater ${itemEstoque.nome}`, updateError);
      continue;
    }

    abatidos += 1;
  }

  if (abatidos > 0) {
    const complemento = naoCadastrados > 0
      ? ` ${naoCadastrados} item(ns) ainda sem cadastro foram mantidos apenas na carga.`
      : '';
    toast.success(`Estoque atualizado para ${abatidos} item(ns) cadastrado(s).${complemento}`);
  }
};

let initialized = false;

export const initAlmoxarifadoCargaEstoque = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const cargaInsert = isCargaInsert(input, init);
    const payloadsPromise = cargaInsert ? parseRequestPayload(input, init) : Promise.resolve([]);
    const response = await originalFetch(input, init);

    if (cargaInsert && response.ok) {
      const payloads = await payloadsPromise;
      void abaterItensCadastrados(payloads);
    }

    return response;
  };
};
