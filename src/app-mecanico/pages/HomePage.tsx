import { useNavigate } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { LogIn, LogOut, ClipboardList, Car, Fuel, History, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type Card = {
  label: string;
  sub?: string;
  icon: React.ElementType;
  to: string;
  tint: string;
};

export default function HomePage() {
  const { mecanico } = useMecanicoApp();
  const navigate = useNavigate();
  const base = `/app-mecanico/${mecanico.acesso_id}`;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = mecanico.nome.split(" ")[0];

  const cards: Card[] = [
    { label: "Entrada", sub: "Bater ponto", icon: LogIn, to: `${base}/ponto?tipo=entrada`, tint: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
    { label: "Saída", sub: "Encerrar dia", icon: LogOut, to: `${base}/ponto?tipo=saida`, tint: "from-rose-500/15 to-rose-500/5 text-rose-600 dark:text-rose-400" },
    { label: "Chamados", sub: "Atendimentos", icon: ClipboardList, to: `${base}/chamados`, tint: "from-purple-500/15 to-purple-500/5 text-purple-600 dark:text-purple-400" },
    { label: "Veículo / KM", sub: "Registrar KM", icon: Car, to: `${base}/veiculo`, tint: "from-indigo-500/15 to-indigo-500/5 text-indigo-600 dark:text-indigo-400" },
    { label: "Abastecimento", sub: "Combustível", icon: Fuel, to: `${base}/veiculo`, tint: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400" },
    { label: "Histórico", sub: "Meus registros", icon: History, to: `${base}/historico`, tint: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400" },
  ];

  return (
    <div className="space-y-5">
      {/* Saudação */}
      <div className="px-1 pt-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {greet}, {firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {[mecanico.empresa, mecanico.funcao].filter(Boolean).join(" • ") || "Tudo pronto para o dia"}
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Wrench className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">App Mecânico</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Online · acesso liberado
          </div>
        </div>
      </div>

      {/* Grid de cards */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Acesso rápido</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {cards.map((c) => (
            <button
              key={c.label}
              onClick={() => navigate(c.to)}
              className="rounded-2xl bg-card border border-border/60 shadow-sm active:scale-95 transition flex flex-col items-start gap-2 p-3 text-left min-h-[110px]"
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br", c.tint)}>
                <c.icon className="w-5 h-5" />
              </div>
              <div className="mt-auto">
                <div className="text-sm font-semibold leading-tight">{c.label}</div>
                {c.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Rodapé / dica */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold">Dica</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toque em um card para abrir. Use <i>Entrada</i> ao começar e <i>Saída</i> ao encerrar o dia.
          </p>
        </div>
      </div>
    </div>
  );
}
