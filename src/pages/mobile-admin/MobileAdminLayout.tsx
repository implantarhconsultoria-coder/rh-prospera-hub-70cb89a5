import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Circle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMobileAdminHome } from "./useMobileAdminHome";

export default function MobileAdminLayout() {
  const { data, loading } = useMobileAdminHome();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/mobile/admin" || location.pathname === "/mobile/admin/";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050b16] text-slate-200 flex items-center justify-center">
        <div className="text-cyan-300 animate-pulse text-sm">Carregando central mobile…</div>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="min-h-screen bg-[#050b16] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.85)] p-8 text-center space-y-4">
          <div className="text-2xl font-semibold text-white">Acesso restrito</div>
          <p className="text-sm text-slate-400">
            {data?.mensagem || "Acesso mobile/admin não liberado para este usuário."}
          </p>
          <Button onClick={() => navigate("/")} className="w-full">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        background:
          "radial-gradient(circle at 16% 12%, rgba(124,58,237,.22), transparent 32%)," +
          "radial-gradient(circle at 84% 18%, rgba(56,189,248,.14), transparent 34%)," +
          "linear-gradient(135deg, #050b16 0%, #06111f 50%, #0a0a1a 100%)",
      }}
    >
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b border-cyan-400/10 bg-[rgba(5,11,22,0.85)] backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {!isHome && (
            <button
              onClick={() => navigate("/mobile/admin")}
              className="text-cyan-300 hover:text-cyan-200"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/80">{data.layout}</div>
            <div className="text-sm font-semibold text-white truncate">{data.titulo}</div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
            className="text-slate-400 hover:text-white"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2 flex items-center gap-2 text-[11px] text-sky-200/70">
          <Circle className="h-1.5 w-1.5 fill-emerald-400 text-emerald-400" />
          <span>{data.subtitulo}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <Outlet context={{ data }} />
      </main>
    </div>
  );
}
