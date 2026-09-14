import ContabilidadeDashboardPage from './ContabilidadeDashboardPage';
import ContabilidadePortalEmailBridge from './ContabilidadePortalEmailBridge';

type PortalKind = 'principal' | 'goiania';

export default function ContabilidadePortalShell({ portal }: { portal: PortalKind }) {
  return (
    <>
      <ContabilidadePortalEmailBridge />
      <ContabilidadeDashboardPage portal={portal} />
    </>
  );
}
