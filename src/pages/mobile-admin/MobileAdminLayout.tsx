import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Activity, Sparkles } from "lucide-react";
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
      <div className="min-h-screen bg-[#040814] text-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-cyan-400/30 border-t-cyan-300 animate-spin" />
          <div className="text-cyan-300/80 text-xs uppercase tracking-[0.3em]">carregando central</div>
        </div>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="min-h-screen bg-[#040814] text-slate-200 flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl border border-cyan-400/15 bg-[rgba(10,17,30,0.85)] p-8 text-center space-y-4 shadow-[0_0_60px_-10px_rgba(34,211,238,0.3)]">
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
      className="min-h-screen text-slate-100 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 15% 10%, rgba(124,58,237,.28), transparent 38%)," +
          "radial-gradient(circle at 85% 15%, rgba(34,211,238,.18), transparent 40%)," +
          "radial-gradient(circle at 50% 95%, rgba(16,185,129,.12), transparent 45%)," +
          "linear-gradient(160deg, #040814 0%, #060d1c 45%, #0a0a1f 100%)",
      }}
    >
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-cyan-400/10 bg-[rgba(4,8,20,0.7)] backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {!isHome ? (
            <button
              onClick={() => navigate("/mobile/admin")}
              className="w-9 h-9 rounded-xl border border-cyan-400/20 bg-cyan-400/5 text-cyan-300 hover:bg-cyan-400/10 hover:border-cyan-400/40 transition-all flex items-center justify-center"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400/30 via-violet-500/20 to-fuchsia-500/30 border border-cyan-400/30 flex items-center justify-center shadow-[0_0_20px_-5px_rgba(34,211,238,0.5)]">
              <Sparkles className="w-4 h-4 text-cyan-200" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.3em] text-cyan-300/70 font-semibold">
              {data.layout || "TOPAC · MOBILE ADMIN"}
            </div>
            <div className="text-sm font-semibold text-white truncate">{data.titulo || "Central operacional"}</div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); navigate("/"); }}
            className="w-9 h-9 rounded-xl border border-slate-700/50 bg-slate-900/30 text-slate-400 hover:text-rose-300 hover:border-rose-400/30 hover:bg-rose-500/5 transition-all flex items-center justify-center"
            aria-label="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2.5 flex items-center gap-2 text-[10px]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-400/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-emerald-300 font-medium tracking-wide">ONLINE</span>
          </div>
          <div className="flex items-center gap-1.5 text-sky-200/60">
            <Activity className="w-3 h-3" />
            <span>{data.subtitulo || "Sincronizado com Supabase"}</span>
          </div>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto p-4 pb-20">
        <Outlet context={{ data }} />
      </main>
    </div>
  );
}
