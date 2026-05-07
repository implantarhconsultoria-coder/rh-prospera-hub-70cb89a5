import { Link } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { LogIn, LogOut, Coffee, Sun, History } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  const { mecanico } = useMecanicoApp();
  const base = `/app-mecanico/${mecanico.acesso_id}`;

  const acoes = [
    { to: `${base}/ponto?tipo=entrada`, label: "Entrada", icon: LogIn, color: "text-emerald-600" },
    { to: `${base}/ponto?tipo=almoco_inicio`, label: "Início Almoço", icon: Coffee, color: "text-amber-600" },
    { to: `${base}/ponto?tipo=almoco_fim`, label: "Retorno Almoço", icon: Sun, color: "text-orange-600" },
    { to: `${base}/ponto?tipo=saida`, label: "Saída", icon: LogOut, color: "text-rose-600" },
    { to: `${base}/historico`, label: "Histórico", icon: History, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">Olá,</p>
        <p className="text-lg font-semibold">{mecanico.nome}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {acoes.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="bg-card hover:bg-accent transition-colors rounded-lg p-4 flex flex-col items-center justify-center gap-2 border min-h-[100px]"
          >
            <a.icon className={`w-7 h-7 ${a.color}`} />
            <span className="text-sm font-medium text-center">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
