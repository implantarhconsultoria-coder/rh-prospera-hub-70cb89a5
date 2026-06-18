import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, AlertCircle } from "lucide-react";

interface Opcao { id: string; nome: string; empresa: string; filial: string; funcao: string; }
interface PinValidationResult { ok?: boolean; error?: string; count?: number; usuarios?: Opcao[]; }

const acessoRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const normalizarUsuarios = (usuarios: unknown): Opcao[] => {
  if (!Array.isArray(usuarios)) return [];
  return usuarios
    .map((item) => item as Partial<Opcao>)
    .filter((item) => Boolean(item?.id))
    .map((item) => ({
      id: String(item.id || ""),
      nome: String(item.nome || "Mecânico"),
      empresa: String(item.empresa || ""),
      filial: String(item.filial || ""),
      funcao: String(item.funcao || ""),
    }));
};

const mensagemErroPin = (error?: string) => {
  if (error === "bloqueado") return "Acesso bloqueado pelo administrador.";
  if (error === "pin_nao_encontrado") return "PIN não encontrado. Procure o administrador.";
  if (error === "sem_permissao_modulo") return "Seu acesso ainda não está liberado para o app mecânico.";
  return "PIN inválido ou acesso não liberado.";
};

export default function AcessoMecanicoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);

  const validar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    setErro(null);
    setOpcoes(null);

    if (pin.length !== 4) {
      setErro("Digite os 4 últimos números do CPF.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await acessoRpc.rpc("acesso_externo_validar_pin", {
        p_pin: pin,
        p_modulo: "mecanico",
      });

      if (error) {
        console.error("Erro ao validar PIN do app mecânico:", error);
        setErro("Erro ao validar o acesso. Tente novamente em alguns segundos.");
        return;
      }

      const res = data as PinValidationResult | null;
      if (!res?.ok) {
        setErro(mensagemErroPin(res?.error));
        return;
      }

      const usuarios = normalizarUsuarios(res.usuarios);
      if (usuarios.length === 0) {
        setErro("Nenhum mecânico encontrado para este PIN. Verifique o cadastro no admin.");
        return;
      }

      if ((res.count === 1 || usuarios.length === 1) && usuarios[0]) {
        entrar(usuarios[0]);
      } else {
        setOpcoes(usuarios);
      }
    } catch (error) {
      console.error("Falha inesperada no acesso do app mecânico:", error);
      setErro("Não foi possível validar agora. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const entrar = (u: Opcao) => {
    if (!u.id) {
      setErro("Cadastro sem ID de acesso. Ajuste o usuário no admin.");
      return;
    }
    localStorage.setItem("app_mecanico_acesso_id", u.id);
    const qr = searchParams.get("qr") || searchParams.get("codigo") || "";
    navigate(`/app-mecanico/${u.id}${qr ? `/abastecimento?qr=${encodeURIComponent(qr)}` : ""}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Wrench className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">App Mecânico</CardTitle>
          <p className="text-sm text-muted-foreground">Digite seu PIN de 4 dígitos</p>
        </CardHeader>
        <CardContent>
          {!opcoes ? (
            <form onSubmit={validar} className="space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground text-center">
                4 últimos números do seu CPF
              </p>
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
              {opcoes.map((u) => (
                <button
                  key={u.id}
                  onClick={() => entrar(u)}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                  disabled={loading}
                >
                  <div className="font-medium">{u.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {[u.empresa, u.funcao].filter(Boolean).join(" • ")}
                  </div>
                </button>
              ))}
              <Button variant="ghost" className="w-full" onClick={() => { setOpcoes(null); setPin(""); setErro(null); }}>
                Voltar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
