import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

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
  if (error === "pin_nao_encontrado") return "PIN não encontrado. Confira os 4 últimos números do CPF.";
  if (error === "sem_permissao_modulo") return "Seu acesso ainda não está liberado para o App Mecânicos.";
  return "PIN inválido ou acesso não liberado.";
};

const aplicarIdentidadeMecanico = () => {
  const iconHref = "/icons/topac-rh-pro.svg?v=20260908-mecanicos-v3";
  document.title = "TOPAC Mecânicos";
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) manifest.href = "/manifest-mecanico.json?v=20260908-mecanicos-v3";
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((icon) => { icon.href = iconHref; icon.type = "image/svg+xml"; });
  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (apple) apple.href = iconHref;
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (theme) theme.content = "#09070f";
  const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.content = "TOPAC Mecânicos";
};

export default function AcessoMecanicoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);

  useEffect(() => {
    aplicarIdentidadeMecanico();
  }, []);

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
        setErro("Nenhum mecânico encontrado para este PIN.");
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
    <div className="min-h-screen bg-[#09070f] text-white flex items-center justify-center p-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-purple-700/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-5">
        <div className="text-center space-y-3">
          <img
            src="/icons/topac-rh-pro.svg?v=20260908-mecanicos-v3"
            alt="TOPAC RH PRO"
            className="mx-auto h-24 w-24 rounded-[24px] shadow-2xl shadow-purple-900/40"
          />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-amber-400">TOPAC OPERACIONAL</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">App Mecânicos</h1>
            <p className="mt-2 text-sm text-zinc-400">Acesso exclusivo da equipe operacional</p>
          </div>
        </div>

        <Card className="border-purple-500/25 bg-[#100d17]/95 text-white shadow-2xl shadow-black/40 backdrop-blur">
          <CardContent className="p-5">
            {!opcoes ? (
              <form onSubmit={validar} className="space-y-5">
                <div className="rounded-xl border border-purple-500/20 bg-black/20 p-4">
                  <label className="mb-3 block text-sm font-semibold text-zinc-200">PIN de acesso</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className="h-16 border-purple-500/25 bg-[#08070c] text-center text-3xl font-black tracking-[0.55em] text-white placeholder:text-zinc-700 focus-visible:ring-purple-500"
                    autoFocus
                    disabled={loading}
                  />
                  <p className="mt-3 text-center text-xs text-zinc-400">
                    Digite somente os <strong className="text-zinc-200">4 últimos números do seu CPF</strong>
                  </p>
                </div>

                {erro && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-950/40 p-3 text-sm text-red-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{erro}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  className="h-14 w-full bg-gradient-to-r from-purple-700 to-purple-500 text-base font-bold text-white hover:from-purple-600 hover:to-purple-400"
                  disabled={loading || pin.length !== 4}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar no meu perfil"}
                </Button>

                <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Acesso individual • dados oficiais TOPAC RH PRO
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">Encontramos mais de um cadastro</p>
                  <p className="text-xs text-zinc-400">Selecione seu nome para continuar.</p>
                </div>
                {opcoes.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => entrar(u)}
                    className="w-full rounded-xl border border-purple-500/20 bg-black/20 p-4 text-left transition hover:border-purple-400/60 hover:bg-purple-950/20"
                    disabled={loading}
                  >
                    <div className="font-semibold">{u.nome}</div>
                    <div className="mt-1 text-xs text-zinc-400">
                      {[u.empresa, u.funcao].filter(Boolean).join(" • ")}
                    </div>
                  </button>
                ))}
                <Button variant="ghost" className="w-full text-zinc-300 hover:bg-white/5 hover:text-white" onClick={() => { setOpcoes(null); setPin(""); setErro(null); }}>
                  Voltar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
