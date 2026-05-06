import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, AlertTriangle } from "lucide-react";

interface Props {
  onResult: (codigo: string) => void;
  onCancel: () => void;
}

/** Scanner de QR Code mobile-first usando câmera traseira. Robusto a falhas. */
export default function QRScanner({ onResult, onCancel }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const cancelledRef = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let mounted = true;
    cancelledRef.current = false;

    (async () => {
      try {
        if (!elRef.current) return;
        const id = "qr-reader-mecanico";
        elRef.current.id = id;

        // Import dinâmico evita crash no carregamento do módulo
        const mod = await import("html5-qrcode").catch(() => null);
        if (!mod || !mounted) {
          setErro("Não foi possível iniciar o leitor. Use o código manual.");
          setStarting(false);
          return;
        }

        const { Html5Qrcode } = mod;
        const scanner = new Html5Qrcode(id);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (txt: string) => {
            if (cancelledRef.current) return;
            cancelledRef.current = true;
            try { scanner.stop().then(() => scanner.clear()).catch(() => {}); } catch {}
            onResult(txt);
          },
          () => {},
        );
        if (mounted) setStarting(false);
      } catch (e) {
        console.error("QRScanner start error:", e);
        if (mounted) {
          setErro("Permita acesso à câmera ou use o código manual.");
          setStarting(false);
        }
      }
    })();

    return () => {
      mounted = false;
      cancelledRef.current = true;
      const s = scannerRef.current;
      if (s) {
        try { s.stop().then(() => s.clear()).catch(() => {}); } catch {}
      }
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="p-4 flex items-center justify-between text-white bg-black/80">
        <span className="font-semibold">Ler QR Code</span>
        <button onClick={onCancel} className="p-1 rounded-full bg-white/10"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 flex items-center justify-center relative">
        <div ref={elRef} className="w-full max-w-md aspect-square" />
        {starting && !erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <Loader2 className="w-8 h-8 animate-spin" /><p className="text-sm">Iniciando câmera...</p>
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center gap-3 bg-black">
            <AlertTriangle className="w-10 h-10 text-yellow-400" />
            <p className="text-sm">{erro}</p>
            <Button onClick={onCancel} variant="secondary" size="sm">Voltar e digitar código</Button>
          </div>
        )}
      </div>
      <p className="text-white text-xs text-center p-3 bg-black/80">Centralize o QR Code do vale dentro do quadrado</p>
    </div>
  );
}
