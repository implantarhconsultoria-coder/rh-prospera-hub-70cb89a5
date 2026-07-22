import { useEffect } from "react";
import { ExternalLink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const APP_OPERACIONAL_URL = "https://746ce5953133175295.v2.appdeploy.ai/";

export default function AppMecanicoAdminPage() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign(APP_OPERACIONAL_URL);
    }, 500);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="container mx-auto flex min-h-[65vh] items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wrench className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">App Operacional</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Abrindo o aplicativo externo vinculado à Central TOPAC.
            </p>
          </div>
          <Button asChild>
            <a href={APP_OPERACIONAL_URL}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir agora
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
