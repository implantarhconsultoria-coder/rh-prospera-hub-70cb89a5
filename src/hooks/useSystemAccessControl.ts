import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  SYSTEM_ACCESS_MODULES,
  type SystemAccessControl,
  type SystemAccessKey,
} from '@/lib/systemAccessControl';

const emptyState = (): Record<SystemAccessKey, SystemAccessControl> => {
  const all: SystemAccessControl[] = [
    { module_key: 'global', label: 'Todos os acessos', restricted: false },
    ...SYSTEM_ACCESS_MODULES.map(item => ({ module_key: item.key, label: item.label, restricted: false })),
  ];
  return Object.fromEntries(all.map(row => [row.module_key, row])) as Record<SystemAccessKey, SystemAccessControl>;
};

export const useSystemAccessControl = () => {
  const [controls, setControls] = useState<Record<SystemAccessKey, SystemAccessControl>>(emptyState);
  const [loading, setLoading] = useState(true);
  const table = () => (supabase.from as any)('system_access_controls');

  const load = useCallback(async () => {
    const { data, error } = await table()
      .select('module_key,label,restricted,updated_at,updated_by')
      .order('module_key');

    if (!error && Array.isArray(data)) {
      setControls(prev => {
        const next = { ...prev };
        for (const row of data as SystemAccessControl[]) next[row.module_key] = row;
        return next;
      });
    } else if (error) {
      console.error('Falha ao consultar controle de acesso:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void load();

    const channel = supabase
      .channel('topac-system-access-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_access_controls' }, () => {
        if (active) void load();
      })
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 5000);

    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const restrictedKeys = useMemo(
    () => Object.values(controls).filter(row => row.restricted).map(row => row.module_key),
    [controls],
  );

  const setRestricted = useCallback(async (key: SystemAccessKey, restricted: boolean, userId?: string | null) => {
    const previous = controls[key];
    setControls(prev => ({
      ...prev,
      [key]: { ...prev[key], restricted, updated_at: new Date().toISOString(), updated_by: userId || null },
    }));

    const { error } = await table()
      .update({
        restricted,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .eq('module_key', key);

    if (error) {
      setControls(prev => ({ ...prev, [key]: previous }));
      throw error;
    }
  }, [controls]);

  const restoreAll = useCallback(async (userId?: string | null) => {
    const previous = controls;
    setControls(prev => Object.fromEntries(
      Object.entries(prev).map(([key, row]) => [key, { ...row, restricted: false }]),
    ) as Record<SystemAccessKey, SystemAccessControl>);

    const { error } = await table()
      .update({
        restricted: false,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .in('module_key', ['global', ...SYSTEM_ACCESS_MODULES.map(item => item.key)]);

    if (error) {
      setControls(previous);
      throw error;
    }
  }, [controls]);

  return { controls, loading, restrictedKeys, load, setRestricted, restoreAll };
};
