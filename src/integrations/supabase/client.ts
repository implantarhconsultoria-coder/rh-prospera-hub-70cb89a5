import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.VITE_SUPABASE_UR ||
  FALLBACK_SUPABASE_URL;

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  FALLBACK_SUPABASE_PUBLISHABLE_KEY;

const supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  }
});

const parseBrazilianNumber = (value: string | null): number | null => {
  if (value == null) return null;
  let raw = value.trim().replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!raw) return null;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma > dot) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (dot > comma) raw = raw.replace(/,/g, '');
  else raw = raw.replace(',', '.');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseKm = (value: string | null): number | null => {
  if (value == null) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 9999999 ? Math.round(parsed) : null;
};

const isVisionProviderUnavailable = (payload: any) => {
  const text = `${payload?.error || ''} ${payload?.detail || ''} ${payload?.motivo || ''}`.toUpperCase();
  return text.includes('PROVEDOR_VISUAL_NAO_CONFIGURADO') ||
    text.includes('OPENAI_API_KEY_AUSENTE') ||
    text.includes('OCR_PROVIDER_ENV_AUSENTE');
};

const manualVisionFallback = (tipo: string) => {
  if (typeof window === 'undefined') return null;

  if (tipo === 'painel_km') {
    const km = parseKm(window.prompt(
      'A leitura automática está temporariamente indisponível.\n\nAs fotos continuam salvas. Digite o KM TOTAL exatamente como aparece no painel:'
    ));
    if (!km) return null;
    return {
      ok: true,
      km,
      km_atual: km,
      confianca: 1,
      motivo: 'KM confirmado manualmente a partir da foto devido à indisponibilidade temporária da leitura automática.',
      provider: 'manual_fallback',
      model: 'confirmacao_visual_usuario',
    };
  }

  const valor = parseBrazilianNumber(window.prompt(
    'A leitura automática está temporariamente indisponível.\n\nAs fotos continuam salvas. Digite o TOTAL A PAGAR exatamente como aparece na bomba. Ex.: 277,95'
  ));
  if (!valor || valor < 5 || valor > 10000) return null;

  const litros = parseBrazilianNumber(window.prompt(
    'Agora digite os LITROS exatamente como aparecem na bomba. Ex.: 40,995'
  ));
  if (!litros || litros < 0.5 || litros > 500) return null;

  const valorPorLitro = valor / litros;
  if (!Number.isFinite(valorPorLitro) || valorPorLitro < 1.5 || valorPorLitro > 30) return null;

  return {
    ok: true,
    valor,
    litros,
    valor_por_litro: Number(valorPorLitro.toFixed(3)),
    confianca: 1,
    motivo: 'Valor e litros confirmados manualmente a partir da foto devido à indisponibilidade temporária da leitura automática.',
    provider: 'manual_fallback',
    model: 'confirmacao_visual_usuario',
  };
};

// Proteção operacional do abastecimento: a leitura automática continua sendo a primeira opção.
// Se o provedor visual estiver fora/configuração ausente, a operação não fica bloqueada:
// o funcionário confirma os números visíveis nas fotos, que continuam obrigatórias junto com o GPS.
const functionsAny = (supabaseClient as any).functions;
const originalInvoke = functionsAny.invoke.bind(functionsAny);
functionsAny.invoke = async (functionName: string, options?: any) => {
  const result = await originalInvoke(functionName, options);
  if (functionName !== 'ocr-bomba-combustivel') return result;

  const payload = result?.data;
  if (!isVisionProviderUnavailable(payload)) return result;

  const tipo = String(options?.body?.tipo || 'bomba');
  const fallback = manualVisionFallback(tipo);
  if (!fallback) return result;

  return { data: fallback, error: null };
};

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = supabaseClient;
