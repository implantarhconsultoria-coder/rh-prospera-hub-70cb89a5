import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';

const FALLBACK_SUPABASE_URL = 'https://djfjnxmbvjgweqzjvqtr.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DHu9U7RSOV8uPwW2XXtH8A_ek7QfU_Z';

// O portal da equipe e a area administrativa compartilham O MESMO inventario.
// O antigo VITE_SUPABASE_URL no ambiente de build apontava para outro projeto,
// que nao contem estoque_interno_itens. Evitar regressao por env antiga na Vercel.
const SUPABASE_URL = FALLBACK_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = FALLBACK_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  }
});
