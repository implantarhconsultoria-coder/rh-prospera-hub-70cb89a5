const FALLBACK_PUBLIC_ORIGIN = 'https://implantarhprpro.com';

export const getPublicOrigin = () => {
  if (typeof window === 'undefined') return FALLBACK_PUBLIC_ORIGIN;

  const { origin, hostname } = window.location;
  const isPreviewHost = hostname.includes('lovable.app') || hostname.includes('lovable.dev') || hostname === 'localhost';

  return isPreviewHost ? FALLBACK_PUBLIC_ORIGIN : origin;
};

// Mapeamento de slugs para caminhos amigáveis. Mantém os 3 links únicos por
// região como rotas curtas: /sp, /pg, /go.
const FRIENDLY_PATHS: Record<string, string> = {
  sp: '/sp',
  pg: '/pg',
  go: '/go',
};

export const getAccessPathBySlug = (slug: string) => FRIENDLY_PATHS[slug] || `/acesso/${slug}`;

export const buildPublicAccessUrl = (slug: string) => `${getPublicOrigin()}${getAccessPathBySlug(slug)}`;
