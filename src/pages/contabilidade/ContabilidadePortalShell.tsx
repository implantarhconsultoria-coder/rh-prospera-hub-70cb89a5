import ContabilidadeDashboardPage from './ContabilidadeDashboardPage';
import ContabilidadePortalEmailBridge from './ContabilidadePortalEmailBridge';
import ContabilidadeFolhaFluxo from './ContabilidadeFolhaFluxo';

type PortalKind = 'principal' | 'goiania';

export default function ContabilidadePortalShell({ portal }: { portal: PortalKind }) {
  return (
    <>
      <ContabilidadePortalEmailBridge />
      <div className="px-4 pt-4 sm:px-6 lg:px-8">
        <ContabilidadeFolhaFluxo portal={portal} />
      </div>
      <ContabilidadeDashboardPage portal={portal} />
    </>
  );
}
