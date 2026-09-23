import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";

export interface Mecanico {
  acesso_id: string;
  nome: string;
  empresa: string;
  filial: string;
  funcao: string;
  funcionario_id: string | null;
  perfil_acesso?: string;
  registro_teste?: boolean;
  teste_chave?: string;
  veiculo_teste?: string;
  placa_teste?: string;
}

interface MecanicoAppCtx {
  mecanico: Mecanico;
  sair: () => void;
  recarregar: () => Promise<void>;
}

interface MechanicSession {
  version: number;
  accessId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

const Ctx = createContext<MecanicoAppCtx | null>(null);
const SESSION_KEY = "topac_mecanico_session_v2";

// eslint-disable-next-line react-refresh/only-export-components
export const useMecanicoApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMecanicoApp deve ser usado dentro de MecanicoAppProvider");
  return v;
};

interface ProviderProps { children: ReactNode }
interface ValidarAcessoResult { ok?: boolean; error?: string; mecanico?: Partial<Mecanico>; }

const mecanicoRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const normalizarMecanico = (input: Partial<Mecanico> | undefined | null): Mecanico | null => {
  if (!input?.acesso_id) return null;
  return {
    acesso_id: String(input.acesso_id),
    nome: String(input.nome || "Mecânico"),
    empresa: String(input.empresa || ""),
    filial: String(input.filial || ""),
    funcao: String(input.funcao || ""),
    funcionario_id: input.funcionario_id ? String(input.funcionario_id) : null,
    perfil_acesso: input.perfil_acesso ? String(input.perfil_acesso) : undefined,
    registro_teste: Boolean(input.registro_teste),
    teste_chave: input.teste_chave ? String(input.teste_chave) : undefined,
    veiculo_teste: input.veiculo_teste ? String(input.veiculo_teste) : undefined,
    placa_teste: input.placa_teste ? String(input.placa_teste) : undefined,
  };
};

const lerSessao = (): MechanicSession | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MechanicSession>;
    if (
      value.version !== 2
      || !value.accessId
      || !value.nonce
      || !Number.isFinite(value.issuedAt)
      || !Number.isFinite(value.expiresAt)
      || Number(value.expiresAt) <= Date.now()
    ) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return value as MechanicSession;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
};

const limparSessao = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("app_mecanico_acesso_id");
  localStorage.removeItem("acesso_externo");
};

export const MecanicoAppProvider = ({ children }: ProviderProps) => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const navigate = useNavigate();
  const [mecanico, setMecanico] = useState<Mecanico | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const sair = useCallback(() => {
    limparSessao();
    setMecanico(null);
    navigate("/mecanicos", { replace: true });
  }, [navigate]);

  const carregar = useCallback(async () => {
    const sessao = lerSessao();
    if (!acessoId || !sessao || sessao.accessId !== acessoId) {
      limparSessao();
      setErro("Sessão encerrada ou pertencente a outro usuário. Entre novamente pelo PIN.");
      setMecanico(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErro(null);

    try {
      const { data, error } = await mecanicoRpc.rpc("app_mecanico_validar_acesso", { p_acesso_id: acessoId });
      const result = data as ValidarAcessoResult | null;
      const mecanicoNormalizado = normalizarMecanico(result?.mecanico);

      if (error || !result?.ok || !mecanicoNormalizado || mecanicoNormalizado.acesso_id !== sessao.accessId) {
        console.error("Erro ao validar acesso do app mecânico:", error || result?.error || data);
        limparSessao();
        setErro(
          result?.error === "bloqueado"
            ? "Acesso bloqueado pelo administrador."
            : "Acesso não autorizado ou sessão divergente. Entre novamente pelo PIN."
        );
        setMecanico(null);
        return;
      }

      setMecanico(mecanicoNormalizado);
    } catch (error) {
      console.error("Falha inesperada ao carregar app mecânico:", error);
      setErro("Falha ao carregar o app mecânico. Verifique a internet e tente novamente.");
      setMecanico(null);
    } finally {
      setLoading(false);
    }
  }, [acessoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!mecanico?.acesso_id) return;
    let active = true;
    const heartbeat = async () => {
      if (!active || document.visibilityState === "hidden") return;
      const sessao = lerSessao();
      if (!sessao || sessao.accessId !== mecanico.acesso_id) {
        sair();
        return;
      }
      try {
        const { data, error } = await mecanicoRpc.rpc("app_mecanico_validar_acesso", { p_acesso_id: mecanico.acesso_id });
        const result = data as ValidarAcessoResult | null;
        if (error || !result?.ok || result.mecanico?.acesso_id !== mecanico.acesso_id) sair();
      } catch (error) {
        console.warn("Heartbeat do app mecânico indisponível:", error);
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void heartbeat(); };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 60000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mecanico?.acesso_id, sair]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (erro || !mecanico) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="text-base text-foreground">{erro || "Acesso inválido"}</p>
          <button
            onClick={sair}
            className="text-primary underline text-sm"
          >
            Entrar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ mecanico, sair, recarregar: carregar }}>
      {children}
    </Ctx.Provider>
  );
};
