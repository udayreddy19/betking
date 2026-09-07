/**
 * Centralized SEO / indexing policy for OddsYra.
 * Server + tests import this module. Client mirrors via src/config/siteSeo.js.
 *
 * PRIVATE_ACCESS_MODE: sportsbook stays available to allowlisted users only.
 * SEO_INDEXING_ENABLED: whether intentional public pages may be indexed.
 * Private/application routes are always noindex regardless of SEO_INDEXING_ENABLED.
 */

import {
  isPrivateAccessMode,
  isSeoIndexingEnabled,
} from '../privateAccessConfig.mjs';

const DEFAULT_SITE_URL = 'https://oddsyra.com';

/** Always noindex — auth, wallet, betting, admin, APIs, stubs. */
export const ALWAYS_NOINDEX_PREFIXES = Object.freeze([
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
]);

/** Public legal/support pages — indexable only when SEO indexing is on. */
export const PUBLIC_LEGAL_PATHS = Object.freeze([
  '/terms',
  '/privacy',
  '/help',
  '/responsible-gaming',
]);

/** Soft-product stubs that must never appear in sitemap. */
export const SITEMAP_EXCLUDED_PATHS = Object.freeze([
  '/casino',
  '/live-casino',
  '/fantasy',
  '/exchange',
  '/register',
  '/sports',
  '/live-betting',
  '/promotions',
  '/vip',
  '/srl',
  '/admin',
  '/wallet',
  '/bets',
  '/profile',
  '/api',
]);

export function getSiteUrl(env = process.env) {
  const raw = String(env.SITE_URL || env.FRONTEND_URL || env.APP_URL || DEFAULT_SITE_URL).trim();
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (u.protocol === 'http:') u.protocol = 'https:';
    u.hash = '';
    u.search = '';
    let host = u.host;
    if (u.hostname === 'www.oddsyra.com') {
      host = 'oddsyra.com';
    }
    return `https://${host}`.replace(/\/$/, '');
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function normalizePathname(pathname = '/') {
  let p = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p.toLowerCase() === p ? p : p; // keep as-is; paths are lowercase in app
}

export function canonicalUrlForPath(pathname, env = process.env) {
  const site = getSiteUrl(env);
  const path = normalizePathname(pathname);
  if (path === '/') return `${site}/`;
  return `${site}${path}`;
}

export function pathMatchesPrefix(pathname, prefixes) {
  const path = normalizePathname(pathname);
  return prefixes.some((prefix) => {
    if (prefix === '/') return path === '/';
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

/**
 * Whether this path is allowed into the public sitemap.
 */
export function isSitemapEligiblePath(pathname, env = process.env) {
  const path = normalizePathname(pathname);
  if (pathMatchesPrefix(path, SITEMAP_EXCLUDED_PATHS)) return false;
  if (pathMatchesPrefix(path, ALWAYS_NOINDEX_PREFIXES)) return false;

  const seoOn = typeof env.SEO_INDEXING_ENABLED === 'undefined'
    ? isSeoIndexingEnabled()
    : (env.SEO_INDEXING_ENABLED === 'true' || env.SEO_INDEXING_ENABLED === '1' || env.SEO_INDEXING_ENABLED === true);

  if (!seoOn) return false;

  const privateMode = typeof env.PRIVATE_ACCESS_MODE === 'undefined'
    ? isPrivateAccessMode()
    : !(env.PRIVATE_ACCESS_MODE === 'false' || env.PRIVATE_ACCESS_MODE === '0');

  if (privateMode) {
    return path === '/' || PUBLIC_LEGAL_PATHS.includes(path);
  }

  // Public mode: home + legal/support only (sportsbook still noindex until product SEO launch)
  return path === '/' || PUBLIC_LEGAL_PATHS.includes(path);
}

/**
 * robots meta content for a path.
 */
export function robotsDirectiveForPath(pathname, env = process.env) {
  const path = normalizePathname(pathname);
  const seoOn = typeof env.SEO_INDEXING_ENABLED === 'undefined'
    ? isSeoIndexingEnabled()
    : (env.SEO_INDEXING_ENABLED === 'true' || env.SEO_INDEXING_ENABLED === '1' || env.SEO_INDEXING_ENABLED === true);

  if (pathMatchesPrefix(path, ALWAYS_NOINDEX_PREFIXES)) {
    return 'noindex,nofollow,noarchive';
  }

  if (!seoOn) {
    return 'noindex,nofollow,noarchive';
  }

  if (path === '/' || PUBLIC_LEGAL_PATHS.includes(path)) {
    return 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
  }

  return 'noindex,nofollow,noarchive';
}

export function shouldSendXRobotsNoindex(pathname) {
  return robotsDirectiveForPath(pathname).startsWith('noindex');
}

/**
 * Build robots.txt body (dynamic).
 * Do not Disallow:/ — homepage must remain crawlable when indexing is enabled.
 * Prefer noindex over robots.txt blocking for private pages Google should "see" as noindex.
 */
export function buildRobotsTxt(env = process.env) {
  const site = getSiteUrl(env);
  const lines = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Prefer meta/X-Robots noindex for private app shells; Disallow only sensitive crawl sinks.',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /trader',
    'Disallow: /developer',
    'Disallow: /api-docs',
    'Disallow: /_oauth/',
    'Disallow: /wallet',
    'Disallow: /bets',
    'Disallow: /profile',
    'Disallow: /complete-profile',
    'Disallow: /verify-email',
    'Disallow: /reset-password',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ];
  return lines.join('\n');
}

export function listSitemapPaths(env = process.env) {
  const candidates = ['/', ...PUBLIC_LEGAL_PATHS];
  return candidates.filter((p) => isSitemapEligiblePath(p, env));
}

export function buildSitemapXml(env = process.env) {
  const paths = listSitemapPaths(env);
  const urls = paths.map((path) => {
    const loc = canonicalUrlForPath(path, env);
    const priority = path === '/' ? '1.0' : '0.4';
    const changefreq = path === '/' ? 'weekly' : 'yearly';
    return `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function getPublicSiteConfig(env = process.env) {
  return {
    siteUrl: getSiteUrl(env),
    privateAccessMode: isPrivateAccessMode(),
    registrationEnabled: (process.env.REGISTRATION_ENABLED === 'true' || process.env.REGISTRATION_ENABLED === '1'),
    seoIndexingEnabled: isSeoIndexingEnabled(),
    publicIndexablePaths: listSitemapPaths(env),
  };
}
