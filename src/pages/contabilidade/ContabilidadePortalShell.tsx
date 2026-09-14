import ContabilidadeDashboardPage from './ContabilidadeDashboardPage';

type PortalKind = 'principal' | 'goiania';

export default function ContabilidadePortalShell({ portal }: { portal: PortalKind }) {
  return <ContabilidadeDashboardPage portal={portal} />;
}
