import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { MecanicoAppProvider, useMecanicoApp } from "./MecanicoAppContext";
import { ArrowLeft, Fuel, Gauge, History, Home, LogOut, Menu, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
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

const Header = () => {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const isHome = location.pathname === base || location.pathname === `${base}/`;
  if (isHome) return null;

  const title = location.pathname.includes("/abastecimento") ? "Abastecimento"
    : location.pathname.includes("/historico") ? "Histórico"
    : location.pathname.includes("/veiculo") ? "KM / Veículo"
    : location.pathname.includes("/chamados") ? "Manutenção"
    : location.pathname.includes("/ponto") ? "Registro de Ponto"
    : "TOPAC RH PRO";

  return (
    <header className="sticky top-0 z-30 border-b border-fuchsia-500/15 bg-[#030309]/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 px-3">
        <button onClick={() => navigate(base)} className="grid h-10 w-10 place-items-center rounded-full border border-fuchsia-500/20 bg-[#09090f] text-zinc-200" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-black text-white">{title}</div>
          <div className="truncate text-[10px] text-zinc-500">{mecanico.nome}</div>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400"><Wrench className="h-4 w-4" /></span>
      </div>
    </header>
  );
};

const FuelRequestDelete = () => {
  const { mecanico } = useMecanicoApp();
  const location = useLocation();
  const isFuel = location.pathname.includes("/abastecimento");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [protocol, setProtocol] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isFuel) {
      setRequestId(null);
      setProtocol("");
      return;
    }

    let active = true;
    const load = async () => {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_abastecimento_contexto", {
        p_acesso_id: mecanico.acesso_id,
      });
      if (!active || error) return;
      const result = data as { solicitacao_ativa?: { id?: string; app_request_id?: string } | null } | null;
      setRequestId(result?.solicitacao_ativa?.id || null);
      setProtocol(result?.solicitacao_ativa?.app_request_id || "");
    };

    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isFuel, mecanico.acesso_id]);

  const excluir = async () => {
    if (!requestId || loading) return;
    const confirmed = window.confirm(
      `Excluir somente esta solicitação de abastecimento${protocol ? ` (${protocol})` : ""}?\n\nO registro de abastecimento, quando já concluído, NÃO será excluído.`,
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const { data, error } = await supabaseRpc.rpc("app_mecanico_excluir_solicitacao_abastecimento", {
        p_acesso_id: mecanico.acesso_id,
        p_autorizacao_id: requestId,
      });
      const result = data as { ok?: boolean; error?: string } | null;
      if (error || !result?.ok) {
        if (result?.error === "registro_abastecimento_existente") {
          toast.error("Essa solicitação já virou um registro de abastecimento e não pode ser excluída.");
        } else {
          toast.error(result?.error || error?.message || "Não foi possível excluir a solicitação.");
        }
        return;
      }
      setRequestId(null);
      setProtocol("");
      toast.success("Solicitação de abastecimento excluída.");
      window.setTimeout(() => window.location.reload(), 350);
    } finally {
      setLoading(false);
    }
  };

  if (!isFuel || !requestId) return null;

  return (
    <div className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-24px)] max-w-lg -translate-x-1/2 px-1">
      <button
        type="button"
        onClick={() => void excluir()}
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-[#12070a]/95 text-sm font-bold text-red-300 shadow-xl backdrop-blur-xl disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" />
        {loading ? "Excluindo solicitação..." : "Excluir esta solicitação"}
      </button>
    </div>
  );
};

const BottomNav = () => {
  const { mecanico, sair } = useMecanicoApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const isHome = location.pathname === base || location.pathname === `${base}/`;
  const isHistory = location.pathname.includes("/historico");
  const isFuel = location.pathname.includes("/abastecimento");
  const isVehicle = location.pathname.includes("/veiculo");

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 backdrop-blur-sm" onClick={() => setMoreOpen(false)}>
          <div className="mx-auto w-full max-w-lg rounded-[24px] border border-fuchsia-500/25 bg-[#08080e] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-fuchsia-400">Mais opções</p><h2 className="mt-1 text-lg font-black text-white">Operação do dia</h2></div>
              <button onClick={() => setMoreOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-fuchsia-500/20 text-zinc-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setMoreOpen(false); navigate(`${base}/chamados`); }} className="rounded-xl border border-fuchsia-500/15 bg-[#05050a] p-3 text-left text-white"><Wrench className="mb-3 h-5 w-5 text-fuchsia-400" /><strong className="block text-sm">Manutenção</strong><span className="mt-1 block text-[10px] text-zinc-500">Chamados e serviços</span></button>
              <button onClick={sair} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-left text-white"><LogOut className="mb-3 h-5 w-5 text-red-400" /><strong className="block text-sm">Sair</strong><span className="mt-1 block text-[10px] text-zinc-500">Encerrar acesso</span></button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-2 left-1/2 z-40 grid w-[calc(100%-18px)] max-w-lg -translate-x-1/2 grid-cols-5 items-end rounded-[24px] border border-fuchsia-500/20 bg-[#07070df2] px-1.5 pb-[calc(7px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_35px_rgba(0,0,0,.4)] backdrop-blur-xl">
        <button onClick={() => navigate(base)} className={`flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] ${isHome ? "text-fuchsia-400" : "text-zinc-500"}`}><Home className="h-6 w-6" /><span>Início</span></button>
        <button onClick={() => navigate(`${base}/historico`)} className={`flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] ${isHistory ? "text-fuchsia-400" : "text-zinc-500"}`}><History className="h-6 w-6" /><span>Histórico</span></button>
        <button onClick={() => navigate(`${base}/abastecimento`)} className={`relative -translate-y-1 flex min-h-16 flex-col items-center justify-end gap-0.5 text-[8px] ${isFuel ? "text-fuchsia-300" : "text-zinc-200"}`}>
          <span className="grid h-14 w-14 place-items-center rounded-full border border-fuchsia-400/80 bg-[radial-gradient(circle_at_45%_35%,#6d1da8,#1b0927_68%,#08070d)] shadow-[0_0_28px_rgba(168,85,247,.38)]"><Fuel className="h-7 w-7" /></span><span>Abastecimento</span>
        </button>
        <button onClick={() => navigate(`${base}/veiculo`)} className={`flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] ${isVehicle ? "text-fuchsia-400" : "text-zinc-500"}`}><Gauge className="h-6 w-6" /><span>KM / Veículo</span></button>
        <button onClick={() => setMoreOpen(true)} className="flex min-h-14 flex-col items-center justify-end gap-1 text-[8px] text-zinc-500"><Menu className="h-6 w-6" /><span>Mais</span></button>
      </nav>
    </>
  );
};

const MecanicoShell = () => (
  <div className="min-h-screen bg-[#030309] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_-5%,rgba(126,34,206,0.13),transparent_31%),radial-gradient(circle_at_7%_32%,rgba(88,28,135,0.06),transparent_27%)]" />
    <Header />
    <main className="relative mx-auto w-full max-w-lg px-3 pb-[calc(128px+env(safe-area-inset-bottom))] pt-3 sm:px-4">
      <Outlet />
    </main>
    <FuelRequestDelete />
    <BottomNav />
  </div>
);

const MecanicoAppLayout = () => {
  useEffect(() => {
    aplicarIdentidadeMecanico();
  }, []);

  return (
    <MecanicoAppProvider>
      <MecanicoShell />
    </MecanicoAppProvider>
  );
};

export default MecanicoAppLayout;
