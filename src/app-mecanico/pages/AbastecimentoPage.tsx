import { Card } from "@/components/ui/card";

export default function AbastecimentoPage() {
  return (
    <Card className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">Abastecimento</h1>
      <p className="text-sm text-muted-foreground">
        Use o QR Code do vale recebido pelo administrador. A leitura do QR abre a tela pública de abastecimento.
      </p>
    </Card>
  );
}
