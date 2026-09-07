import {
  PRIVATE_ACCESS_MODE,
  SEO_INDEXING_ENABLED,
} from '../utils/privateAccessConfig';

export const SITE_NAME = 'OddsYra';
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://oddsyra.com').replace(/\/$/, '');
export const DEFAULT_OG_IMAGE = `${SITE_URL}/oddsyra-logo.png`;

/** Paths that must never be indexed (application / auth / sportsbook until SPORTSBOOK_SEO). */
export const ALWAYS_NOINDEX_PREFIXES = [
  '/admin',
  '/trader',
  '/developer',
  '/api-docs',
  '/api',
  '/wallet',
  '/deposit',
  '/bets',
  '/profile',
  '/complete-profile',
  '/verify-email',
  '/reset-password',
  '/_oauth',
  '/notifications',
  '/rewards',
  '/my-rewards',
  '/invite',
  '/support/tickets',
  '/sports',
  '/live-betting',
  '/register',
  '/promotions',
  '/casino',
  '/live-casino',
  '/fantasy',
  '/exchange',
  '/vip',
  '/srl',
  '/oddsyra-srl',
  '/iplsrl',
];

export const PUBLIC_LEGAL_PATHS = ['/terms', '/privacy', '/help', '/responsible-gaming'];

/** Neutral homepage meta while private-access / verification mode is on. */
export const PRIVATE_HOME_META = {
  title: 'OddsYra — Platform Updates & Verification',
  description:
    'OddsYra is currently undergoing platform updates and verification. Access is temporarily limited to authorized accounts. 18+ where applicable.',
  path: '/',
};

/** Public-mode homepage meta (used when PRIVATE_ACCESS_MODE is off). Avoids promotional false claims while sportsbook SEO is still gated. */
export const PUBLIC_HOME_META = {
  title: 'OddsYra',
  description:
    'OddsYra online platform. Account access, support, and policy information. 18+ where applicable.',
  path: '/',
};

export const DEFAULT_META = PRIVATE_ACCESS_MODE ? PRIVATE_HOME_META : PUBLIC_HOME_META;

export const ROUTE_META = {
  '/': DEFAULT_META,
  '/terms': {
    title: 'Terms & Conditions | OddsYra',
    description: 'OddsYra terms and conditions for platform use and accounts.',
  },
  '/privacy': {
    title: 'Privacy Policy | OddsYra',
    description: 'How OddsYra collects, uses, and protects personal data.',
  },
  '/responsible-gaming': {
    title: 'Responsible Gaming | OddsYra',
    description: 'Responsible gaming information, limits, and support resources.',
  },
  '/help': {
    title: 'Help & Support | OddsYra',
    description: 'Get help with OddsYra accounts and platform support.',
  },
  // Application routes keep titles for UX but robots force noindex via robotsForPath().
  '/sports': {
    title: 'Sports | OddsYra',
    description: 'OddsYra sports markets (authorized access).',
  },
  '/live-betting': {
    title: 'Live Betting | OddsYra',
    description: 'OddsYra in-play markets (authorized access).',
  },
  '/register': {
    title: 'Create Account | OddsYra',
    description: 'Account registration on OddsYra.',
  },
  '/wallet': {
    title: 'Wallet | OddsYra',
    description: 'OddsYra wallet (authorized access).',
  },
  '/bets': {
    title: 'My Bets | OddsYra',
    description: 'OddsYra bet history (authorized access).',
  },
  '/admin': {
    title: 'Admin | OddsYra',
    description: 'OddsYra admin console.',
  },
};

export function normalizePathname(pathname = '/') {
  let p = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function pathMatchesPrefix(pathname, prefixes) {
  const path = normalizePathname(pathname);
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isIndexablePath(pathname) {
  if (!SEO_INDEXING_ENABLED) return false;
  const path = normalizePathname(pathname);
  if (pathMatchesPrefix(path, ALWAYS_NOINDEX_PREFIXES)) return false;
  if (path === '/') return true;
  return PUBLIC_LEGAL_PATHS.includes(path);
}

export function robotsForPath(pathname) {
  if (isIndexablePath(pathname)) {
    return 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
  }
  return 'noindex,nofollow,noarchive';
}

export function canonicalForPath(pathname) {
  const path = normalizePathname(pathname);
  if (path === '/') return `${SITE_URL}/`;
  return `${SITE_URL}${path}`;
}

export function metaForPath(pathname) {
  const path = normalizePathname(pathname);
  const base = ROUTE_META[path] || {
    title: DEFAULT_META.title,
    description: DEFAULT_META.description,
  };
  return {
    title: base.title || DEFAULT_META.title,
    description: base.description || DEFAULT_META.description,
    path,
    robots: robotsForPath(path),
    canonical: canonicalForPath(path),
    indexable: isIndexablePath(path),
  };
}
