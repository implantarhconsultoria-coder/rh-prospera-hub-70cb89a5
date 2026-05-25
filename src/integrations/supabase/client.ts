import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => { memoryStore.set(key, value); },
  removeItem: (key: string) => { memoryStore.delete(key); },
};

function getSafeStorage() {
  if (typeof window === 'undefined') return memoryStorage;
  try {
    const key = '__topac_storage_test__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch (error) {
    console.warn('LocalStorage indisponivel; usando storage temporario da sessao.', error);
    return memoryStorage;
  }
}

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

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: getSafeStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});
