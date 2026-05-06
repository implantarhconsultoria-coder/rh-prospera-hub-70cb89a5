import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home, LogIn } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="text-center max-w-sm w-full">
        <h1 className="mb-2 text-5xl font-bold">404</h1>
        <p className="mb-6 text-lg text-muted-foreground">Página não encontrada</p>
        <div className="space-y-2">
          <button
            onClick={() => navigate("/")}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors"
          >
            <Home className="w-4 h-4" /> Voltar ao Início
          </button>
          <button
            onClick={() => { window.location.href = "/login"; }}
            className="w-full inline-flex items-center justify-center gap-2 bg-background hover:bg-accent border border-border text-foreground rounded-xl py-2.5 px-4 text-sm font-semibold transition-colors"
          >
            <LogIn className="w-4 h-4" /> Ir para Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
