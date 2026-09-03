import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'topac:view-state:v1:';

type StateUpdater<T> = T | ((current: T) => T);

const readStoredState = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (parsed && typeof parsed === 'object' && fallback && typeof fallback === 'object') {
      return { ...(fallback as any), ...(parsed as any) } as T;
    }
    return parsed;
  } catch {
    return fallback;
  }
};

export const clearPersistentViewState = (key: string) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
};

export const usePersistentViewState = <T,>(key: string, initialState: T) => {
  const [state, setStateInternal] = useState<T>(() => readStoredState(key, initialState));

  useEffect(() => {
    setStateInternal(readStoredState(key, initialState));
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(state));
    } catch (error) {
      console.warn('Não foi possível persistir o estado da tela:', key, error);
    }
  }, [key, state]);

  const setState = useCallback((next: StateUpdater<T>) => {
    setStateInternal((current) => typeof next === 'function' ? (next as (value: T) => T)(current) : next);
  }, []);

  return [state, setState] as const;
};
