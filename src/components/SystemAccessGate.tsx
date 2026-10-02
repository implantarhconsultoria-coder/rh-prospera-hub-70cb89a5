import React from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSystemAccessControl } from '@/hooks/useSystemAccessControl';
import { SYSTEM_OWNER_USER_ID, systemAccessKeyForPath } from '@/lib/systemAccessControl';
import AccessRestrictedScreen from '@/components/AccessRestrictedScreen';

const SystemAccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { session } = useApp();
  const { controls, loading } = useSystemAccessControl();

  // Detecta o viewport imediatamente no primeiro render para o iPhone/PWA
  // nao passar pela tela intermediaria de verificacao.
  const mobileViewport = typeof window !== 'undefined'
    ? window.innerWidth < 768
    : isMobile;

  const ownerMobile = mobileViewport && session?.user?.id === SYSTEM_OWNER_USER_ID;
  const mobileOwnerLoginEntry = mobileViewport && !session && ['/', '/login', '/index'].includes(location.pathname);

  if (ownerMobile || mobileOwnerLoginEntry) return <>{children}</>;

  // O controle de restricao nunca deve travar a abertura normal do sistema.
  // Enquanto o estado e consultado, a plataforma segue carregando normalmente.
  if (loading) return <>{children}</>;

  const moduleKey = systemAccessKeyForPath(location.pathname);
  const blocked = controls.global?.restricted || (moduleKey ? controls[moduleKey]?.restricted : false);

  if (blocked) return <AccessRestrictedScreen />;
  return <>{children}</>;
};

export default SystemAccessGate;
