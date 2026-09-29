import { usePrivateModuleAccess } from '@/hooks/usePrivateModuleAccess';

export const useDeveloperMode = () => {
  const state = usePrivateModuleAccess('dev_superuser');
  return { developerMode: state.allowed, loadingDeveloperMode: state.loading };
};
