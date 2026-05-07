import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { isMobileDevice } from "@/lib/isMobileDevice";

/**
 * Página unificada de acesso externo por PIN.
 * Rota canônica: /acesso-filial
 * (todas as outras /acesso-* não-mecânico redirecionam aqui)
 *
 * Fluxo:
 *  - Digita PIN (4 últimos do CPF)
 *  - Se 1 usuário e 1 portal -> entra direto
 *  - Se 1 usuário e múltiplos portais -> /portais (escolher)
 *  - Se múltiplos usuários (PINs colidem) -> escolher usuário, depois portais
 */

type Portal = {
  acesso_id: string;
  modulo: string;
  perfil_acesso: string;
  empresa: string;
  filial: string;
  funcao: string;
};
type Usuario = {
  cpf_clean: string;
  nome: string;
  empresa: string;
  filial: string;
  funcao: string;
  portais: Portal[];
};

export const MODULO_REDIRECT: Record<string, (id: string) => string> = {
  filial: (id) => `/filial-ext/${id}`,
  financeiro: (id) => `/financeiro-ext/${id}`,
  faturamento: (id) => `/faturamento-ext/${id}`,
  almoxarifado: (id) => `/almoxarifado-ext/${id}`,
  operacional: (id) => `/operacional-ext/${id}`,
  campo: (id) => `/campo-ext/${id}`,
};

export default function AcessoExternoPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);

  const validar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro(null);
    if (pin.length !== 4) {
      setErro("Digite os 4 últimos números do seu CPF.");
      return;
    }
    setLoading(true);

    // Em celular: só redireciona ao App Mecânico se o usuário tiver APENAS módulo mecânico.
    // Se tiver portais administrativos, segue o fluxo normal (Portal Mobile).
    if (isMobileDevice()) {
      const { data: mecData } = await supabase.rpc("acesso_externo_validar_pin" as any, {
        p_pin: pin, p_modulo: "mecanico",
      });
      const { data: portData } = await supabase.rpc("acesso_externo_listar_portais" as any, {
        p_pin: pin,
      });
      const mecRes = mecData as any;
      const portRes = portData as any;
      const temMec = mecRes?.ok && Array.isArray(mecRes.usuarios) && mecRes.usuarios.length > 0;
      const temPortais = portRes?.ok && Array.isArray(portRes.usuarios) && portRes.usuarios.length > 0;

      // Só mecânico → App Mecânico
      if (temMec && !temPortais) {
        setLoading(false);
        if (mecRes.count === 1) {
          const u = mecRes.usuarios[0];
          localStorage.setItem("app_mecanico_acesso_id", u.id);
          navigate(`/app-mecanico/${u.id}`);
        } else {
          navigate("/acesso-mecanico");
        }
        return;
      }
      // Caso contrário (tem portais administrativos, com ou sem mecânico) cai no fluxo normal abaixo.
    }

    const { data, error } = await supabase.rpc("acesso_externo_listar_portais" as any, {
      p_pin: pin,
    });
    setLoading(false);

    if (error) {
      setErro("Erro ao validar. Tente novamente.");
      return;
    }
    const res = data as any;
    if (!res?.ok) {
      if (res?.error === "bloqueado") setErro("Acesso bloqueado pelo administrador.");
      else if (res?.error === "pin_nao_encontrado") setErro("Acesso não liberado.");
      else setErro("PIN inválido.");
      return;
    }
    const lista: Usuario[] = res.usuarios || [];
    if (lista.length === 0) {
      setErro("Acesso não liberado.");
      return;
    }
    if (lista.length === 1) {
      escolherUsuario(lista[0]);
    } else {
      setUsuarios(lista);
    }
  };

  const escolherUsuario = (u: Usuario) => {
    // Salva sessão do usuário escolhido
    sessionStorage.setItem("acesso_externo_sessao", JSON.stringify({
      cpf_clean: u.cpf_clean,
      nome: u.nome,
      portais: u.portais,
      ts: Date.now(),
    }));

    if (u.portais.length === 1) {
      // Entra direto
      entrarPortal(u.portais[0]);
    } else {
      navigate("/portais");
    }
  };

  const entrarPortal = async (p: Portal) => {
    setLoading(true);
    // Valida e abre
    const { data, error } = await supabase.rpc("acesso_externo_obter" as any, {
      p_id: p.acesso_id,
      p_modulo: p.modulo,
    });
    if (error || !(data as any)?.ok) {
      setLoading(false);
      toast.error("Não foi possível abrir o portal.");
      return;
    }
    const acesso = (data as any).acesso;
    localStorage.setItem("acesso_externo", JSON.stringify({ ...acesso, ts: Date.now() }));
    setLoading(false);
    const goto = MODULO_REDIRECT[p.modulo];
    if (!goto) {
      toast.error("Módulo desconhecido: " + p.modulo);
      return;
    }
    navigate(goto(acesso.id));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Acesso Portais</CardTitle>
          <p className="text-sm text-muted-foreground">
            Digite seu código PIN para acessar.
          </p>
        </CardHeader>
        <CardContent>
          {!usuarios ? (
            <form onSubmit={validar} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Código PIN</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className="text-center text-2xl tracking-[0.5em] h-14"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Use os 4 últimos números do seu CPF.
                </p>
              </div>

              {erro && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading || pin.length !== 4}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecione seu nome:</p>
              {usuarios.map((u) => (
                <button
                  key={u.cpf_clean + u.nome}
                  onClick={() => escolherUsuario(u)}
                  disabled={loading}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                >
                  <div className="font-medium">{u.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {[u.empresa, u.filial, u.funcao].filter(Boolean).join(" • ")}
                  </div>
                  <div className="text-xs text-primary mt-1">
                    {u.portais.length} portal(is) liberado(s)
                  </div>
                </button>
              ))}
              <Button variant="ghost" className="w-full" onClick={() => { setUsuarios(null); setPin(""); }}>
                Voltar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
