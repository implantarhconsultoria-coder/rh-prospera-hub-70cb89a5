import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { LogIn, LogOut, ClipboardList, Car, Fuel, History, Sparkles, Wrench, UtensilsCrossed, Coffee, Settings, ArrowUpRight, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type Card = {
  label: string;
  sub?: string;
  icon: React.ElementType;
  to?: string;
  tint: string;
  action?: () => void;
};

export default function HomePage() {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const base = `/app-mecanico/${mecanico.acesso_id}`;
  const isRodrigo = useMemo(() => {
    const nome = (mecanico.nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return nome.includes("rodrigo") && nome.includes("sabino");
  }, [mecanico.nome]);
  const [layoutMode, setLayoutMode] = useState(() => {
    return localStorage.getItem("topac_mecanico_layout_mode") || localStorage.getItem("topac_layout_mode") || "premium";
  });

  useEffect(() => {
    if (!isRodrigo) return;
    localStorage.setItem("topac_mecanico_layout_mode", "premium");
    setLayoutMode("premium");
  }, [isRodrigo]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = mecanico.nome.split(" ")[0];

  const setLayout = () => {
    const next = layoutMode === "premium" ? "padrao" : "premium";
    localStorage.setItem("topac_mecanico_layout_mode", next);
    setLayoutMode(next);
    window.dispatchEvent(new Event("topac-layout-change"));
  };

  const cards: Card[] = [
    { label: "Entrada", sub: "Bater ponto", icon: LogIn, to: `${base}/ponto?tipo=entrada`, tint: "from-cyan-400 to-violet-500" },
    { label: "Almoco", sub: "Inicio", icon: UtensilsCrossed, to: `${base}/ponto?tipo=almoco_inicio`, tint: "from-sky-500/20 to-violet-500/20" },
    { label: "Retorno", sub: "Almoco", icon: Coffee, to: `${base}/ponto?tipo=almoco_fim`, tint: "from-sky-500/20 to-violet-500/20" },
    { label: "Saida", sub: "Encerrar dia", icon: LogOut, to: `${base}/ponto?tipo=saida`, tint: "from-cyan-400/20 to-fuchsia-500/20" },
    { label: "Chamados", sub: "Atendimentos", icon: ClipboardList, to: `${base}/chamados`, tint: "from-sky-500/20 to-violet-500/20" },
    { label: "Veiculo / KM", sub: "Registrar KM", icon: Car, to: `${base}/veiculo`, tint: "from-sky-500/20 to-violet-500/20" },
    { label: "Abastecer", sub: "QR + bomba", icon: Fuel, to: `${base}/abastecimento`, tint: "from-cyan-400/20 to-violet-500/20" },
    { label: "Historico", sub: "Meus registros", icon: History, to: `${base}/historico`, tint: "from-sky-500/20 to-violet-500/20" },
    { label: "Config", sub: layoutMode === "premium" ? "Layout premium" : "Layout padrao", icon: Settings, tint: "from-sky-500/20 to-violet-500/20", action: setLayout },
  ];

  if (layoutMode !== "premium") {
    return (
      <div className="space-y-5">
        <div className="px-1 pt-1">
          <h1 className="text-2xl font-bold tracking-tight">{greet}, {firstName}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{[mecanico.empresa, mecanico.funcao].filter(Boolean).join(" - ") || "Tudo pronto para o dia"}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Wrench className="w-5 h-5 text-primary" /></div>
          <div><div className="text-sm font-semibold">App Mecanico</div><div className="text-[11px] text-muted-foreground">Online - acesso liberado</div></div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map((c) => (
            <button key={c.label} onClick={() => c.action ? c.action() : navigate(c.to!)} className="rounded-2xl bg-card border border-border/60 shadow-sm active:scale-95 transition flex flex-col items-start gap-2 p-3 text-left min-h-[110px]">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br", c.tint)}><c.icon className="w-5 h-5" /></div>
              <div className="mt-auto"><div className="text-sm font-semibold leading-tight">{c.label}</div>{c.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mec-home space-y-5">
      <section className="mec-hero-card">
        <div className="mec-pulse"><Sparkles className="w-4 h-4" /> sistema online</div>
        <h1>{greet}, {firstName}</h1>
        <p>{[mecanico.empresa, mecanico.funcao].filter(Boolean).join(" - ") || "Tudo pronto para o dia"}</p>
        {mecanico.registro_teste && <p className="mt-2 text-amber-300">Modo teste ativo - registros isolados dos relatórios oficiais</p>}
      </section>

      <section className="mec-mission-card">
        <div className="mec-card-title"><CheckSquare className="w-5 h-5 text-cyan-300" /> Ciclo do dia</div>
        <button onClick={() => navigate(`${base}/ponto?tipo=entrada`)} className="mec-main-action">
          <LogIn className="w-5 h-5" /> Registrar entrada
        </button>
        <button onClick={() => navigate(`${base}/chamados`)} className="mec-outline-action">
          <ClipboardList className="w-5 h-5" /> Ver chamados
        </button>
        <button onClick={() => navigate(`${base}/abastecimento`)} className="mec-outline-action">
          <Fuel className="w-5 h-5" /> Abastecimento QR Code
        </button>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {cards.map((c, index) => (
          <button
            key={c.label}
            onClick={() => c.action ? c.action() : navigate(c.to!)}
            className={cn("mec-tile", index === 0 && "mec-tile-primary")}
          >
            <div className="flex items-start justify-between">
              <c.icon className="w-7 h-7" />
              <ArrowUpRight className="w-4 h-4 opacity-70" />
            </div>
            <div className="mt-auto text-left">
              <div className="font-bold text-base">{c.label}</div>
              <div className="text-xs opacity-70">{c.sub}</div>
            </div>
          </button>
        ))}
      </section>

      <section className="mec-log-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-300/10">
          <div className="font-bold flex items-center gap-2"><Sparkles className="w-4 h-4 text-cyan-300" /> Status do app</div>
          <div className="text-[10px] tracking-[0.2em] text-emerald-300">TEMPO REAL</div>
        </div>
        {["Acesso liberado", "GPS e camera prontos", "Chamados sincronizados"].map((line, idx) => (
          <div key={line} className="grid grid-cols-[54px_46px_1fr] gap-2 px-4 py-3 text-xs border-b border-cyan-300/10 last:border-0">
            <span className="text-slate-400">{idx === 0 ? "agora" : "ok"}</span>
            <span className="text-emerald-300">OK</span>
            <span>{line}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
