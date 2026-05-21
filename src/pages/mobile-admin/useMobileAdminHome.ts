import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MobileAdminModulo {
  modulo: string;
  titulo: string;
  rota: string;
  icone: string;
  escopo_unidade: boolean;
  unidade: string | null;
  pode_criar: boolean;
  pode_editar: boolean;
}

export interface MobileAdminHomeData {
  ok: boolean;
  error?: string;
  mensagem?: string;
  layout?: string;
  titulo?: string;
  subtitulo?: string;
  usuario?: { id: string; nome: string; email: string; is_admin: boolean; unidade: string };
  financeiro_global_liberado?: boolean;
  modulos?: MobileAdminModulo[];
  permissoes?: Array<Record<string, unknown>>;
}

export function useMobileAdminHome() {
  const [data, setData] = useState<MobileAdminHomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancel) { setData({ ok: false, error: "sem_usuario", mensagem: "Faça login para acessar." }); setLoading(false); } return; }
      const { data: res, error } = await supabase.rpc("fn_mobile_admin_home" as never, { p_user_id: user.id } as never);
      if (cancel) return;
      if (error) {
        setData({ ok: false, error: "erro", mensagem: "Acesso mobile/admin não liberado para este usuário." });
      } else {
        setData(res as MobileAdminHomeData);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  return { data, loading };
}
