import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { clearMechanicSession, writeMechanicSession } from "./lib/secureSession";

interface SecureLoginResult {
  ok?: boolean;
  error?: string;
  acesso_id?: string;
  token?: string;
}

const acessoRpc = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

const MECHANIC_ICON = "/icons/topac-mecanicos-oficial-20260908-1050-180.png";
const MECHANIC_MANIFEST = "/manifest-mecanicos-install-20260908.json";

const aplicarIdentidadeMecanico = () => {
  document.title = "TOPAC Mecânicos";
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) manifest.href = MECHANIC_MANIFEST;
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((icon) => {
    icon.href = MECHANIC_ICON;
    icon.type = "image/png";
  });
  const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (apple) apple.href = MECHANIC_ICON;
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (theme) theme.content = "#030818";
  const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.content = "TOPAC Mecânicos";
  const appName = document.querySelector<HTMLMetaElement>('meta[name="application-name"]');
  if (appName) appName.content = "TOPAC Mecânicos";
};

export default function AcessoMecanicoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [cpf, setCpf] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    aplicarIdentidadeMecanico();
    clearMechanicSession();
  }, []);

  const validar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErro(null);
    if (cpf.length !== 11 || pin.length !== 4 || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
      setErro("Informe CPF completo, data de nascimento e os 4 últimos dígitos do CPF.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await acessoRpc.rpc("app_mecanico_abrir_sessao", {
        p_cpf: cpf, p_nascimento: nascimento, p_pin: pin,
      });
      const result = data as SecureLoginResult | null;
      if (error || !result?.ok || !result.acesso_id || !result.token) {
        setErro(result?.error === "tentativas_excedidas"
          ? "Muitas tentativas. Aguarde 15 minutos e tente novamente."
          : "Não foi possível autenticar. Confira os dados ou procure o administrador.");
        return;
      }
      writeMechanicSession(result.acesso_id, result.token);
      const qr = searchParams.get("qr") || searchParams.get("codigo") || "";
      navigate(`/app-mecanico/${result.acesso_id}${qr ? `/abastecimento?qr=${encodeURIComponent(qr)}` : ""}`, { replace: true });
    } catch {
      setErro("Não foi possível validar agora. Verifique a internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09070f] text-white flex items-center justify-center p-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-purple-700/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
      </div>
      <div className="relative w-full max-w-sm space-y-5">
        <div className="text-center space-y-3">
          <img src={MECHANIC_ICON} alt="TOPAC Mecânicos" className="mx-auto h-24 w-24 rounded-[24px] shadow-2xl shadow-purple-900/40" />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.28em] text-cyan-400">TOPAC OPERACIONAL</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">App Mecânicos</h1>
            <p className="mt-2 text-sm text-zinc-400">Acesso individual, vinculado ao seu cadastro e unidade</p>
          </div>
        </div>
        <Card className="border-purple-500/25 bg-[#100d17]/95 text-white shadow-2xl shadow-black/40 backdrop-blur">
          <CardContent className="p-5">
            <form onSubmit={validar} className="space-y-4">
              <div>
                <label htmlFor="mec-cpf" className="mb-2 block text-sm font-semibold text-zinc-200">CPF</label>
                <Input
                  id="mec-cpf" type="text" inputMode="numeric" autoComplete="username" maxLength={11}
                  value={cpf} onChange={e => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="11 números do CPF"
                  className="h-12 border-purple-500/25 bg-[#08070c] text-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="mec-nascimento" className="mb-2 block text-sm font-semibold text-zinc-200">Data de nascimento</label>
                <Input
                  id="mec-nascimento" type="date" autoComplete="bday" value={nascimento}
                  onChange={e => setNascimento(e.target.value)}
                  className="h-12 border-purple-500/25 bg-[#08070c] text-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="mec-pin" className="mb-2 block text-sm font-semibold text-zinc-200">PIN de acesso</label>
                <Input
                  id="mec-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                  value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 últimos números do CPF"
                  className="h-14 border-purple-500/25 bg-[#08070c] text-center text-xl font-black tracking-[0.4em] text-white"
                  disabled={loading}
                />
              </div>
              {erro && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}
              <Button
                type="submit" disabled={loading || cpf.length !== 11 || !nascimento || pin.length !== 4}
                className="h-14 w-full bg-gradient-to-r from-fuchsia-700 to-purple-500 text-base font-black text-white hover:from-fuchsia-600 hover:to-purple-400"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar no App Mecânicos"}
              </Button>
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <ShieldCheck className="h-4 w-4" /> Sessão pessoal protegida no servidor
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
