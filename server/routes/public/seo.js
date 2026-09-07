/**
 * Dynamic robots.txt + sitemap.xml + public site SEO config.
 * Served by Express so PRIVATE_ACCESS_MODE / SEO_INDEXING_ENABLED take effect without a frontend rebuild.
 */

import { Router } from 'express';
import {
  buildRobotsTxt,
  buildSitemapXml,
  getPublicSiteConfig,
  robotsDirectiveForPath,
  canonicalUrlForPath,
} from '../../../lib/seo/siteSeoPolicy.mjs';

const router = Router();

router.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(buildRobotsTxt());
});

router.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(buildSitemapXml());
});

router.get('/api/public/site-seo', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ success: true, data: getPublicSiteConfig() });
});

/** Optional helper for debugging canonical/robots resolution (not linked publicly). */
router.get('/api/public/seo-path', (req, res) => {
  const path = String(req.query.path || '/');
  res.json({
    success: true,
    data: {
      path,
      canonical: canonicalUrlForPath(path),
      robots: robotsDirectiveForPath(path),
    },
  });
});

export default router;
