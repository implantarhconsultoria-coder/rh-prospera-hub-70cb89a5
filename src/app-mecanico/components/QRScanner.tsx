import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Loader2, X, AlertTriangle } from "lucide-react";

interface Props {
  onResult: (codigo: string) => void;
  onCancel: () => void;
}

/** Scanner de QR Code mobile-first usando câmera traseira. */
export default function QRScanner({ onResult, onCancel }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const id = "qr-reader-mecanico";
    if (!elRef.current) return;
    elRef.current.id = id;
    const scanner = new Html5Qrcode(id);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (txt) => {
          if (cancelled) return;
          cancelled = true;
          scanner.stop().then(() => scanner.clear()).catch(() => {});
          onResult(txt);
        },
        () => {},
      )
      .then(() => setStarting(false))
      .catch((e) => {
        setErro("Permita acesso à câmera para ler o QR Code.");
        setStarting(false);
      });

    return () => {
      cancelled = true;
      scanner.stop().then(() => scanner.clear()).catch(() => {});
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
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <Loader2 className="w-8 h-8 animate-spin" /><p className="text-sm">Iniciando câmera...</p>
          </div>
        )}
        {erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-6 text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-yellow-400" />
            <p className="text-sm">{erro}</p>
            <Button onClick={onCancel} variant="secondary" size="sm">Voltar</Button>
          </div>
        )}
      </div>
      <p className="text-white text-xs text-center p-3 bg-black/80">Centralize o QR Code do vale dentro do quadrado</p>
    </div>
  );
}
