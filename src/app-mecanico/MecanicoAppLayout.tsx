import { Outlet, useNavigate } from "react-router-dom";
import { MecanicoAppProvider, useMecanicoApp } from "./MecanicoAppContext";
import { LogOut, ArrowLeft, Wrench } from "lucide-react";

const Header = () => {
  const { mecanico, sair } = useMecanicoApp();
  const navigate = useNavigate();
  const isHome = window.location.pathname.endsWith(`/app-mecanico/${mecanico.acesso_id}`);
  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-30 shadow">
      <div className="px-4 py-3 flex items-center gap-3">
        {!isHome ? (
          <button onClick={() => navigate(`/app-mecanico/${mecanico.acesso_id}`)} className="p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : (
          <Wrench className="w-5 h-5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{mecanico.nome}</p>
          <p className="text-xs opacity-80 truncate">
            {[mecanico.empresa, mecanico.funcao].filter(Boolean).join(" • ")}
          </p>
        </div>
        <button onClick={sair} className="p-1" title="Sair">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};

const MecanicoAppLayout = () => (
  <MecanicoAppProvider>
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <Header />
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        <Outlet />
      </main>
    </div>
  </MecanicoAppProvider>
);

export default MecanicoAppLayout;
