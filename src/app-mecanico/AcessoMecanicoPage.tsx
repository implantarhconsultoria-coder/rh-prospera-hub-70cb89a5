import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, AlertCircle } from "lucide-react";

interface Opcao { id: string; nome: string; empresa: string; filial: string; funcao: string; }

export default function AcessoMecanicoPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);

  const validar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro(null);
    if (pin.length !== 4) { setErro("Digite os 4 últimos números do CPF."); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("acesso_externo_validar_pin" as any, {
      p_pin: pin, p_modulo: "mecanico",
    });
    setLoading(false);
    if (error) { setErro("Erro ao validar. Tente novamente."); return; }
    const res = data as any;
    if (!res?.ok) {
      if (res?.error === "bloqueado") setErro("Acesso bloqueado pelo administrador.");
      else if (res?.error === "pin_nao_encontrado") setErro("PIN não encontrado. Procure o administrador.");
      else setErro("PIN inválido.");
      return;
    }
    if (res.count === 1) entrar(res.usuarios[0]);
    else setOpcoes(res.usuarios);
  };

  const entrar = (u: Opcao) => {
    localStorage.setItem("app_mecanico_acesso_id", u.id);
    navigate(`/app-mecanico/${u.id}`);
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
                type="text" inputMode="numeric" maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
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
                <button key={u.id} onClick={() => entrar(u)}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors">
                  <div className="font-medium">{u.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {[u.empresa, u.funcao].filter(Boolean).join(" • ")}
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
