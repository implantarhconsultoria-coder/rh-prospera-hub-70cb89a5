import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import AlmoxarifadoDesktopV2 from '@/components/AlmoxarifadoDesktopV2';
import { AlmoxarifadoAccessGate, useAlmoxarifadoAccess } from '@/components/AlmoxarifadoAccessGate';

const AlmoxarifadoPage: React.FC = () => {
  const { session, companies, dataLoading, userRole, userRoles, roleLoading } = useApp();
  const access = useAlmoxarifadoAccess();
  const matriz = useMemo(() => companies.find((c:any) => c.codigo === 'topac-matriz') || null, [companies]);
  const [ready, setReady] = useState(false);

  const privilegedAccess = useMemo(() => {
    const roles = new Set([userRole, ...(userRoles || [])].filter(Boolean));
    return roles.has('admin') || roles.has('diretor_geral');
  }, [userRole, userRoles]);

  const allowed = privilegedAccess || access.allowed;

  useEffect(() => {
    if (roleLoading || !allowed || dataLoading || !session?.user?.id || !matriz?.id) {
      setReady(false);
      return;
    }
    let active = true;
    setReady(false);
    supabase.rpc('almoxarifado_set_company_context' as any, { p_company_id: matriz.id }).then(({ error }) => {
      if (!active) return;
      if (error) {
        console.error('[almoxarifado-v2] contexto', error);
        toast.error('Não foi possível abrir o estoque central TOPAC.');
        return;
      }
      setReady(true);
    });
    return () => { active = false; };
  }, [allowed, dataLoading, matriz?.id, roleLoading, session?.user?.id]);

  if (roleLoading || access.checking) {
    return <div className="grid min-h-[520px] place-items-center bg-background"><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Validando acesso ao Almoxarifado...</div></div>;
  }

  if (!allowed) return <AlmoxarifadoAccessGate state={access} />;

  if (dataLoading || !ready) {
    return <div className="grid min-h-[520px] place-items-center bg-background"><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin"/>Abrindo estoque central TOPAC...</div></div>;
  }

  return <div className="almox-v2 bg-[#F7F8FC]">
    <style>{`
      .almox-v2 button { opacity: 1 !important; }
      .almox-v2 button:disabled { opacity: .72 !important; }
      .almox-v2 button .text-slate-400 { color: #475569 !important; }
      .almox-v2 button .text-slate-500 { color: #334155 !important; }
      .almox-v2 button[class*="bg-white"] { color: #0f172a !important; border-color: #cbd5e1 !important; }
      .almox-v2 button[class*="bg-white"]:hover { border-color: #7c3aed !important; background: #f5f3ff !important; }
      .almox-v2 button[class*="amber"], .almox-v2 button[class*="yellow"] { color: #422006 !important; }
      .almox-v2 button:focus-visible { outline: 3px solid #facc15 !important; outline-offset: 2px; }
    `}</style>
    <AlmoxarifadoDesktopV2 />
  </div>;
};

export default AlmoxarifadoPage;
