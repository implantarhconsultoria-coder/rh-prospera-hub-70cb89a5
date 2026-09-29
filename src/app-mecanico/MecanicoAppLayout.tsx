import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { MecanicoAppProvider, useMecanicoApp } from "./MecanicoAppContext";
import { ArrowLeft, Fuel, Gauge, History, Home, LogOut, MapPin, Menu, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const supabaseRpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

const aplicarIdentidadeMecanico = () => {
  const iconHref = "/icons/topac-mecanicos-oficial-20260908-1050-192.png?v=20260929-app-layout-v1";
  document.title = "TOPAC Mecânicos";
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) manifest.href = "/manifest-mecanicos-install-20260908.json?v=20260929-app-layout-v1";
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((icon) => { icon.href = iconHref; icon.type = "image/png"; });
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
    : location.pathname.includes("/chamados") ? "Ocorrências"
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

const FuelTravelMode = () => {
  const { mecanico } = useMecanicoApp();
  const location = useLocation();
  const isFuel = location.pathname.includes("/abastecimento");
  const [loaded, setLoaded] = useState(false);
  const [hasActiveRequest, setHasActiveRequest] = useState(false);
  const [viagem, setViagem] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isFuel) {
      setLoaded(false);
      setHasActiveRequest(false);
      setViagem(false);
      return;
    }

    let active = true;
    const load = async () => {
      const [contextResult, modeResult] = await Promise.all([
        supabaseRpc.rpc("app_mecanico_abastecimento_contexto", { p_acesso_id: mecanico.acesso_id }),
        supabaseRpc.rpc("app_mecanico_modo_abastecimento", { p_acesso_id: mecanico.acesso_id }),
      ]);
      if (!active) return;
      const context = contextResult.data as { solicitacao_ativa?: { id?: string } | null } | null;
      const mode = modeResult.data as { ok?: boolean; viagem?: boolean } | null;
      setHasActiveRequest(Boolean(context?.solicitacao_ativa?.id));
      setViagem(Boolean(mode?.viagem));
      setLoaded(true);
    };

    void load();
    return () => { active = false; };
  }, [isFuel, mecanico.acesso_id]);

  const toggle = async () => {
    if (saving || hasActiveRequest) return;
    const next = !viagem;
    setSaving(true);
    const { data, error } = await supabaseRpc.rpc("app_mecanico_definir_modo_abastecimento", {
      p_acesso_id: mecanico.acesso_id,
      p_viagem: next,
    });
    const result = data as { ok?: boolean; viagem?: boolean; error?: string } | null;
    if (error || !result?.ok) {
      toast.error(result?.error || error?.message || "Não foi possível alterar o modo de abastecimento.");
      setSaving(false);
      return;
    }
    setViagem(Boolean(result.viagem));
    toast.success(next ? "Modo VIAGEM ativado para esta solicitação." : "Modo normal: posto fixo da unidade.");
    setSaving(false);
  };

  if (!isFuel || !loaded || hasActiveRequest) return null;

  return (
    <div className={`mb-3 rounded-xl border p-3 ${viagem ? "border-amber-400/50 bg-amber-500/10" : "border-fuchsia-500/20 bg-[#08080e]"}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${viagem ? "bg-amber-500/15 text-amber-400" : "bg-fuchsia-500/10 text-fuchsia-400"}`}>
          <MapPin className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white">Abastecimento em viagem</div>
          <div className="mt-0.5 text-[10px] leading-snug text-zinc-400">
            {viagem ? "Posto externo. GPS continua obrigatório e o recibo exigirá comprovante para reembolso." : "Opcional. Deixe desligado para usar o posto fixo da unidade."}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={saving}
          className={`relative h-7 w-12 shrink-0 rounded-full border transition ${viagem ? "border-amber-400 bg-amber-500/30" : "border-zinc-700 bg-zinc-900"} disabled:opacity-60`}
          aria-pressed={viagem}
          aria-label="Alternar abastecimento em viagem"
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${viagem ? "left-[25px]" : "left-0.5"}`} />
        </button>
      </div>
      {viagem && <div className="mt-2 rounded-lg border border-amber-400/25 bg-black/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-amber-300">VIAGEM ATIVA — apresentar recibo do posto para reembolso</div>}
    </div>
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

  const itemClass = (active: boolean) =>
    `relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[18px] border text-[9px] font-semibold transition active:scale-[.97] ${
      active
        ? "border-fuchsia-400/20 bg-[linear-gradient(180deg,rgba(168,85,247,.14),rgba(168,85,247,.035))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
        : "border-transparent text-zinc-500"
    }`;

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/75 p-3 backdrop-blur-md" onClick={() => setMoreOpen(false)}>
          <div className="mx-auto w-full max-w-lg rounded-[28px] border border-fuchsia-500/20 bg-[linear-gradient(155deg,#100918,#07070d_55%,#050509)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-24px_70px_rgba(0,0,0,.65)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-[9px] font-black uppercase tracking-[.2em] text-fuchsia-300">Mais opções</p><h2 className="mt-1 text-lg font-black tracking-tight text-white">Operação do dia</h2></div>
              <button onClick={() => setMoreOpen(false)} className="grid h-10 w-10 place-items-center rounded-[14px] border border-white/[.07] bg-white/[.03] text-zinc-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => { setMoreOpen(false); navigate(`${base}/chamados`); }} className="rounded-[20px] border border-fuchsia-500/20 bg-[linear-gradient(145deg,rgba(168,85,247,.09),rgba(255,255,255,.015))] p-4 text-left text-white shadow-[0_12px_30px_rgba(0,0,0,.25)]"><span className="grid h-11 w-11 place-items-center rounded-[15px] border border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-300"><Wrench className="h-5 w-5" /></span><strong className="mt-4 block text-sm font-black">Ocorrências</strong><span className="mt-1 block text-[10px] leading-snug text-zinc-500">Compressores e serviços</span></button>
              <button onClick={sair} className="rounded-[20px] border border-red-500/15 bg-[linear-gradient(145deg,rgba(239,68,68,.07),rgba(255,255,255,.012))] p-4 text-left text-white shadow-[0_12px_30px_rgba(0,0,0,.25)]"><span className="grid h-11 w-11 place-items-center rounded-[15px] border border-red-400/15 bg-red-500/10 text-red-300"><LogOut className="h-5 w-5" /></span><strong className="mt-4 block text-sm font-black">Sair</strong><span className="mt-1 block text-[10px] leading-snug text-zinc-500">Encerrar acesso</span></button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-2.5 left-1/2 z-40 grid w-[calc(100%-16px)] max-w-lg -translate-x-1/2 grid-cols-5 items-center gap-1 rounded-[30px] border border-white/[.08] bg-[linear-gradient(180deg,rgba(18,14,24,.96),rgba(7,7,12,.98))] px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_42px_rgba(0,0,0,.5),0_10px_34px_rgba(0,0,0,.45)] backdrop-blur-2xl">
        <button onClick={() => navigate(base)} className={itemClass(isHome)}>
          <Home className="h-[22px] w-[22px]" />
          <span>Início</span>
          {isHome && <i className="absolute bottom-1 h-1 w-1 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,.7)]" />}
        </button>
        <button onClick={() => navigate(`${base}/historico`)} className={itemClass(isHistory)}>
          <History className="h-[22px] w-[22px]" />
          <span>Histórico</span>
          {isHistory && <i className="absolute bottom-1 h-1 w-1 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,.7)]" />}
        </button>
        <button onClick={() => navigate(`${base}/abastecimento`)} className={`relative -translate-y-3 flex min-h-[72px] flex-col items-center justify-end gap-1 text-[8px] font-black ${isFuel ? "text-amber-200" : "text-zinc-300"}`}>
          <span className={`grid h-[62px] w-[62px] place-items-center rounded-[22px] border shadow-[0_14px_32px_rgba(0,0,0,.48)] transition active:scale-[.96] ${
            isFuel
              ? "border-amber-300/50 bg-[linear-gradient(145deg,#6e3e08,#2b142f_62%,#120918)] shadow-[0_0_30px_rgba(245,158,11,.22)]"
              : "border-fuchsia-400/35 bg-[linear-gradient(145deg,#4a176a,#21102e_62%,#0d0912)] shadow-[0_0_30px_rgba(168,85,247,.2)]"
          }`}>
            <Fuel className="h-8 w-8" />
          </span>
          <span className="max-w-[72px] truncate">Abastecer</span>
        </button>
        <button onClick={() => navigate(`${base}/veiculo`)} className={itemClass(isVehicle)}>
          <Gauge className="h-[22px] w-[22px]" />
          <span>KM</span>
          {isVehicle && <i className="absolute bottom-1 h-1 w-1 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,.7)]" />}
        </button>
        <button onClick={() => setMoreOpen(true)} className={itemClass(moreOpen)}>
          <Menu className="h-[22px] w-[22px]" />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
};

const MecanicoShell = () => (
  <div className="min-h-screen bg-[#030307] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_84%_-4%,rgba(168,85,247,.16),transparent_30%),radial-gradient(circle_at_8%_28%,rgba(245,158,11,.045),transparent_25%),linear-gradient(180deg,#050309_0%,#030307_48%,#020205_100%)]" />
    <Header />
    <main className="relative mx-auto w-full max-w-lg px-3 pb-[calc(142px+env(safe-area-inset-bottom))] pt-3 sm:px-4">
      <FuelTravelMode />
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
