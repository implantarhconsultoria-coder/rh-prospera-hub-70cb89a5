import React from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSystemAccessControl } from '@/hooks/useSystemAccessControl';
import { SYSTEM_OWNER_USER_ID, systemAccessKeyForPath } from '@/lib/systemAccessControl';
import AccessRestrictedScreen from '@/components/AccessRestrictedScreen';
import StableLoading from '@/components/StableLoading';

const SystemAccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { session } = useApp();
  const { controls, loading } = useSystemAccessControl();

  const ownerMobile = isMobile && session?.user?.id === SYSTEM_OWNER_USER_ID;
  const mobileOwnerLoginEntry = isMobile && !session && ['/', '/login', '/index'].includes(location.pathname);

  if (ownerMobile || mobileOwnerLoginEntry) return <>{children}</>;
  if (loading) return <StableLoading label="Checking system access..." />;

  const moduleKey = systemAccessKeyForPath(location.pathname);
  const blocked = controls.global?.restricted || (moduleKey ? controls[moduleKey]?.restricted : false);

  if (blocked) return <AccessRestrictedScreen />;
  return <>{children}</>;
};

export default SystemAccessGate;
