import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, LayoutDashboard, Package, Headphones, Wrench, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  clearExternalSession,
  isExternalSessionExpired,
  readExternalSession,
  type SessaoAcessoExterno,
} from "@/lib/acessoExternoAuth";

type Portal = {
  acesso_id: string;
  modulo: string;
  perfil_acesso: string;
  empresa: string;
  filial: string;
  funcao: string;
};

const REMOVED_MODULES = new Set(["financeiro", "faturamento"]);

const MODULO_REDIRECT: Record<string, (id: string) => string> = {
  filial: (id) => `/filial-ext/${id}`,
  almoxarifado: (id) => `/almoxarifado-ext/${id}`,
  operacional: (id) => `/operacional-ext/${id}`,
  campo: (id) => `/campo-ext/${id}`,
  mecanico: (id) => `/app-mecanico/${id}`,
};

const MODULO_INFO: Record<string, { label: string; icon: any; color: string; descricao: string }> = {
  filial: { label: "Portal Filial", icon: LayoutDashboard, color: "bg-purple-600", descricao: "RH, funcionários, fechamento" },
  almoxarifado: { label: "Almoxarifado", icon: Package, color: "bg-orange-600", descricao: "Solicitacoes de carga e retirada" },
  operacional: { label: "Operacional", icon: Headphones, color: "bg-blue-600", descricao: "Chamados e atendimento" },
  campo: { label: "Campo", icon: Wrench, color: "bg-amber-600", descricao: "Atendimento em campo" },
  mecanico: { label: "App Mecanico", icon: Wrench, color: "bg-red-600", descricao: "Ponto, chamados e abastecimento" },
};

export default function PortaisPage() {
  const navigate = useNavigate();
  const [sessao, setSessao] = useState<SessaoAcessoExterno | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = readExternalSession();
    if (!s || !s.portais?.length || isExternalSessionExpired(s)) {
      clearExternalSession();
      navigate("/modulos", { replace: true });
      return;
    }

    const portaisWeb = s.portais.filter((p) => {
      const modulo = String(p.modulo || "").toLowerCase();
      return modulo !== "mecanico" && !REMOVED_MODULES.has(modulo);
    });

    if (!portaisWeb.length) {
      const temMecanico = s.portais.some((p) => String(p.modulo || "").toLowerCase() === "mecanico");
      clearExternalSession();
      navigate(temMecanico ? "/acesso-mecanico" : "/modulos", { replace: true });
      return;
    }

    setSessao({ ...s, portais: portaisWeb });
  }, [navigate]);

  const entrarPortal = async (p: Portal) => {
    if (REMOVED_MODULES.has(String(p.modulo || "").toLowerCase())) return;
    setLoading(true);

    if (p.modulo === "mecanico") {
      setLoading(false);
      toast.info("App dos Mecanicos usa somente o link /acesso-mecanico.");
      navigate("/acesso-mecanico");
      return;
    }

    const { data, error } = await supabase.rpc("acesso_externo_obter" as any, {
      p_id: p.acesso_id,
      p_modulo: p.modulo,
    });
    if (error || !(data as any)?.ok) {
      setLoading(false);
      toast.error("Não foi possível abrir o portal.");
      return;
    }

    const acesso = (data as any).acesso;
    localStorage.setItem("acesso_externo", JSON.stringify({ ...acesso, ts: Date.now() }));
    setLoading(false);
    const goto = MODULO_REDIRECT[p.modulo];
    if (!goto) {
      toast.error("Módulo não disponível.");
      return;
    }
    navigate(goto(acesso.id));
  };

  const sair = () => {
    clearExternalSession();
    navigate("/modulos", { replace: true });
  };

  if (!sessao) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Olá, {sessao.nome}</h1>
            <p className="text-sm text-muted-foreground">Escolha o portal que deseja acessar.</p>
          </div>
          <Button variant="outline" size="sm" onClick={sair}><LogOut className="w-4 h-4 mr-2" /> Sair</Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {sessao.portais.map((p) => {
            const info = MODULO_INFO[p.modulo] || { label: p.modulo, icon: ArrowRight, color: "bg-primary", descricao: "" };
            const Icon = info.icon;
            return (
              <Card key={p.acesso_id} className="cursor-pointer hover:shadow-lg transition-shadow group" onClick={() => !loading && entrarPortal(p)}>
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <div className={`w-12 h-12 rounded-lg ${info.color} flex items-center justify-center shrink-0`}><Icon className="w-6 h-6 text-white" /></div>
                  <div className="flex-1"><CardTitle className="text-lg">{info.label}</CardTitle><p className="text-xs text-muted-foreground">{info.descricao}</p></div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{[p.empresa, p.filial].filter(Boolean).join(" · ") || "—"}</CardContent>
              </Card>
            );
          })}
        </div>

        {loading && <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Abrindo portal...</div>}
      </div>
    </div>
  );
}
