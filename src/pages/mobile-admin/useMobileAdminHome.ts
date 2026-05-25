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

const DEFAULT_MODULES: MobileAdminModulo[] = [
  { modulo: "rh", titulo: "Recursos Humanos", rota: "/mobile/admin/rh", icone: "users", escopo_unidade: true, unidade: "MATRIZ", pode_criar: true, pode_editar: true },
  { modulo: "faturamento", titulo: "Faturamento", rota: "/mobile/admin/faturamento", icone: "receipt", escopo_unidade: false, unidade: null, pode_criar: true, pode_editar: true },
  { modulo: "financeiro", titulo: "Financeiro", rota: "/mobile/admin/financeiro", icone: "banknote", escopo_unidade: false, unidade: null, pode_criar: true, pode_editar: true },
  { modulo: "abastecimento", titulo: "Abastecimento", rota: "/mobile/admin/abastecimento", icone: "fuel", escopo_unidade: true, unidade: "MATRIZ", pode_criar: true, pode_editar: true },
  { modulo: "documentos-rh", titulo: "Documentos RH", rota: "/mobile/admin/documentos-rh", icone: "folder", escopo_unidade: true, unidade: "MATRIZ", pode_criar: true, pode_editar: true },
  { modulo: "config", titulo: "Configuracoes", rota: "/mobile/admin/config", icone: "settings", escopo_unidade: false, unidade: null, pode_criar: true, pode_editar: true },
];

const DEFAULT_PERMISSOES = DEFAULT_MODULES.map((mod) => ({
  modulo: mod.modulo,
  pode_visualizar: true,
  pode_criar: true,
  pode_editar: true,
  pode_excluir: true,
  pode_aprovar: true,
}));

const isMissingRpcError = (message: string) =>
  /schema cache|does not exist|could not find the function|function .* does not exist/i.test(message);

const toModuloKeyFromLegacy = (raw: any) => {
  const codigo = String(raw?.codigo || "").toLowerCase();
  const rota = String(raw?.rota || "").toLowerCase();

  if (rota.includes("/mobile/admin/rh") || codigo.includes("rh")) return "rh";
  if (rota.includes("/mobile/admin/faturamento") || codigo.includes("faturamento")) return "faturamento";
  if (rota.includes("/mobile/admin/financeiro") || codigo.includes("financeiro")) return "financeiro";
  if (rota.includes("/mobile/admin/abastecimento") || codigo.includes("abastecimento")) return "abastecimento";
  if (rota.includes("/mobile/admin/documentos-rh") || codigo.includes("documentos_rh")) return "documentos-rh";
  if (rota.includes("/mobile/admin/config") || codigo.includes("mobile_admin") || codigo.includes("config")) {
    return "config";
  }
  return "";
};

const convertLegacyHomeShape = (
  raw: any,
  userId: string,
  userEmail: string,
  userName: string,
): MobileAdminHomeData | null => {
  const sourceModulos = Array.isArray(raw?.modulos) ? raw.modulos : [];
  if (!sourceModulos.length) return null;

  const normalizedMap = new Map<string, MobileAdminModulo>();
  for (const item of sourceModulos) {
    const modulo = toModuloKeyFromLegacy(item);
    if (!modulo || modulo === "dashboard") continue;
    if (normalizedMap.has(modulo)) continue;

    normalizedMap.set(modulo, {
      modulo,
      titulo: String(item?.nome || modulo),
      rota: String(item?.rota || `/mobile/admin/${modulo}`),
      icone: String(item?.icone || "folder").toLowerCase(),
      escopo_unidade: Boolean(item?.escopo_unidade),
      unidade: item?.escopo_unidade ? String(item.escopo_unidade) : null,
      pode_criar: Boolean(item?.pode_criar ?? item?.pode_visualizar ?? true),
      pode_editar: Boolean(item?.pode_editar ?? true),
    });
  }

  const modulos = Array.from(normalizedMap.values());
  if (!modulos.length) return null;

  const sourcePerms = Array.isArray(raw?.permissoes?.modulos) ? raw.permissoes.modulos : [];
  const permissoes = sourcePerms
    .map((item: any) => {
      const modulo = toModuloKeyFromLegacy(item);
      if (!modulo) return null;
      return {
        modulo,
        pode_visualizar: Boolean(item?.pode_visualizar ?? true),
        pode_criar: Boolean(item?.pode_criar ?? item?.pode_visualizar ?? true),
        pode_editar: Boolean(item?.pode_editar ?? true),
        pode_excluir: Boolean(item?.pode_excluir ?? false),
        pode_aprovar: Boolean(item?.pode_aprovar ?? false),
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  return {
    ok: true,
    layout: String(raw?.layout || "mobile-admin"),
    titulo: String(raw?.titulo || "TOPAC RH PRO"),
    subtitulo: String(raw?.subtitulo || "Central Mobile/Admin"),
    usuario: {
      id: String(raw?.user_id || userId),
      nome: userName || userEmail || "Usuario",
      email: userEmail,
      is_admin: Boolean(raw?.permissoes?.financeiro_global_liberado ?? false),
      unidade: "MATRIZ",
    },
    financeiro_global_liberado: Boolean(raw?.permissoes?.financeiro_global_liberado ?? true),
    modulos,
    permissoes,
  };
};

const buildFallbackAdminData = (
  userId: string,
  email: string,
  nome: string,
): MobileAdminHomeData => ({
  ok: true,
  layout: "mobile-admin",
  titulo: "TOPAC RH PRO",
  subtitulo: "Central Mobile/Admin - MATRIZ",
  usuario: {
    id: userId,
    nome: nome || email || "Usuario",
    email: email || "",
    is_admin: true,
    unidade: "MATRIZ",
  },
  financeiro_global_liberado: true,
  modulos: DEFAULT_MODULES,
  permissoes: DEFAULT_PERMISSOES,
});

export function useMobileAdminHome() {
  const [data, setData] = useState<MobileAdminHomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;

    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancel) {
          setData({ ok: false, error: "sem_usuario", mensagem: "Faca login para acessar." });
          setLoading(false);
        }
        return;
      }

      const userId = user.id;
      const userEmail = user.email || "";
      const userName = (user.user_metadata?.nome_completo as string) || "";

      const callHome = async () =>
        supabase.rpc("fn_mobile_admin_home" as never, { p_user_id: userId } as never);

      const tryAdminFallbackByRole = async () => {
        const { data: rolesRows } = await supabase
          .from("user_roles" as any)
          .select("role")
          .eq("user_id", userId);

        const roles = ((rolesRows as any[]) || []).map((item) => String(item.role || "").toLowerCase());
        const isAdminEmail = /^(adm\.matriz|admin)@topac\.com\.br$/i.test(userEmail);
        const isAdmin = roles.includes("admin") || roles.includes("diretor_geral") || isAdminEmail;
        if (!isAdmin) return false;

        setData(buildFallbackAdminData(userId, userEmail, userName));
        setLoading(false);
        return true;
      };

      let { data: homeData, error: homeError } = await callHome();
      if (cancel) return;

      if (!homeError) {
        const typed = homeData as MobileAdminHomeData;

        const legacy = convertLegacyHomeShape(homeData as any, userId, userEmail, userName);
        if (legacy?.ok) {
          setData(legacy);
          setLoading(false);
          return;
        }

        if (typed?.ok) {
          setData(typed);
          setLoading(false);
          return;
        }

        // Auto-repair for users who are admin but have no rows in permissoes_usuario yet.
        if (typed?.error === "sem_acesso") {
          const { data: releaseData, error: releaseError } = await supabase.rpc(
            "fn_liberar_acesso_mobile_admin" as never,
            { p_user_id: userId } as never,
          );

          if (!releaseError && (releaseData as any)?.ok) {
            const retry = await callHome();
            homeData = retry.data;
            homeError = retry.error;
            if (!homeError && (homeData as MobileAdminHomeData)?.ok) {
              setData(homeData as MobileAdminHomeData);
              setLoading(false);
              return;
            }
          }

          const unlocked = await tryAdminFallbackByRole();
          if (unlocked) return;
        }
      }

      // Fallback: if RPCs are missing or broken, allow admins with local role check.
      const message = String(homeError?.message || "");
      if (homeError && isMissingRpcError(message)) {
        const unlocked = await tryAdminFallbackByRole();
        if (!unlocked) {
          setData({
            ok: false,
            error: "sem_acesso",
            mensagem: "Acesso mobile/admin nao liberado para este usuario.",
          });
        }
        setLoading(false);
        return;
      }

      if (!homeError && (homeData as MobileAdminHomeData)?.ok === false) {
        setData(homeData as MobileAdminHomeData);
      } else if (homeError) {
        setData({
          ok: false,
          error: "erro",
          mensagem: "Acesso mobile/admin nao liberado para este usuario.",
        });
      } else {
        setData({
          ok: false,
          error: "erro",
          mensagem: "Nao foi possivel carregar o mobile/admin.",
        });
      }

      setLoading(false);
    };

    run();
    return () => {
      cancel = true;
    };
  }, []);

  return { data, loading };
}
