import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { MecanicoAppProvider, useMecanicoApp } from "./MecanicoAppContext";
import MechanicLocationTracker from "./MechanicLocationTracker";
import { LogOut, ArrowLeft, Wrench, Home, ClipboardList, History, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const Header = () => {
  const { mecanico, sair } = useMecanicoApp();
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const isHome = location.pathname === base || location.pathname === `${base}/`;

  return (
    <header className="sticky top-0 z-30 border-b border-cyan-400/10 bg-[#06101f]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-md items-center gap-3 px-4">
        {!isHome ? (
          <Button size="icon" variant="ghost" className="rounded-full text-slate-200 hover:bg-white/10" onClick={() => navigate(base)} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/50 bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/20 shadow-lg shadow-cyan-500/10">
            <Wrench className="h-6 w-6 text-cyan-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black tracking-wide text-white">TOPAC RH PRO</div>
          <div className="truncate text-[11px] text-slate-400">Inteligência Operacional</div>
        </div>
        <Button size="icon" variant="ghost" className="rounded-full text-slate-300 hover:bg-white/10 hover:text-white" onClick={sair} aria-label="Sair">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};

const BottomNav = () => {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const items = [
    { label: "Início", icon: Home, to: base },
    { label: "Chamados", icon: ClipboardList, to: `${base}/chamados` },
    { label: "Histórico", icon: History, to: `${base}/historico` },
    { label: "Perfil", icon: UserRound, to: base },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
      <div className="mx-auto grid w-full max-w-md grid-cols-4 rounded-[26px] border border-cyan-400/10 bg-[#0b1425]/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-xl">
        {items.map((item) => {
          const active = location.pathname === item.to || (item.to !== base && location.pathname.startsWith(item.to));
          return (
            <button key={item.label} onClick={() => navigate(item.to)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] transition ${active ? "bg-cyan-400/10 text-cyan-300" : "text-slate-500 hover:text-slate-200"}`}>
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

const MecanicoShell = () => (
  <div className="min-h-screen bg-[#030a14] text-white">
    <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_15%,rgba(6,182,212,0.12),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(217,70,239,0.12),transparent_26%),radial-gradient(circle_at_50%_95%,rgba(99,102,241,0.12),transparent_30%)]" />
    <Header />
    <MechanicLocationTracker />
    <main className="relative mx-auto w-full max-w-md px-4 pb-28 pt-5">
      <Outlet />
    </main>
    <BottomNav />
  </div>
);

const MecanicoAppLayout = () => (
  <MecanicoAppProvider>
    <MecanicoShell />
  </MecanicoAppProvider>
);

export default MecanicoAppLayout;
