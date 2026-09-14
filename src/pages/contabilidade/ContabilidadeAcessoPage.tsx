import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Calculator, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type PortalKind = 'principal' | 'goiania';

const storageKey = (portal: PortalKind) => `topac_contabilidade_${portal}_session`;

export default function ContabilidadeAcessoPage({ portal }: { portal: PortalKind }) {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const isGoiania = portal === 'goiania';

  const entrar = async (event: FormEvent) => {
    event.preventDefault();
    const clean = codigo.replace(/\D/g, '').slice(0, 6);
    if (clean.length !== 6) {
      toast.error('Digite o código de acesso com 6 números.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('contabilidade_portal_login' as any, {
        p_portal: portal,
        p_codigo: clean,
      });
      const result = data as any;
      if (error || !result?.ok || !result?.token) {
        toast.error('Código não localizado ou acesso não liberado.');
        return;
      }
      localStorage.setItem(storageKey(portal), JSON.stringify({
        token: result.token,
        expira_em: result.expira_em,
        usuario: result.usuario,
      }));
      navigate(isGoiania ? '/contabilidade-goiania' : '/contabilidade', { replace: true });
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível validar o acesso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,.35),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,.18),_transparent_34%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 backdrop-blur flex items-center justify-center mx-auto mb-4">
            {isGoiania ? <Building2 className="w-8 h-8" /> : <Calculator className="w-8 h-8" />}
          </div>
          <p className="text-xs uppercase tracking-[.25em] text-slate-400 mb-2">TOPAC RH PRO</p>
          <h1 className="text-2xl font-bold">Portal da Contabilidade</h1>
          <p className="text-sm text-slate-400 mt-2">
            {isGoiania ? 'Acesso exclusivo da contabilidade responsável pela TOPAC Goiânia.' : 'TOPAC Matriz · TOPAC Praia · LMT · ALQUI'}
          </p>
        </div>

        <Card className="border-white/10 bg-white shadow-2xl">
          <CardContent className="p-6">
            <form onSubmit={entrar} className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-slate-800">Código individual de acesso</label>
                <p className="text-xs text-muted-foreground mt-1">Use o código de 6 dígitos fornecido pelo RH.</p>
                <div className="relative mt-3">
                  <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="pl-10 h-12 text-center text-xl tracking-[.35em] font-bold"
                    placeholder="••••••"
                    maxLength={6}
                    autoFocus
                  />
                </div>
              </div>
              <Button className="w-full h-12" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Entrar no dashboard
              </Button>
            </form>
            <div className="mt-5 rounded-xl bg-slate-50 border p-3 text-xs text-slate-500 leading-relaxed">
              Este acesso é restrito à contabilidade. Não libera painel administrativo, cadastros ou edição das informações do RH.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
