import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildRobotsTxt,
  buildSitemapXml,
  canonicalUrlForPath,
  getSiteUrl,
  isSitemapEligiblePath,
  listSitemapPaths,
  robotsDirectiveForPath,
  getPublicSiteConfig,
} from '../../lib/seo/siteSeoPolicy.mjs';

const ENV_KEYS = [
  'SITE_URL',
  'FRONTEND_URL',
  'APP_URL',
  'PRIVATE_ACCESS_MODE',
  'SEO_INDEXING_ENABLED',
  'REGISTRATION_ENABLED',
  'SPORTSBOOK_SEO_ENABLED',
];

describe('SEO indexing policy', () => {
  const original = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
    process.env.SITE_URL = 'https://oddsyra.com';
    process.env.PRIVATE_ACCESS_MODE = 'true';
    process.env.SEO_INDEXING_ENABLED = 'true';
    process.env.REGISTRATION_ENABLED = 'false';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('TEST 1: homepage is indexable when SEO indexing is enabled', () => {
    expect(robotsDirectiveForPath('/')).toMatch(/^index,follow/);
  });

  it('TEST 2: homepage has self-referencing canonical', () => {
    expect(canonicalUrlForPath('/')).toBe('https://oddsyra.com/');
    expect(canonicalUrlForPath('/?utm_source=google')).toBe('https://oddsyra.com/');
  });

  it('TEST 3: private dashboard-style paths are noindex', () => {
    for (const p of ['/sports', '/live-betting', '/wallet', '/bets', '/profile', '/rewards']) {
      expect(robotsDirectiveForPath(p), p).toBe('noindex,nofollow,noarchive');
    }
  });

  it('TEST 4: admin pages are noindex', () => {
    expect(robotsDirectiveForPath('/admin')).toBe('noindex,nofollow,noarchive');
    expect(robotsDirectiveForPath('/admin/trading')).toBe('noindex,nofollow,noarchive');
  });

  it('TEST 5: wallet pages are noindex', () => {
    expect(robotsDirectiveForPath('/wallet')).toBe('noindex,nofollow,noarchive');
    expect(robotsDirectiveForPath('/wallet/deposit')).toBe('noindex,nofollow,noarchive');
    expect(robotsDirectiveForPath('/deposit')).toBe('noindex,nofollow,noarchive');
  });

  it('TEST 6: bet pages are noindex', () => {
    expect(robotsDirectiveForPath('/bets')).toBe('noindex,nofollow,noarchive');
  });

  it('TEST 7: API routes are not in sitemap', () => {
    expect(isSitemapEligiblePath('/api/public/odds')).toBe(false);
    expect(listSitemapPaths().every((p) => !p.startsWith('/api'))).toBe(true);
  });

  it('TEST 8: admin routes are not in sitemap', () => {
    expect(isSitemapEligiblePath('/admin')).toBe(false);
    expect(buildSitemapXml()).not.toContain('/admin');
  });

  it('TEST 9: login/signup are not in sitemap', () => {
    expect(isSitemapEligiblePath('/register')).toBe(false);
    expect(buildSitemapXml()).not.toContain('/register');
    expect(buildSitemapXml()).not.toContain('/login');
  });

  it('TEST 10: sitemap contains only valid canonical public URLs', () => {
    const xml = buildSitemapXml();
    const paths = listSitemapPaths();
    expect(paths).toContain('/');
    expect(paths).toEqual(expect.arrayContaining(['/terms', '/privacy', '/help']));
    for (const p of paths) {
      expect(xml).toContain(canonicalUrlForPath(p));
    }
    expect(xml).not.toContain('/sports');
    expect(xml).not.toContain('/casino');
    expect(xml).not.toContain('/fantasy');
  });

  it('TEST 11: sitemap contains no localhost URLs', () => {
    expect(buildSitemapXml()).not.toMatch(/localhost|127\.0\.0\.1/i);
  });

  it('TEST 12: sitemap contains no staging URLs', () => {
    expect(buildSitemapXml()).not.toMatch(/staging|ngrok|vercel\.app/i);
  });

  it('TEST 13: sitemap contains no HTTP URLs when HTTPS is canonical', () => {
    const xml = buildSitemapXml();
    expect(xml).not.toMatch(/<loc>http:\/\//);
    expect(getSiteUrl({ SITE_URL: 'http://oddsyra.com' })).toMatch(/^https:\/\//);
  });

  it('TEST 14: tracking parameters do not create different canonical URLs', () => {
    expect(canonicalUrlForPath('/about?utm_source=x')).toBe(canonicalUrlForPath('/about'));
    expect(canonicalUrlForPath('/help?ref=1&affiliate=2')).toBe('https://oddsyra.com/help');
  });

  it('TEST 15: www host normalizes to apex SITE_URL', () => {
    expect(getSiteUrl({ SITE_URL: 'https://www.oddsyra.com' })).toBe('https://oddsyra.com');
  });

  it('TEST 16/17: public HTML shell has no secrets and uses verification copy', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).not.toMatch(/sk_live_|rzp_live_|JWT_SECRET|DATABASE_URL|service_role/i);
    expect(html).toContain('Platform Updates');
    expect(html).not.toMatch(/UPI deposits|welcome bonuses|live cricket betting/i);
    expect(html).toContain('name="robots" content="index,follow');
    expect(html).toContain('rel="canonical" href="https://oddsyra.com/"');
  });

  it('TEST 18: robots.txt is valid and does not blanket-disallow the site', () => {
    const body = buildRobotsTxt();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).not.toMatch(/^Disallow: \/$/m);
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /api/');
  });

  it('TEST 19: Sitemap URL in robots.txt matches production sitemap', () => {
    const body = buildRobotsTxt();
    expect(body).toContain('Sitemap: https://oddsyra.com/sitemap.xml');
  });

  it('TEST 20: public site config exposes private-access + seo flags', () => {
    const cfg = getPublicSiteConfig();
    expect(cfg.siteUrl).toBe('https://oddsyra.com');
    expect(cfg.privateAccessMode).toBe(true);
    expect(cfg.seoIndexingEnabled).toBe(true);
    expect(cfg.registrationEnabled).toBe(false);
    expect(cfg.publicIndexablePaths).toContain('/');
  });

  it('disables public indexing entirely when SEO_INDEXING_ENABLED=false', () => {
    process.env.SEO_INDEXING_ENABLED = 'false';
    expect(robotsDirectiveForPath('/')).toBe('noindex,nofollow,noarchive');
    expect(listSitemapPaths()).toEqual([]);
  });

  it('static public/robots.txt and sitemap.xml stay aligned with policy', () => {
    const robots = fs.readFileSync(path.resolve(process.cwd(), 'public/robots.txt'), 'utf8');
    const sitemap = fs.readFileSync(path.resolve(process.cwd(), 'public/sitemap.xml'), 'utf8');
    expect(robots).toContain('Sitemap: https://oddsyra.com/sitemap.xml');
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(sitemap).toContain('https://oddsyra.com/');
    expect(sitemap).not.toContain('/sports');
    expect(sitemap).not.toContain('/register');
  });
});
