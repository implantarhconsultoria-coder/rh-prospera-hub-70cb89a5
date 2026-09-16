import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import AlmoxarifadoDesktopV2 from '@/components/AlmoxarifadoDesktopV2';
import EquipmentLabelGenerator from '@/components/EquipmentLabelGenerator';
import { AlmoxarifadoAccessGate, useAlmoxarifadoAccess } from '@/components/AlmoxarifadoAccessGate';

const AlmoxarifadoPage: React.FC = () => {
  const { session, companies, dataLoading, userRole, userRoles, roleLoading } = useApp();
  const access = useAlmoxarifadoAccess();
  const matriz = useMemo(() => companies.find((c:any) => c.codigo === 'topac-matriz') || null, [companies]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<'almoxarifado'|'etiquetas'>('almoxarifado');

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

  if (view === 'etiquetas') return <EquipmentLabelGenerator onBack={() => setView('almoxarifado')} />;

  return <div className="bg-[#F7F8FC]">
    <div className="mx-auto w-full max-w-[1780px] px-5 pt-5 lg:px-8">
      <button onClick={() => setView('etiquetas')} className="flex w-full items-center justify-between rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-4 text-left shadow-sm transition hover:border-violet-400 hover:shadow-md">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-700 text-white"><Printer className="h-5 w-5"/></span><div><div className="font-black text-slate-950">CATÁLOGO DE EQUIPAMENTOS • GERAR ETIQUETA</div><div className="text-sm text-slate-500">Escolha o modelo, informe patrimônio e série e gere em 6x9, 9x13 ou 13x18 cm.</div></div></div><span className="text-2xl font-black text-violet-700">›</span>
      </button>
    </div>
    <AlmoxarifadoDesktopV2 />
  </div>;
};

export default AlmoxarifadoPage;
