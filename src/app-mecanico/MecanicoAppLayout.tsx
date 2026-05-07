import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { MecanicoAppProvider, useMecanicoApp } from "./MecanicoAppContext";
import { LogOut, ArrowLeft, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const Header = () => {
  const { mecanico, sair } = useMecanicoApp();
  const navigate = useNavigate();
  const location = useLocation();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const isHome = location.pathname === base || location.pathname === `${base}/`;
  const initials = (mecanico.nome || "M").trim().slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-card/85 border-b border-border/60 flex items-center gap-2 px-3 h-14">
      {!isHome ? (
        <Button size="icon" variant="ghost" className="rounded-full" onClick={() => navigate(base)} aria-label="Voltar">
          <ArrowLeft className="w-5 h-5" />
        </Button>
      ) : (
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0 shadow-md shadow-primary/20">
          <Wrench className="w-5 h-5 text-primary-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate leading-tight">{mecanico.nome}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {[mecanico.empresa, mecanico.funcao].filter(Boolean).join(" • ")}
        </div>
      </div>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
        {initials}
      </div>
      <Button size="icon" variant="ghost" className="rounded-full" onClick={sair} aria-label="Sair">
        <LogOut className="w-5 h-5" />
      </Button>
    </header>
  );
};

const MecanicoAppLayout = () => (
  <MecanicoAppProvider>
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <Header />
      <main className="flex-1 max-w-md w-full mx-auto px-3 pt-3 pb-24">
        <Outlet />
      </main>
    </div>
  </MecanicoAppProvider>
);

export default MecanicoAppLayout;
