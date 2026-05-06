import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { useMecanicoApp } from "../MecanicoAppContext";
import { Fuel, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VeiculoPage() {
  const { mecanico } = useMecanicoApp();
  return (
    <Card className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">Veículo / KM</h1>
      <p className="text-sm text-muted-foreground">
        O registro de KM é feito junto com o abastecimento. Use o fluxo de Abastecimento para registrar a foto da bomba e do painel.
      </p>
      <Button asChild className="w-full">
        <Link to={`/app-mecanico/${mecanico.acesso_id}/abastecimento`}>
          <Fuel className="w-4 h-4 mr-2" /> Ir para Abastecimento <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </Button>
    </Card>
  );
}
