import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const MODULOS: Record<string, { label: string; redirect: (id: string) => string }> = {
  mecanico: { label: "App Mecânico", redirect: (id) => `/mecanico-ext/${id}` },
  financeiro: { label: "Financeiro", redirect: (id) => `/financeiro-ext/${id}` },
  faturamento: { label: "Faturamento", redirect: (id) => `/faturamento-ext/${id}` },
  rh: { label: "RH", redirect: (id) => `/rh-ext/${id}` },
  almoxarifado: { label: "Almoxarifado", redirect: (id) => `/almoxarifado-ext/${id}` },
  operacional: { label: "Operacional", redirect: (id) => `/operacional-ext/${id}` },
  filial: { label: "Filial", redirect: (id) => `/filial-ext/${id}` },
  campo: { label: "Campo", redirect: (id) => `/campo-ext/${id}` },
};

interface UsuarioOpcao {
  id: string;
  nome: string;
  empresa: string;
  filial: string;
  funcao: string;
}

export default function AcessoExternoPage() {
  const location = useLocation();
  const modulo = location.pathname.replace(/^\/acesso-/, "") || "mecanico";
  const navigate = useNavigate();
  const cfg = MODULOS[modulo] || MODULOS.mecanico;

  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<UsuarioOpcao[] | null>(null);

  const validar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro(null);
    if (pin.length !== 4) {
      setErro("Digite os 4 últimos números do seu CPF.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("acesso_externo_validar_pin" as any, {
      p_pin: pin,
      p_modulo: modulo,
    });
    setLoading(false);

    if (error) {
      setErro("Erro ao validar. Tente novamente.");
      return;
    }
    const res = data as any;
    if (!res?.ok) {
      if (res?.error === "bloqueado") setErro("Acesso bloqueado pelo administrador.");
      else if (res?.error === "pin_nao_encontrado") setErro("PIN não encontrado. Procure o administrador.");
      else setErro("PIN inválido.");
      return;
    }
    if (res.count === 1) {
      entrar(res.usuarios[0]);
    } else {
      setOpcoes(res.usuarios);
    }
  };

  const entrar = async (u: UsuarioOpcao) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("acesso_externo_obter" as any, {
      p_id: u.id,
      p_modulo: modulo,
    });
    if (error || !(data as any)?.ok) {
      setLoading(false);
      toast.error("Não foi possível abrir o acesso.");
      return;
    }
    const acesso = (data as any).acesso;
    localStorage.setItem(
      "acesso_externo",
      JSON.stringify({ ...acesso, ts: Date.now() })
    );

    // Mecânico/Campo/Operacional: usa link único por token do tecnico_campo
    if (["mecanico", "campo", "operacional"].includes(modulo) && acesso.funcionario_id) {
      const { data: tc } = await supabase
        .from("tecnicos_campo")
        .select("access_token, link_status")
        .eq("funcionario_id", acesso.funcionario_id)
        .eq("link_status", "ativo")
        .maybeSingle();
      setLoading(false);
      if (tc?.access_token) {
        navigate(`/m/${tc.access_token}`);
        return;
      }
      toast.error("Mecânico sem link ativo. Procure o administrador.");
      return;
    }
    setLoading(false);
    navigate(cfg.redirect(acesso.id));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">{cfg.label}</CardTitle>
          <p className="text-sm text-muted-foreground">Digite seu código PIN para acessar</p>
        </CardHeader>
        <CardContent>
          {!opcoes ? (
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
              <p className="text-sm text-muted-foreground">
                Selecione seu nome:
              </p>
              {opcoes.map((u) => (
                <button
                  key={u.id}
                  onClick={() => entrar(u)}
                  disabled={loading}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                >
                  <div className="font-medium">{u.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {[u.empresa, u.filial, u.funcao].filter(Boolean).join(" • ")}
                  </div>
                </button>
              ))}
              <Button variant="ghost" className="w-full" onClick={() => { setOpcoes(null); setPin(""); }}>
                Voltar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
