import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

const Ctx = createContext<MecanicoAppCtx | null>(null);

export const useMecanicoApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMecanicoApp deve ser usado dentro de MecanicoAppProvider");
  return v;
};

interface ProviderProps { children: ReactNode }

export const MecanicoAppProvider = ({ children }: ProviderProps) => {
  const { acessoId } = useParams<{ acessoId: string }>();
  const navigate = useNavigate();
  const [mecanico, setMecanico] = useState<Mecanico | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    if (!acessoId) {
      setErro("Acesso invÃ¡lido");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("app_mecanico_validar_acesso" as any, { p_acesso_id: acessoId });
    if (error || !(data as any)?.ok) {
      setErro("Acesso nÃ£o autorizado ou bloqueado pelo administrador.");
      setMecanico(null);
      setLoading(false);
      return;
    }
    const m = (data as any).mecanico as Mecanico;
    setMecanico(m);
    localStorage.setItem("app_mecanico_acesso_id", m.acesso_id);
    setErro(null);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [acessoId]);

  const sair = () => {
    localStorage.removeItem("app_mecanico_acesso_id");
    localStorage.removeItem("acesso_externo");
    navigate("/acesso-mecanico", { replace: true });
  };

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
          <p className="text-base text-foreground">{erro || "Acesso invÃ¡lido"}</p>
          <button
            onClick={() => navigate("/acesso-mecanico", { replace: true })}
            className="text-primary underline text-sm"
          >
            Voltar
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
