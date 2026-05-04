const FALLBACK_PUBLIC_ORIGIN = 'https://implantarhprpro.com';

export const getPublicOrigin = () => {
  if (typeof window === 'undefined') return FALLBACK_PUBLIC_ORIGIN;

  const { origin, hostname } = window.location;
  const isPreviewHost = hostname.includes('lovable.app') || hostname.includes('lovable.dev') || hostname === 'localhost';

  return isPreviewHost ? FALLBACK_PUBLIC_ORIGIN : origin;
};

const FRIENDLY_PATHS: Record<string, string> = {
  'op-sp': '/operacional/sp',
  'op-pg': '/operacional/praia-grande',
  'op-go': '/operacional/goiania',
  matriz: '/rh/sp',
  'filial-pg': '/rh/praia-grande',
  'filial-go': '/rh/goiania',
};

export const getAccessPathBySlug = (slug: string) => FRIENDLY_PATHS[slug] || `/acesso/${slug}`;

export const buildPublicAccessUrl = (slug: string) => `${getPublicOrigin()}${getAccessPathBySlug(slug)}`;